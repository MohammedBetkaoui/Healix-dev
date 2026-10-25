// Volumes, ejection fraction and myocardial mass from the areas of a short-axis
// cine stack: pure arithmetic, no model, no image. ai-service/app/
// cardio_volume_measures.py written again in TypeScript, line for line: the
// physician moves ED or ES, leaves a slice out or gives the height and the weight,
// and the measures are recalculated here, with no new inference. Both are checked
// against the same cases (ai-service/tests/fixtures/cardio-volume/
// measures-cases.json, see volumetry-measures.spec.ts), and the answer of the
// service is checked against this module when it arrives (parseCardioVolumeAnalysis).
// The same order of additions as in Python, and nothing rounded: rounding is
// for display.
//
// Method
// - Volume of a structure at a phase: Simpson's method of discs, the sum over the
//   slices of (area in mm² x step between slices in mm) / 1000, in ml. The step is
//   the distance between the positions of successive slices, not the slice
//   thickness, which can leave a gap between slices.
// - ED and ES: the phases of the largest and of the smallest LV volume, unless the
//   physician chooses them.
// - LV: EDV, ESV, SV = EDV - ESV, EF = SV / EDV. RV: the same.
// - Mass of the LV myocardium: the MYO volume at ED x 1.05 g/ml.
// - Cardiac output: SV x heart rate, only when the heart rate is known.
// - Indexed values: divided by the body surface area (Mosteller), when known.
// - LVEF class: 2021 ESC Guidelines for the diagnosis and treatment of acute and
//   chronic heart failure (McDonagh TA et al., Eur Heart J 2021;42:3599-3726,
//   doi:10.1093/eurheartj/ehab368): reduced <= 40 %, mildly reduced 41-49 %,
//   preserved >= 50 %, read on the EF rounded to the unit, as it is reported.
//
// A measurement aid, to be checked by the physician. Never a diagnosis.

export const VOLUMETRY_STRUCTURES = ['LV', 'RV', 'MYO'] as const;
export type VolumetryStructure = (typeof VOLUMETRY_STRUCTURES)[number];

/** The areas of one slice, mm². */
export type SliceAreas = Record<VolumetryStructure, number>;
/** areas[phase][slice]. */
export type StackAreas = readonly (readonly SliceAreas[])[];

// Density of the myocardium, g/ml.
export const MYOCARDIAL_DENSITY_G_ML = 1.05;
// 1 ml = 1000 mm³.
export const MM3_PER_ML = 1000;

// ESC 2021 (see the header).
export const LVEF_REDUCED_MAX = 40;
export const LVEF_MILDLY_REDUCED_MAX = 49;
export const LVEF_CLASSES = ['reduced', 'mildlyReduced', 'preserved'] as const;
export type LvefClass = (typeof LVEF_CLASSES)[number];
export const LVEF_CLASS_SOURCE =
  'Recommandations ESC 2021 sur l’insuffisance cardiaque (McDonagh et al., Eur Heart J 2021;42:3599-3726, doi:10.1093/eurheartj/ehab368)';

export type Ventricle = {
  edvMl: number;
  esvMl: number;
  svMl: number;
  efPercent: number | null;
};

export type IndexedMeasures = {
  lvEdvMlM2: number;
  lvEsvMlM2: number;
  lvSvMlM2: number;
  rvEdvMlM2: number;
  rvEsvMlM2: number;
  lvMassGM2: number;
  cardiacIndexLMinM2: number | null;
};

export type VolumetryMeasures = {
  edPhase: number;
  esPhase: number;
  excludedSlices: number[];
  lv: Ventricle;
  rv: Ventricle;
  lvMassG: number;
  cardiacOutputLMin: number | null;
  heartRateBpm: number | null;
  bsaM2: number | null;
  indexed: IndexedMeasures | null;
  lvefClass: LvefClass | null;
  warnings: string[];
};

/** What the arguments of a calculation got wrong (the service answers 400). */
export class VolumetryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VolumetryInputError';
  }
}

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Body surface area in m² (Mosteller: sqrt(cm x kg / 3600)); null for a height or a weight that is not a positive finite number. */
export function mostellerBsa(
  heightCm: number,
  weightKg: number,
): number | null {
  if (!isPositiveFinite(heightCm) || !isPositiveFinite(weightKg)) return null;
  return Math.sqrt((heightCm * weightKg) / 3600);
}

/** reduced / mildlyReduced / preserved, on the EF rounded to the unit (half up); null without an EF. */
export function lvefClass(efPercent: number | null): LvefClass | null {
  if (efPercent === null || !Number.isFinite(efPercent)) return null;
  const reported = Math.floor(efPercent + 0.5);
  if (reported <= LVEF_REDUCED_MAX) return 'reduced';
  return reported <= LVEF_MILDLY_REDUCED_MAX ? 'mildlyReduced' : 'preserved';
}

function checkAreas(
  areas: StackAreas,
  spacing: number,
): { phases: number; slices: number } {
  if (areas.length === 0 || areas[0].length === 0) {
    throw new VolumetryInputError(
      'areas must hold at least one phase and one slice.',
    );
  }
  const slices = areas[0].length;
  if (areas.some((phase) => phase.length !== slices)) {
    throw new VolumetryInputError(
      'every phase must have the same number of slices.',
    );
  }
  if (!isPositiveFinite(spacing)) {
    throw new VolumetryInputError(
      'the step between slices must be a positive number of mm.',
    );
  }
  return { phases: areas.length, slices };
}

function checkSlices(excluded: readonly number[], slices: number): number[] {
  const unique = [...new Set(excluded.map((index) => Math.trunc(index)))].sort(
    (a, b) => a - b,
  );
  if (unique.some((index) => index < 0 || index >= slices)) {
    throw new VolumetryInputError('excluded slice out of range.');
  }
  return unique;
}

const inRange = (phase: number, phases: number) =>
  Number.isInteger(phase) && phase >= 0 && phase < phases;

/** Volume of `structure` at `phase`, in ml, without the excluded slices. */
export function structureVolumeMl(
  areas: StackAreas,
  spacing: number,
  phase: number,
  structure: VolumetryStructure,
  excluded: readonly number[] = [],
): number {
  const { phases, slices } = checkAreas(areas, spacing);
  const skipped = new Set(checkSlices(excluded, slices));
  if (!inRange(phase, phases)) {
    throw new VolumetryInputError('phase out of range.');
  }
  let total = 0;
  for (let index = 0; index < slices; index += 1) {
    if (!skipped.has(index)) {
      total += areas[phase][index][structure] * spacing;
    }
  }
  return total / MM3_PER_ML;
}

/** The LV volume at each phase, in ml. */
export function lvVolumeCurveMl(
  areas: StackAreas,
  spacing: number,
  excluded: readonly number[] = [],
): number[] {
  const { phases } = checkAreas(areas, spacing);
  return Array.from({ length: phases }, (_, phase) =>
    structureVolumeMl(areas, spacing, phase, 'LV', excluded),
  );
}

/** [ED, ES]: the first phase of the largest and of the smallest LV volume. */
export function automaticPhases(curve: readonly number[]): [number, number] {
  if (curve.length === 0) {
    throw new VolumetryInputError('the curve is empty.');
  }
  return [curve.indexOf(Math.max(...curve)), curve.indexOf(Math.min(...curve))];
}

function ventricle(
  areas: StackAreas,
  spacing: number,
  ed: number,
  es: number,
  excluded: readonly number[],
  structure: VolumetryStructure,
): Ventricle {
  const edv = structureVolumeMl(areas, spacing, ed, structure, excluded);
  const esv = structureVolumeMl(areas, spacing, es, structure, excluded);
  const stroke = edv - esv;
  return {
    edvMl: edv,
    efPercent: edv > 0 ? (stroke / edv) * 100 : null,
    esvMl: esv,
    svMl: stroke,
  };
}

/**
 * The measures of a cine stack. areas[phase][slice] = { LV, RV, MYO } in mm²;
 * spacing: the step between slices, mm; ed, es: phase indices; excludedSlices:
 * slices left out of every sum; bsa: m²; hr: beats per minute (null when unknown).
 */
export function computeMeasures(
  areas: StackAreas,
  spacing: number,
  ed: number,
  es: number,
  excludedSlices: readonly number[] = [],
  bsa: number | null = null,
  hr: number | null = null,
): VolumetryMeasures {
  const { phases, slices } = checkAreas(areas, spacing);
  if (!inRange(ed, phases)) {
    throw new VolumetryInputError('ed phase out of range.');
  }
  if (!inRange(es, phases)) {
    throw new VolumetryInputError('es phase out of range.');
  }
  const excluded = checkSlices(excludedSlices, slices);
  if (excluded.length === slices) {
    throw new VolumetryInputError('at least one slice must be kept.');
  }
  if (bsa !== null && !isPositiveFinite(bsa)) {
    throw new VolumetryInputError(
      'the body surface area must be a positive number of m².',
    );
  }
  if (hr !== null && !isPositiveFinite(hr)) {
    throw new VolumetryInputError(
      'the heart rate must be a positive number of beats per minute.',
    );
  }

  const lv = ventricle(areas, spacing, ed, es, excluded, 'LV');
  const rv = ventricle(areas, spacing, ed, es, excluded, 'RV');
  const mass =
    structureVolumeMl(areas, spacing, ed, 'MYO', excluded) *
    MYOCARDIAL_DENSITY_G_ML;
  const output = hr !== null ? (lv.svMl * hr) / 1000 : null;

  const indexed: IndexedMeasures | null =
    bsa === null
      ? null
      : {
          cardiacIndexLMinM2: output !== null ? output / bsa : null,
          lvEdvMlM2: lv.edvMl / bsa,
          lvEsvMlM2: lv.esvMl / bsa,
          lvMassGM2: mass / bsa,
          lvSvMlM2: lv.svMl / bsa,
          rvEdvMlM2: rv.edvMl / bsa,
          rvEsvMlM2: rv.esvMl / bsa,
        };

  const warnings: string[] = [];
  if (lv.efPercent !== null && lv.efPercent < 0) {
    warnings.push('es_volume_exceeds_ed');
  }
  return {
    bsaM2: bsa,
    cardiacOutputLMin: output,
    edPhase: ed,
    esPhase: es,
    excludedSlices: excluded,
    heartRateBpm: hr,
    indexed,
    lv,
    lvMassG: mass,
    lvefClass: lvefClass(lv.efPercent),
    rv,
    warnings,
  };
}
