// A cine volumetry as the backend shows it (volumetryResponse), for the specs: 5 phases of 6 slices
// (base to apex), ED the first phase and ES the fourth, an LVEF of 38 % (reduced) at the model's choice.
// The figures are those of backend/src/ai-analysis-runs/volumetry/cardio-volume.fixtures.ts.
import {
  type AiAnalysisRun,
  type AiVolumetry,
  type AiVolumetryMeasures,
} from "./ai-analyses.types";

export const modelMeasures: AiVolumetryMeasures = {
  bsaM2: 1.9,
  cardiacOutputLMin: 1.14912,
  edPhase: 0,
  esPhase: 3,
  excludedSlices: [],
  heartRateBpm: 70,
  indexed: {
    cardiacIndexLMinM2: 0.604800,
    lvEdvMlM2: 22.736842,
    lvEsvMlM2: 14.096842,
    lvMassGM2: 17.905263,
    lvSvMlM2: 8.64,
    rvEdvMlM2: 25.810526,
    rvEsvMlM2: 20.906526,
  },
  lv: { edvMl: 43.2, efPercent: 38, esvMl: 26.784, svMl: 16.416 },
  lvMassG: 34.02,
  lvefClass: "reduced",
  rv: { edvMl: 49.04, efPercent: 19, esvMl: 39.7224, svMl: 9.3176 },
  warnings: [],
};

const curve = [43.2, 34.56, 30.24, 26.784, 36.72];

const sliceAreas = (factor: number) =>
  [1500, 1300, 1050, 800, 500, 250].map((lv) => ({ LV: lv * factor, MYO: 800, RV: 900 }));

export function volumetryFixture(overrides: Partial<AiVolumetry> = {}): AiVolumetry {
  return {
    areas: { ed: sliceAreas(1), es: sliceAreas(0.62) },
    auto: { edPhase: 0, esPhase: 3, lvVolumeCurveMl: curve, measures: modelMeasures },
    bsaM2: 1.9,
    corrected: null,
    effective: {
      bsaM2: 1.9,
      bsaSource: "dicom",
      edPhase: 0,
      esPhase: 3,
      excludedSlices: [],
      lvVolumeCurveMl: curve,
      measures: modelMeasures,
    },
    heartRateBpm: 70,
    images: { edPhase: 0, esPhase: 3, slices: 6 },
    modified: false,
    phaseTimesMs: [0, 160, 320, 480, 640],
    phases: 5,
    pixelSpacingMm: [1.5, 1.5],
    sliceGapMm: 8,
    sliceOrderInferred: false,
    slices: [0, 8, 16, 24, 32, 40].map((positionMm, index) => ({ positionMm, stepMm: index === 5 ? null : 8 })),
    version: 1,
    warnings: [],
    ...overrides,
  };
}

/** The same stack once the physician moved ES to the second phase and left the base out. */
export function correctedVolumetryFixture(): AiVolumetry {
  const measures: AiVolumetryMeasures = {
    ...modelMeasures,
    esPhase: 1,
    excludedSlices: [0],
    lv: { edvMl: 31.2, efPercent: 20, esvMl: 24.96, svMl: 6.24 },
    lvMassG: 25.2,
    lvefClass: "reduced",
  };
  const base = volumetryFixture();
  return {
    ...base,
    corrected: {
      bsaM2: 1.9,
      bsaSource: "dicom",
      correctedAt: "2026-10-25T09:00:00.000Z",
      edPhase: 0,
      esPhase: 1,
      excludedSlices: [0],
      lvVolumeCurveMl: [31.2, 24.96, 22.68, 20.5, 27.4],
      measures,
    },
    effective: {
      bsaM2: 1.9,
      bsaSource: "dicom",
      edPhase: 0,
      esPhase: 1,
      excludedSlices: [0],
      lvVolumeCurveMl: [31.2, 24.96, 22.68, 20.5, 27.4],
      measures,
    },
    modified: true,
  };
}

export function cineRunFixture(overrides: Partial<AiAnalysisRun> = {}): AiAnalysisRun {
  return {
    classificationModelId: null,
    classificationWeightsSha256: null,
    clinicianImpression: null,
    createdAt: "2026-10-25T08:00:00.000Z",
    decidedAt: null,
    decidedById: null,
    decidedByName: null,
    decisionLabel: null,
    decisionLabels: null,
    decisionReason: null,
    decisionStatus: null,
    decisionThreshold: null,
    durationMs: 31_000,
    errorCode: null,
    hasMask: true,
    hasOverlay: false,
    hasSlice: false,
    hasTrace: false,
    id: "run-cine",
    magnification: null,
    malignancyScore: null,
    maskAreaPx: null,
    maskAreaRatio: null,
    modelDecision: null,
    modelLabel: null,
    modelLabels: null,
    nucleiFractions: null,
    patientId: "patient-1",
    pipeline: "cardio-volume-mri",
    predictions: { configSha256: "b".repeat(64) },
    reportNumber: null,
    requestedById: "user-1",
    segmentationModelId: "cardio-seg-acdc-unet-effb4",
    segmentationSkippedReason: null,
    segmentationWeightsSha256: "a".repeat(64),
    sourceDocumentId: "document-1",
    status: "SUCCEEDED",
    tileCount: null,
    ttaScores: null,
    updatedAt: "2026-10-25T08:00:31.000Z",
    volumetry: volumetryFixture(),
    ...overrides,
  };
}
