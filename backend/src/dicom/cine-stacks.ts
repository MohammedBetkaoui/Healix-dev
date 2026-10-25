import { sortInstancesByPosition } from './dicom-instance-order';
import { type OrthancInstance, type OrthancSeries } from './orthanc.client';

const MiB = 1024 * 1024;

// What the AI service accepts of a cine stack (ai-service/app/cardio_volume_input.py,
// AI_MAX_STACK_BYTES): a series that exceeds it is shown with its reason instead of
// being sent to be refused.
export const CINE_STACK_LIMITS = {
  maxBytes: 300 * MiB,
  maxFiles: 600,
  maxNormalAngleDeg: 5,
  maxPhases: 30,
  minPhases: 2,
  minSlices: 6,
  /** Two images less than this apart along the normal are the same slice position. */
  positionToleranceMm: 0.5,
} as const;

export type CineStackRefusal =
  | 'MIXED_ORIENTATION'
  | 'MULTIFRAME'
  | 'TOO_FEW_SLICES'
  | 'TOO_LARGE'
  | 'TOO_MANY_FILES'
  | 'TOO_MANY_PHASES'
  | 'UNEQUAL_PHASES';

/** A series of the study that holds a cine: several phases at each slice position. */
export type CineStack = {
  seriesId: string;
  seriesInstanceUid: string;
  number: number | null;
  description: string | null;
  instances: number;
  /** Distinct positions along the stack. */
  slices: number;
  /** Images at each position (the most common count when they differ). */
  phases: number;
  bytes: number;
  /** From the description of the series: true for "SA", false for a long axis view, null if it says nothing. */
  shortAxisLikely: boolean | null;
  /** Why the series cannot be sent to the analysis; null when it can. */
  refusal: CineStackRefusal | null;
  /** The images in the order they are sent: by position, then by number. */
  instanceIds: string[];
};

// Letters only delimit a word here: "_" does too ("cine_sa_retro").
const SHORT_AXIS =
  /(?<![a-z])(?:sax?|short[ _-]?axis|petit[ _-]?axe|pa)(?![a-z])/i;
const LONG_AXIS =
  /(?<![a-z])(?:[234][ _-]?ch(?:amber)?s?|lax|long[ _-]?axis|grand[ _-]?axe)(?![a-z])/i;

function shortAxisLikely(description: string | null): boolean | null {
  if (!description) return null;
  if (LONG_AXIS.test(description)) return false;
  return SHORT_AXIS.test(description) ? true : null;
}

type Vector = [number, number, number];

function normalOf(orientation: number[]): Vector {
  const [rx, ry, rz, cx, cy, cz] = orientation;
  const normal: Vector = [
    ry * cz - rz * cy,
    rz * cx - rx * cz,
    rx * cy - ry * cx,
  ];
  const length = Math.hypot(...normal);
  return length > 0
    ? [normal[0] / length, normal[1] / length, normal[2] / length]
    : normal;
}

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The cine stack a series holds, or null when it is not one: not an MRI, no geometry
 * to place its images, or a single image at each position (an ordinary stack).
 * A multi-frame series is a cine the analysis cannot read: it comes back refused.
 */
export function detectCineStack(
  series: OrthancSeries,
  instances: readonly OrthancInstance[],
): CineStack | null {
  if (series.modality !== 'MR' || instances.length === 0) return null;

  const base = {
    bytes: instances.reduce((sum, instance) => sum + instance.fileSize, 0),
    description: series.description,
    instances: instances.length,
    number: series.number,
    seriesId: series.id,
    seriesInstanceUid: series.seriesInstanceUid,
    shortAxisLikely: shortAxisLikely(series.description),
  };

  const sorted = sortInstancesByPosition(instances);
  if (sorted.some((instance) => instance.numberOfFrames > 1)) {
    return {
      ...base,
      instanceIds: sorted.map((instance) => instance.id),
      phases: 0,
      refusal: 'MULTIFRAME',
      slices: 0,
    };
  }

  const placed = sorted.every(
    (instance) =>
      instance.imagePositionPatient !== null &&
      instance.imageOrientationPatient !== null,
  );
  if (!placed) return null;

  const firstNormal = normalOf(sorted[0].imageOrientationPatient as number[]);
  const cosine = Math.cos(
    (CINE_STACK_LIMITS.maxNormalAngleDeg * Math.PI) / 180,
  );
  const sameNormal = sorted.every(
    (instance) =>
      dot(
        normalOf(instance.imageOrientationPatient as number[]),
        firstNormal,
      ) >= cosine,
  );

  // Consecutive images at the same place along the normal are one slice position
  // (the service groups them the same way).
  const groups: { first: number; count: number }[] = [];
  for (const instance of sorted) {
    const position = dot(instance.imagePositionPatient as Vector, firstNormal);
    const last = groups[groups.length - 1];
    if (
      last &&
      position - last.first <= CINE_STACK_LIMITS.positionToleranceMm
    ) {
      last.count += 1;
    } else {
      groups.push({ count: 1, first: position });
    }
  }

  const counts = groups.map((group) => group.count);
  const phases = Math.max(...counts);
  // An ordinary stack: one image per position.
  if (phases < CINE_STACK_LIMITS.minPhases) return null;

  const frequency = new Map<number, number>();
  for (const count of counts)
    frequency.set(count, (frequency.get(count) ?? 0) + 1);
  const usual = [...frequency.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  )[0][0];

  let refusal: CineStackRefusal | null = null;
  if (!sameNormal) refusal = 'MIXED_ORIENTATION';
  else if (instances.length > CINE_STACK_LIMITS.maxFiles)
    refusal = 'TOO_MANY_FILES';
  else if (base.bytes > CINE_STACK_LIMITS.maxBytes) refusal = 'TOO_LARGE';
  else if (groups.length < CINE_STACK_LIMITS.minSlices)
    refusal = 'TOO_FEW_SLICES';
  else if (usual > CINE_STACK_LIMITS.maxPhases) refusal = 'TOO_MANY_PHASES';
  else if (counts.some((count) => count !== usual)) refusal = 'UNEQUAL_PHASES';

  return {
    ...base,
    instanceIds: sorted.map((instance) => instance.id),
    phases: usual,
    refusal,
    slices: groups.length,
  };
}

/** Every cine stack of a study, the series in number order. */
export function detectCineStacks(
  series: readonly OrthancSeries[],
  instances: readonly OrthancInstance[],
): CineStack[] {
  const bySeries = new Map<string, OrthancInstance[]>();
  for (const instance of instances) {
    const list = bySeries.get(instance.parentSeries) ?? [];
    list.push(instance);
    bySeries.set(instance.parentSeries, list);
  }
  return series
    .map((item) => detectCineStack(item, bySeries.get(item.id) ?? []))
    .filter((stack): stack is CineStack => stack !== null)
    .sort(
      (a, b) =>
        (a.number ?? Number.POSITIVE_INFINITY) -
          (b.number ?? Number.POSITIVE_INFINITY) ||
        a.seriesId.localeCompare(b.seriesId),
    );
}

/** A cine stack as the study lists it: no instance identifiers (up to 600 of them). */
export type CineStackView = Omit<CineStack, 'instanceIds'>;

export function toCineStackView(stack: CineStack): CineStackView {
  return {
    bytes: stack.bytes,
    description: stack.description,
    instances: stack.instances,
    number: stack.number,
    phases: stack.phases,
    refusal: stack.refusal,
    seriesId: stack.seriesId,
    seriesInstanceUid: stack.seriesInstanceUid,
    shortAxisLikely: stack.shortAxisLikely,
    slices: stack.slices,
  };
}
