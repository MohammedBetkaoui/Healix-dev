// A cine volumetry as the AI service answers it, and as it is parsed, for the specs
// of the backend: 5 phases of 6 slices (base to apex), ED the first phase and ES the
// fourth, an LVEF of 38 % (reduced), made-up areas on a 256 x 256 slice, and 8x8
// PNG images (the parser reads the signature of a PNG, not its size).
import {
  type CardioVolumeAnalysisResult,
  type CardioVolumeWarning,
} from '../ai-service.client';
import {
  automaticPhases,
  computeMeasures,
  lvVolumeCurveMl,
  type SliceAreas,
} from './volumetry-measures';

export const CARDIO_VOLUME_MODEL_ID = 'cardio-seg-acdc-unet-effb4';
export const CARDIO_VOLUME_WEIGHTS = 'a'.repeat(64);
export const CARDIO_VOLUME_CARD = 'b'.repeat(64);
export const CARDIO_VOLUME_SLICES = 6;
export const CARDIO_VOLUME_GAP_MM = 8;

// An 8x8 one-channel PNG, valid (OpenCV): a class map with an LV (1) ringed by myocardium (3) and an RV (2) strip.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAAAAADhZOFXAAAAKklEQVQIHS3BgQ0AMAzCsIT/b4ap0mxBYIiciQE6MSWdmJJODNBJOJXvAdThDQk3z2HdAAAAAElFTkSuQmCC';
export const PNG = Buffer.from(PNG_BASE64, 'base64');

// Per slice, base to apex, at the largest phase.
const LV = [1500, 1300, 1050, 800, 500, 250];
const RV = [1700, 1500, 1200, 900, 550, 280];
const MYO = [900, 850, 800, 700, 500, 300];

/** Phase factors on the base areas: ED (1), then the ejection down to ES (0.62) and the filling. */
export const DEFAULT_FACTORS = [1, 0.8, 0.7, 0.62, 0.85] as const;

export function cardioVolumeAreas(
  factors: readonly number[] = DEFAULT_FACTORS,
): SliceAreas[][] {
  return factors.map((factor) =>
    LV.map((lv, index) => ({
      LV: lv * factor,
      MYO: MYO[index] * (2 - factor) * 0.5 + MYO[index] * 0.5,
      RV: RV[index] * (0.5 + factor / 2),
    })),
  );
}

export type CardioVolumeOptions = {
  /** The areas themselves, [phase][slice] (the slice count follows them); the made-up ones by default. */
  areas?: SliceAreas[][];
  bsaM2?: number | null;
  factors?: readonly number[];
  heartRateBpm?: number | null;
  warnings?: CardioVolumeWarning[];
};

/** The result, parsed, with measures computed the way the service computes them. */
export function cardioVolumeResult(
  options: CardioVolumeOptions = {},
): CardioVolumeAnalysisResult {
  const areas = options.areas ?? cardioVolumeAreas(options.factors);
  const phases = areas.length;
  const slices = areas[0].length;
  const curve = lvVolumeCurveMl(areas, CARDIO_VOLUME_GAP_MM);
  const [ed, es] = automaticPhases(curve);
  const bsaM2 = options.bsaM2 === undefined ? 1.9 : options.bsaM2;
  const heartRateBpm =
    options.heartRateBpm === undefined ? 70 : options.heartRateBpm;
  return {
    areasMm2: areas,
    bsaM2,
    configSha256: CARDIO_VOLUME_CARD,
    durationMs: 31_000,
    edPhase: ed,
    esPhase: es,
    heartRateBpm,
    imageHeight: 256,
    imageWidth: 256,
    labelMapsPng: {
      ed: Array.from({ length: slices }, () => PNG),
      es: Array.from({ length: slices }, () => PNG),
    },
    lvVolumeCurveMl: curve,
    measures: computeMeasures(
      areas,
      CARDIO_VOLUME_GAP_MM,
      ed,
      es,
      [],
      bsaM2,
      heartRateBpm,
    ),
    modelId: CARDIO_VOLUME_MODEL_ID,
    phaseTimesMs: Array.from({ length: phases }, (_, index) => index * 160),
    phases,
    pixelSpacingMm: [1.5, 1.5],
    sliceGapMm: CARDIO_VOLUME_GAP_MM,
    sliceOrderInferred: true,
    slices: Array.from({ length: slices }, (_, index) => ({
      positionMm: index * CARDIO_VOLUME_GAP_MM,
      stepMm: index === slices - 1 ? null : CARDIO_VOLUME_GAP_MM,
    })),
    slicesPng: {
      ed: Array.from({ length: slices }, () => PNG),
      es: Array.from({ length: slices }, () => PNG),
    },
    warnings: options.warnings ?? [],
    weightsSha256: CARDIO_VOLUME_WEIGHTS,
  };
}

/** The JSON body of the service's answer (what parseCardioVolumeAnalysis reads). */
export function cardioVolumeBody(
  options: CardioVolumeOptions = {},
): Record<string, unknown> {
  const result = cardioVolumeResult(options);
  const png = (list: Buffer[]) => list.map((item) => item.toString('base64'));
  return {
    ...result,
    labelMapsPng: {
      ed: png(result.labelMapsPng.ed),
      es: png(result.labelMapsPng.es),
    },
    slicesPng: {
      ed: png(result.slicesPng.ed),
      es: png(result.slicesPng.es),
    },
  };
}
