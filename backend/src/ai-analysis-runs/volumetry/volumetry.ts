// The volumetry of a cardiac cine run, as stored in AiAnalysisRun.volumetry: what
// the model measured (`auto`), and what the physician made of it (`corrected`),
// the measures being recalculated here, from the areas, with no new inference.
//
// Nothing here holds a height or a weight: the DICOM ones never left the AI service
// (only the body surface computed from them), and the ones the physician types are
// turned into a surface at once (Mosteller) and dropped. Nothing is rounded.
import { type CardioVolumeAnalysisResult } from '../ai-service.client';
import {
  automaticPhases,
  computeMeasures,
  lvVolumeCurveMl,
  mostellerBsa,
  type SliceAreas,
  type VolumetryMeasures,
  VolumetryInputError,
} from './volumetry-measures';

export const VOLUMETRY_VERSION = 1;

/** Where the body surface area used comes from. */
export type BsaSource = 'dicom' | 'manual';

export type VolumetryWarning = { code: string } & Record<
  string,
  number | string
>;

export type VolumetryProposal = {
  edPhase: number;
  esPhase: number;
  lvVolumeCurveMl: number[];
  measures: VolumetryMeasures;
};

export type VolumetryCorrected = {
  bsaM2: number | null;
  bsaSource: BsaSource | null;
  correctedAt: string;
  edPhase: number;
  esPhase: number;
  excludedSlices: number[];
  lvVolumeCurveMl: number[];
  measures: VolumetryMeasures;
};

export type Volumetry = {
  version: typeof VOLUMETRY_VERSION;
  phases: number;
  /** From the base (0) toward the apex. */
  slices: { positionMm: number; stepMm: number | null }[];
  /** The step between slices the volumes use, mm. */
  sliceGapMm: number;
  sliceOrderInferred: boolean;
  phaseTimesMs: number[] | null;
  pixelSpacingMm: [number, number];
  /** [phase][slice], mm². */
  areasMm2: SliceAreas[][];
  /** The body surface area the DICOM gave (from its height and weight), m²; null without them. */
  bsaM2: number | null;
  heartRateBpm: number | null;
  warnings: VolumetryWarning[];
  /** The phases whose images are stored (the model's ED and ES, one per slice). */
  images: { edPhase: number; esPhase: number; slices: number };
  /** What the model proposed. */
  auto: VolumetryProposal;
  /** What the physician made of it; null as long as they changed nothing. */
  corrected: VolumetryCorrected | null;
};

/** What a physician may change before deciding. */
export type VolumetryCorrection = {
  edPhase?: number;
  esPhase?: number;
  excludedSlices?: number[];
  /** Both or neither: they only give a body surface area, they are not kept. */
  heightCm?: number;
  weightKg?: number;
};

export function buildVolumetry(result: CardioVolumeAnalysisResult): Volumetry {
  return {
    areasMm2: result.areasMm2,
    auto: {
      edPhase: result.edPhase,
      esPhase: result.esPhase,
      lvVolumeCurveMl: result.lvVolumeCurveMl,
      measures: result.measures,
    },
    bsaM2: result.bsaM2,
    corrected: null,
    heartRateBpm: result.heartRateBpm,
    images: {
      edPhase: result.edPhase,
      esPhase: result.esPhase,
      slices: result.slices.length,
    },
    phaseTimesMs: result.phaseTimesMs,
    phases: result.phases,
    pixelSpacingMm: result.pixelSpacingMm,
    sliceGapMm: result.sliceGapMm,
    sliceOrderInferred: result.sliceOrderInferred,
    slices: result.slices,
    version: VOLUMETRY_VERSION,
    warnings: result.warnings,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored JSON as a Volumetry, or null when it is not one (a run of another chain, a damaged row). */
export function readVolumetry(value: unknown): Volumetry | null {
  if (
    !isRecord(value) ||
    value.version !== VOLUMETRY_VERSION ||
    !Array.isArray(value.areasMm2) ||
    !Array.isArray(value.slices) ||
    !isRecord(value.auto) ||
    !isRecord(value.auto.measures) ||
    !isRecord(value.images)
  ) {
    return null;
  }
  return value as unknown as Volumetry;
}

/** What is in force: the physician's version when they changed something, else the model's. */
export function effectiveState(volumetry: Volumetry): {
  bsaM2: number | null;
  bsaSource: BsaSource | null;
  edPhase: number;
  esPhase: number;
  excludedSlices: number[];
  lvVolumeCurveMl: number[];
  measures: VolumetryMeasures;
} {
  const { corrected } = volumetry;
  if (corrected) {
    return {
      bsaM2: corrected.bsaM2,
      bsaSource: corrected.bsaSource,
      edPhase: corrected.edPhase,
      esPhase: corrected.esPhase,
      excludedSlices: corrected.excludedSlices,
      lvVolumeCurveMl: corrected.lvVolumeCurveMl,
      measures: corrected.measures,
    };
  }
  return {
    bsaM2: volumetry.bsaM2,
    bsaSource: volumetry.bsaM2 === null ? null : 'dicom',
    edPhase: volumetry.auto.edPhase,
    esPhase: volumetry.auto.esPhase,
    excludedSlices: [],
    lvVolumeCurveMl: volumetry.auto.lvVolumeCurveMl,
    measures: volumetry.auto.measures,
  };
}

/** The measures in force (the physician's, or the model's). */
export const effectiveMeasures = (volumetry: Volumetry): VolumetryMeasures =>
  effectiveState(volumetry).measures;

/**
 * Whether the physician changed what the model measured: ED, ES or the slices
 * counted. A height and a weight only give the surface to index with, they do not
 * change what was measured.
 */
export function isModified(volumetry: Volumetry): boolean {
  const { corrected, auto } = volumetry;
  return (
    corrected !== null &&
    (corrected.edPhase !== auto.edPhase ||
      corrected.esPhase !== auto.esPhase ||
      corrected.excludedSlices.length > 0)
  );
}

/**
 * The volumetry with the physician's changes applied on top of what is in force,
 * the measures recalculated from the areas. The model's proposal is kept as it was.
 * VolumetryInputError for a phase or a slice that does not exist, every slice left
 * out, or a height without a weight (or the other way round).
 */
export function applyCorrection(
  volumetry: Volumetry,
  correction: VolumetryCorrection,
  now: Date = new Date(),
): Volumetry {
  const current = effectiveState(volumetry);

  const edPhase = correction.edPhase ?? current.edPhase;
  const esPhase = correction.esPhase ?? current.esPhase;
  const excludedSlices = correction.excludedSlices ?? current.excludedSlices;

  let { bsaM2, bsaSource } = current;
  const hasHeight = correction.heightCm !== undefined;
  const hasWeight = correction.weightKg !== undefined;
  if (hasHeight !== hasWeight) {
    throw new VolumetryInputError('the height and the weight go together.');
  }
  if (hasHeight && hasWeight) {
    const surface = mostellerBsa(
      correction.heightCm as number,
      correction.weightKg as number,
    );
    if (surface === null) {
      throw new VolumetryInputError(
        'the height and the weight must be positive numbers.',
      );
    }
    bsaM2 = surface;
    bsaSource = 'manual';
  }

  const measures = computeMeasures(
    volumetry.areasMm2,
    volumetry.sliceGapMm,
    edPhase,
    esPhase,
    excludedSlices,
    bsaM2,
    volumetry.heartRateBpm,
  );
  return {
    ...volumetry,
    corrected: {
      bsaM2,
      bsaSource,
      correctedAt: now.toISOString(),
      edPhase,
      esPhase,
      excludedSlices: measures.excludedSlices,
      lvVolumeCurveMl: lvVolumeCurveMl(
        volumetry.areasMm2,
        volumetry.sliceGapMm,
        measures.excludedSlices,
      ),
      measures,
    },
  };
}

/** The two phases whose images are kept: the model's end-diastole and end-systole. */
export const VOLUMETRY_IMAGE_PHASES = ['ed', 'es'] as const;
export type VolumetryImagePhase = (typeof VOLUMETRY_IMAGE_PHASES)[number];
export type VolumetryImageKind = 'label' | 'slice';

/** The file of one image in the folder of a run (patient-file-storage checks the same shape). */
export const volumetryImageName = (
  kind: VolumetryImageKind,
  phase: VolumetryImagePhase,
  slice: number,
): string => `${kind}-${phase}-${String(slice).padStart(3, '0')}.png`;

/**
 * What the API gives of a stored volumetry: everything the page draws, and no more.
 * The areas of every phase stay on the server (a long cine holds thousands of
 * them): only the ones of the ED and ES in force come out, for the slice grid.
 */
export function volumetryResponse(volumetry: Volumetry) {
  const state = effectiveState(volumetry);
  return {
    auto: volumetry.auto,
    areas: {
      ed: volumetry.areasMm2[state.edPhase] ?? [],
      es: volumetry.areasMm2[state.esPhase] ?? [],
    },
    bsaM2: volumetry.bsaM2,
    corrected: volumetry.corrected,
    effective: state,
    heartRateBpm: volumetry.heartRateBpm,
    images: volumetry.images,
    modified: isModified(volumetry),
    phaseTimesMs: volumetry.phaseTimesMs,
    phases: volumetry.phases,
    pixelSpacingMm: volumetry.pixelSpacingMm,
    sliceGapMm: volumetry.sliceGapMm,
    sliceOrderInferred: volumetry.sliceOrderInferred,
    slices: volumetry.slices,
    version: volumetry.version,
    warnings: volumetry.warnings,
  };
}

/** The automatic ED and ES of the areas, with the slices left out (what a "reset to automatic" lands on). */
export function automaticFor(
  volumetry: Volumetry,
  excludedSlices: readonly number[] = [],
): [number, number] {
  return automaticPhases(
    lvVolumeCurveMl(volumetry.areasMm2, volumetry.sliceGapMm, excludedSlices),
  );
}
