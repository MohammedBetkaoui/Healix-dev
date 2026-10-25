import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  automaticPhases,
  computeMeasures,
  lvVolumeCurveMl,
  type SliceAreas,
  VOLUMETRY_STRUCTURES,
  type VolumetryMeasures,
} from './volumetry/volumetry-measures';

// Client of the Python inference service (ai-service/). It only ever sends
// the bytes of an image or of an ECG signal file: no patient identity leaves
// the backend.

export const BRAIN_CLASSIFIER_ID = 'brain-efficientnetb4-tumor-classification';
export const BRAIN_LABELS = [
  'glioma',
  'meningioma',
  'notumor',
  'pituitary',
] as const;
export type BrainLabel = (typeof BRAIN_LABELS)[number];

// Imposed routing, re-checked on every response: only these two classes get
// a segmentation, each by its own model.
export const BRAIN_SEGMENTER_BY_CLASS: Partial<Record<BrainLabel, string>> = {
  meningioma: 'brain-unet-meningioma-segmentation',
  pituitary: 'brain-unet-pituitary-segmentation',
};

// Pathology (ai-service/app/pathology_models.py). The BreakHis output is a
// malignancy score compared with a calibrated threshold, never a probability.
export const BREAKHIS_CLASSIFIER_ID = 'pathology-breakhis-classification';
export const BREAKHIS_DECISION_THRESHOLD = 0.13;
export const BREAST_DECISIONS = ['benign', 'malignant'] as const;
export type BreastDecision = (typeof BREAST_DECISIONS)[number];
// Original, left-right flip, up-down flip, both: their mean is the score.
const BREAKHIS_VIEWS = 4;

export const PANNUKE_SEGMENTER_ID = 'pathology-unet-pannuke-segmentation';
export const NUCLEUS_TYPES = [
  'neoplastic',
  'inflammatory',
  'connective',
  'dead',
  'epithelial',
] as const;
export type NucleusType = (typeof NUCLEUS_TYPES)[number];

// Cardiology (ai-service/app/ecg_*.py): a 12-lead ECG, 5 superclasses of
// PTB-XL, multi-label (each class against its own threshold). The service
// reads them from its model card; a card with other classes or leads is
// another model, refused here.
export const CARDIO_ECG_MODEL_ID = 'cardio-ecg-resnet1d-ptbxl-superdiagnostic';
export const ECG_CLASSES = ['NORM', 'MI', 'STTC', 'CD', 'HYP'] as const;
export type EcgClass = (typeof ECG_CLASSES)[number];
export const ECG_LEADS = [
  'I',
  'II',
  'III',
  'aVR',
  'aVL',
  'aVF',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
] as const;
export type EcgLead = (typeof ECG_LEADS)[number];
export const ECG_UNITS = ['mV', 'uV'] as const;
export type EcgUnit = (typeof ECG_UNITS)[number];
export const ECG_MIN_SAMPLING_RATE = 100;
export const ECG_MAX_SAMPLING_RATE = 1000;
// The service accepts 10 to 60 s.
const ECG_MIN_DURATION_S = 10;
const ECG_MAX_DURATION_S = 60;
// A 10 s trace at 1 kHz at most.
const ECG_MAX_TRACE_SAMPLES = 10_000;

// Cardiac MRI segmentation (ai-service/app/cardio_seg_*.py): one short-axis
// cine slice, 3 structures by class index 1, 2, 3 (model card).
export const CARDIO_SEG_MODEL_ID = 'cardio-seg-acdc-unet-effb4';
export const CARDIO_SEG_STRUCTURES = ['LV', 'RV', 'MYO'] as const;
export type CardioSegStructure = (typeof CARDIO_SEG_STRUCTURES)[number];

export const AI_SERVICE_TIMEOUT_MS = 60_000;
// The cardiac volumetry segments every slice of every phase of a cine (up to 600
// images, about 130 ms each on a CPU): three times the usual wait. No job queue:
// beyond it the run is FAILED with SERVICE_TIMEOUT, as for any other chain.
export const AI_CARDIO_VOLUME_TIMEOUT_MS = 180_000;
const AI_SERVICE_TIMEOUT_BY_PIPELINE: Readonly<Record<string, number>> = {
  'cardio-volume-mri': AI_CARDIO_VOLUME_TIMEOUT_MS,
};
/** How long the backend waits for the service to answer a chain. */
export const aiServiceTimeoutMs = (pipeline: string): number =>
  AI_SERVICE_TIMEOUT_BY_PIPELINE[pipeline] ?? AI_SERVICE_TIMEOUT_MS;
const STATUS_TIMEOUT_MS = 5_000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export type BrainPrediction = { label: BrainLabel; probability: number };

export type BrainAnalysisResult = {
  classification: {
    modelId: string;
    weightsSha256: string;
    predictions: BrainPrediction[];
  };
  segmentation: {
    modelId: string;
    weightsSha256: string;
    maskPng: Buffer;
    areaPx: number;
    areaRatio: number;
  } | null;
  segmentationSkippedReason:
    | null
    | 'not_applicable_for_class'
    | 'model_not_loaded';
  imageWidth: number;
  imageHeight: number;
  durationMs: number;
};

export type BreastAnalysisResult = {
  modelId: string;
  weightsSha256: string;
  /** Mean of the 4 view scores, in [0, 1]: not calibrated, not a probability. */
  malignancyScore: number;
  threshold: number;
  decision: BreastDecision;
  /** Original, left-right flip, up-down flip, both flips. */
  views: number[];
  magnification: number;
  durationMs: number;
};

export type NucleiFractions = {
  /** Share of all the pixels. */
  background: number;
  /** Share of the nucleus pixels; every type null when there is none. */
  nucleusTypes: Record<NucleusType, number | null>;
};

export type NucleiAnalysisResult = {
  modelId: string;
  weightsSha256: string;
  /** One channel, the class index (0-5) of each pixel. */
  labelMapPng: Buffer;
  /** RGBA, each nucleus pixel in its type's colour, background transparent. */
  overlayPng: Buffer;
  classFractions: NucleiFractions;
  tiled: boolean;
  tileCount: number;
  imageWidth: number;
  imageHeight: number;
  durationMs: number;
};

export type EcgAnalysisResult = {
  modelId: string;
  weightsSha256: string;
  /** SHA-256 of the model card the service read (thresholds, filter, leads). */
  configSha256: string;
  /** Sigmoid of each class, averaged over the windows: independent, not summing to 1. */
  probabilities: Record<EcgClass, number>;
  thresholds: Record<EcgClass, number>;
  /** Classes at or above their threshold, by decreasing probability. */
  positive: EcgClass[];
  windows: number;
  inputSamplingRate: number;
  durationSeconds: number;
  /** The first 10 s, band-pass filtered, not normalized: what is drawn. */
  trace: {
    samplingRate: number;
    unit: 'mV';
    leads: Record<EcgLead, number[]>;
  };
  durationMs: number;
};

export type CardioSegArea = {
  pixels: number;
  /** null without a pixel spacing (a PNG/JPEG, or a DICOM without PixelSpacing). */
  areaMm2: number | null;
};

export type CardioSegAnalysisResult = {
  modelId: string;
  weightsSha256: string;
  /** SHA-256 of the model card the service read. */
  configSha256: string;
  /** One channel, the class index (0-3) of each pixel. */
  labelMapPng: Buffer;
  /** RGBA, each structure in its colour, background transparent. */
  overlayPng: Buffer;
  /** The slice as analysed, 8-bit grey: what the overlay is drawn on. */
  slicePng: Buffer;
  structures: Record<CardioSegStructure, CardioSegArea>;
  /** (row, column) in mm; null for an image. */
  pixelSpacingMm: [number, number] | null;
  noStructureFound: boolean;
  source: 'image' | 'dicom';
  imageWidth: number;
  imageHeight: number;
  durationMs: number;
};

export type CardioVolumeSlice = {
  /** From the base (0) toward the apex, mm. */
  positionMm: number;
  /** The distance to the next slice, mm; null for the last one. */
  stepMm: number | null;
};

/** What the service noticed without refusing: a code and short details. */
export type CardioVolumeWarning = { code: string } & Record<
  string,
  number | string
>;

/**
 * POST /analyze/cardio/volume-mri: a cine stack segmented slice by slice and phase
 * by phase. The areas are in mm² [phase][slice]; only the ED and ES phases of the
 * model come with images (one per slice).
 */
export type CardioVolumeAnalysisResult = {
  modelId: string;
  weightsSha256: string;
  configSha256: string;
  phases: number;
  slices: CardioVolumeSlice[];
  /** The step between slices the volumes use, mm. */
  sliceGapMm: number;
  sliceOrderInferred: boolean;
  phaseTimesMs: number[] | null;
  /** (row, column) in mm. */
  pixelSpacingMm: [number, number];
  imageWidth: number;
  imageHeight: number;
  areasMm2: SliceAreas[][];
  lvVolumeCurveMl: number[];
  edPhase: number;
  esPhase: number;
  /** From the DICOM height and weight, when both are there. */
  bsaM2: number | null;
  heartRateBpm: number | null;
  /** The service's measures, checked against ours: the ones stored are ours. */
  measures: VolumetryMeasures;
  labelMapsPng: { ed: Buffer[]; es: Buffer[] };
  slicesPng: { ed: Buffer[]; es: Buffer[] };
  warnings: CardioVolumeWarning[];
  durationMs: number;
};

// Why the service refused an MRI slice, beyond the image refusals.
export const CARDIO_SEG_REJECTIONS = [
  'CARDIO_SEG_NOT_GRAYSCALE',
  'CARDIO_SEG_MULTIFRAME',
] as const;
export type CardioSegRejection = (typeof CARDIO_SEG_REJECTIONS)[number];

// Why the service refused a cine stack (ai-service/app/cardio_volume_input.py).
export const CARDIO_VOLUME_REJECTIONS = [
  'CARDIO_VOLUME_UNSUPPORTED_FORMAT',
  'CARDIO_VOLUME_NO_DICOM',
  'CARDIO_VOLUME_UNSAFE_ARCHIVE',
  'CARDIO_VOLUME_NOT_MR',
  'CARDIO_VOLUME_MULTIFRAME',
  'CARDIO_VOLUME_NOT_GRAYSCALE',
  'CARDIO_VOLUME_UNDECODABLE',
  'CARDIO_VOLUME_MISSING_GEOMETRY',
  'CARDIO_VOLUME_MIXED_ORIENTATION',
  'CARDIO_VOLUME_MIXED_GEOMETRY',
  'CARDIO_VOLUME_UNEQUAL_PHASES',
  'CARDIO_VOLUME_TOO_FEW_SLICES',
  'CARDIO_VOLUME_TOO_FEW_PHASES',
  'CARDIO_VOLUME_TOO_MANY_PHASES',
  // 413 stack_too_large.
  'CARDIO_VOLUME_TOO_LARGE',
] as const;
export type CardioVolumeRejection = (typeof CARDIO_VOLUME_REJECTIONS)[number];

// Why the service refused an ECG file (ai-service/app/ecg_input.py).
export const ECG_REJECTIONS = [
  'ECG_UNSUPPORTED_FORMAT',
  'ECG_UNSAFE_ARCHIVE',
  'ECG_MISSING_LEADS',
  'ECG_SAMPLING_RATE_REQUIRED',
  'ECG_SAMPLING_RATE_INVALID',
  'ECG_UNIT_INVALID',
  'ECG_TOO_SHORT',
  'ECG_TOO_LONG',
  'ECG_NON_FINITE',
  'ECG_FLAT_LEAD',
  'ECG_AMPLITUDE_OUT_OF_RANGE',
  'ECG_FILE_TOO_LARGE',
] as const;
export type EcgRejection = (typeof ECG_REJECTIONS)[number];

export type AiServiceFailure =
  | EcgRejection
  | CardioSegRejection
  | CardioVolumeRejection
  | 'SERVICE_NOT_CONFIGURED'
  | 'SERVICE_UNAVAILABLE'
  | 'SERVICE_TIMEOUT'
  | 'MODEL_NOT_LOADED'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_TOO_SMALL'
  | 'IMAGE_DIMENSIONS_TOO_LARGE'
  | 'SERVICE_ERROR';

// Failures that mean "this image cannot be analysed" (REJECTED_INPUT), not
// "the service failed" (FAILED).
export const INPUT_REJECTIONS: readonly AiServiceFailure[] = [
  'INVALID_IMAGE',
  'IMAGE_TOO_LARGE',
  'IMAGE_TOO_SMALL',
  'IMAGE_DIMENSIONS_TOO_LARGE',
  ...ECG_REJECTIONS,
  ...CARDIO_SEG_REJECTIONS,
  ...CARDIO_VOLUME_REJECTIONS,
];

/** What a refusal says about the input (missing leads, duration...), never a signal value. */
export type RejectionDetails = Record<
  string,
  number | string | string[] | number[]
>;

export class AiServiceError extends Error {
  constructor(
    readonly code: AiServiceFailure,
    message: string = code,
    readonly details: RejectionDetails = {},
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export type AiModelStatus = {
  modelId: string;
  loaded: boolean;
  weightsSha256: string | null;
  error: string | null;
};

export type AiServiceStatus = {
  service:
    | 'available'
    | 'unavailable'
    | 'not_configured'
    | 'unauthorized'
    | 'error';
  models: AiModelStatus[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isFiniteBetween = (value: unknown, min: number, max: number) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const isPng = (data: Buffer) =>
  data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1;

const invalid = (detail: string) =>
  new AiServiceError(
    'SERVICE_ERROR',
    `Réponse du service IA invalide : ${detail}.`,
  );

/**
 * Validates POST /analyze/brain. Anything unexpected (labels, ordering,
 * routing, mask) is a service error, never stored as a result.
 */
export function parseBrainAnalysis(body: unknown): BrainAnalysisResult {
  if (!isRecord(body) || !isRecord(body.classification)) throw invalid('forme');

  const { classification } = body;
  if (classification.modelId !== BRAIN_CLASSIFIER_ID)
    throw invalid('modèle de classification');
  if (!isSha256(classification.weightsSha256))
    throw invalid('empreinte de classification');
  if (
    !Array.isArray(classification.predictions) ||
    classification.predictions.length !== BRAIN_LABELS.length
  ) {
    throw invalid('prédictions');
  }

  const predictions: BrainPrediction[] = classification.predictions.map(
    (prediction: unknown) => {
      if (
        !isRecord(prediction) ||
        !BRAIN_LABELS.includes(prediction.label as BrainLabel) ||
        !isFiniteBetween(prediction.probability, 0, 1)
      ) {
        throw invalid('prédiction');
      }
      return {
        label: prediction.label as BrainLabel,
        probability: prediction.probability as number,
      };
    },
  );
  if (
    new Set(predictions.map((prediction) => prediction.label)).size !==
    BRAIN_LABELS.length
  )
    throw invalid('classes');
  if (
    predictions.some(
      (prediction, index) =>
        index > 0 &&
        prediction.probability > predictions[index - 1].probability,
    )
  ) {
    throw invalid('ordre des prédictions');
  }
  const total = predictions.reduce(
    (sum, prediction) => sum + prediction.probability,
    0,
  );
  if (Math.abs(total - 1) > 1e-3) throw invalid('somme des probabilités');

  if (
    !isFiniteBetween(body.imageWidth, 1, Number.MAX_SAFE_INTEGER) ||
    !isFiniteBetween(body.imageHeight, 1, Number.MAX_SAFE_INTEGER)
  ) {
    throw invalid('dimensions');
  }
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  const expectedSegmenter = BRAIN_SEGMENTER_BY_CLASS[predictions[0].label];
  const skipped = body.segmentationSkippedReason;
  let segmentation: BrainAnalysisResult['segmentation'] = null;

  if (body.segmentation === null) {
    const expectedReason = expectedSegmenter
      ? 'model_not_loaded'
      : 'not_applicable_for_class';
    if (skipped !== expectedReason)
      throw invalid('raison d’absence de segmentation');
  } else {
    const raw = body.segmentation;
    if (!isRecord(raw) || skipped !== null || !expectedSegmenter)
      throw invalid('segmentation hors routage');
    if (raw.modelId !== expectedSegmenter)
      throw invalid('modèle de segmentation');
    if (!isSha256(raw.weightsSha256))
      throw invalid('empreinte de segmentation');
    if (typeof raw.maskPng !== 'string') throw invalid('masque');
    const maskPng = Buffer.from(raw.maskPng, 'base64');
    if (!isPng(maskPng)) throw invalid('masque non PNG');
    const pixels = (body.imageWidth as number) * (body.imageHeight as number);
    if (
      !Number.isInteger(raw.areaPx) ||
      !isFiniteBetween(raw.areaPx, 0, pixels)
    )
      throw invalid('surface');
    if (!isFiniteBetween(raw.areaRatio, 0, 1))
      throw invalid('ratio de surface');
    segmentation = {
      modelId: raw.modelId,
      weightsSha256: raw.weightsSha256,
      maskPng,
      areaPx: raw.areaPx as number,
      areaRatio: raw.areaRatio as number,
    };
  }

  return {
    classification: {
      modelId: classification.modelId,
      weightsSha256: classification.weightsSha256,
      predictions,
    },
    segmentation,
    segmentationSkippedReason:
      skipped as BrainAnalysisResult['segmentationSkippedReason'],
    imageWidth: body.imageWidth as number,
    imageHeight: body.imageHeight as number,
    durationMs: Math.round(body.durationMs as number),
  };
}

/**
 * Validates POST /analyze/pathology/breast-classification. The threshold must
 * be the calibrated one, the score the mean of the 4 views, the decision the
 * one the threshold gives, the magnification the one sent: anything else is a
 * service error, never stored.
 */
export function parseBreastAnalysis(
  body: unknown,
  magnification: number,
): BreastAnalysisResult {
  if (!isRecord(body)) throw invalid('forme');
  if (body.modelId !== BREAKHIS_CLASSIFIER_ID) throw invalid('modèle');
  if (!isSha256(body.weightsSha256)) throw invalid('empreinte');
  if (!isFiniteBetween(body.malignancyScore, 0, 1)) throw invalid('score');
  // Exact: another threshold means other inference settings.
  if (body.threshold !== BREAKHIS_DECISION_THRESHOLD) throw invalid('seuil');

  const views = body.views;
  if (
    !Array.isArray(views) ||
    views.length !== BREAKHIS_VIEWS ||
    !views.every((view) => isFiniteBetween(view, 0, 1))
  ) {
    throw invalid('vues');
  }
  const score = body.malignancyScore as number;
  const mean =
    (views as number[]).reduce((sum, view) => sum + view, 0) / BREAKHIS_VIEWS;
  if (Math.abs(mean - score) > 1e-6) throw invalid('moyenne des vues');

  const expected: BreastDecision =
    score >= BREAKHIS_DECISION_THRESHOLD ? 'malignant' : 'benign';
  if (body.decision !== expected) throw invalid('décision');
  if (body.magnification !== magnification) throw invalid('grossissement');
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  return {
    decision: expected,
    durationMs: Math.round(body.durationMs as number),
    magnification,
    malignancyScore: score,
    modelId: BREAKHIS_CLASSIFIER_ID,
    threshold: BREAKHIS_DECISION_THRESHOLD,
    views: [...(views as number[])],
    weightsSha256: body.weightsSha256,
  };
}

function parseNucleusTypes(value: unknown): NucleiFractions['nucleusTypes'] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== NUCLEUS_TYPES.length ||
    !NUCLEUS_TYPES.every((type) => type in value)
  ) {
    throw invalid('types de noyaux');
  }
  const shares = NUCLEUS_TYPES.map((type) => value[type]);
  // No nucleus pixel: every share is null.
  if (!shares.every((share) => share === null)) {
    if (!shares.every((share) => isFiniteBetween(share, 0, 1)))
      throw invalid('parts des types de noyaux');
    const total = (shares as number[]).reduce((sum, share) => sum + share, 0);
    if (Math.abs(total - 1) > 1e-3) throw invalid('somme des types de noyaux');
  }
  return Object.fromEntries(
    NUCLEUS_TYPES.map((type, index) => [type, shares[index]]),
  ) as NucleiFractions['nucleusTypes'];
}

/**
 * Validates POST /analyze/pathology/nuclei-segmentation: both images PNG,
 * pixel shares coherent, tiles consistent. No nucleus count is ever read.
 */
export function parseNucleiAnalysis(body: unknown): NucleiAnalysisResult {
  if (!isRecord(body)) throw invalid('forme');
  if (body.modelId !== PANNUKE_SEGMENTER_ID) throw invalid('modèle');
  if (!isSha256(body.weightsSha256)) throw invalid('empreinte');

  if (
    typeof body.labelMapPng !== 'string' ||
    typeof body.overlayPng !== 'string'
  ) {
    throw invalid('images');
  }
  const labelMapPng = Buffer.from(body.labelMapPng, 'base64');
  const overlayPng = Buffer.from(body.overlayPng, 'base64');
  if (!isPng(labelMapPng)) throw invalid('carte des classes non PNG');
  if (!isPng(overlayPng)) throw invalid('superposition non PNG');

  if (
    !isPositiveInteger(body.imageWidth) ||
    !isPositiveInteger(body.imageHeight)
  ) {
    throw invalid('dimensions');
  }

  const fractions = body.classFractions;
  if (!isRecord(fractions) || !isFiniteBetween(fractions.background, 0, 1))
    throw invalid('part du fond');
  const nucleusTypes = parseNucleusTypes(fractions.nucleusTypes);

  if (!isPositiveInteger(body.tileCount)) throw invalid('tuiles');
  if (body.tiled !== body.tileCount > 1) throw invalid('découpage en tuiles');
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  return {
    classFractions: {
      background: fractions.background as number,
      nucleusTypes,
    },
    durationMs: Math.round(body.durationMs as number),
    imageHeight: body.imageHeight,
    imageWidth: body.imageWidth,
    labelMapPng,
    modelId: PANNUKE_SEGMENTER_ID,
    overlayPng,
    tileCount: body.tileCount,
    tiled: body.tileCount > 1,
    weightsSha256: body.weightsSha256,
  };
}

// The pathology endpoints say why an image is refused. The backend checked
// the magnification before calling: the service refusing it is an error.
export function pathologyRejection(code: unknown): AiServiceFailure {
  switch (code) {
    case 'image_too_small':
      return 'IMAGE_TOO_SMALL';
    case 'image_dimensions_too_large':
      return 'IMAGE_DIMENSIONS_TOO_LARGE';
    case 'invalid_magnification':
      return 'SERVICE_ERROR';
    default:
      return 'INVALID_IMAGE';
  }
}

function parseClassRecord(
  value: unknown,
  what: string,
): Record<EcgClass, number> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== ECG_CLASSES.length ||
    !ECG_CLASSES.every((label) => isFiniteBetween(value[label], 0, 1))
  ) {
    throw invalid(what);
  }
  return Object.fromEntries(
    ECG_CLASSES.map((label) => [label, value[label] as number]),
  ) as Record<EcgClass, number>;
}

function parseTrace(value: unknown): EcgAnalysisResult['trace']['leads'] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== ECG_LEADS.length ||
    !ECG_LEADS.every((lead) => Array.isArray(value[lead]))
  ) {
    throw invalid('tracé');
  }
  const length = (value.I as unknown[]).length;
  if (length < 1 || length > ECG_MAX_TRACE_SAMPLES) throw invalid('tracé');
  for (const lead of ECG_LEADS) {
    const samples = value[lead] as unknown[];
    if (
      samples.length !== length ||
      !samples.every(
        (sample) => typeof sample === 'number' && Number.isFinite(sample),
      )
    ) {
      throw invalid('tracé');
    }
  }
  return Object.fromEntries(
    ECG_LEADS.map((lead) => [lead, [...(value[lead] as number[])]]),
  ) as EcgAnalysisResult['trace']['leads'];
}

/**
 * Validates POST /analyze/cardio/ecg: the 5 classes and 12 leads, the
 * positive classes exactly those at or above their threshold (by decreasing
 * probability), a 10 to 60 s input. Anything else is a service error.
 */
export function parseEcgAnalysis(body: unknown): EcgAnalysisResult {
  if (!isRecord(body)) throw invalid('forme');
  if (body.modelId !== CARDIO_ECG_MODEL_ID) throw invalid('modèle');
  if (!isSha256(body.weightsSha256)) throw invalid('empreinte');
  if (!isSha256(body.configSha256)) throw invalid('empreinte de la carte');

  const probabilities = parseClassRecord(body.probabilities, 'probabilités');
  const thresholds = parseClassRecord(body.thresholds, 'seuils');
  const expected = ECG_CLASSES.filter(
    (label) => probabilities[label] >= thresholds[label],
  );
  const positive: unknown = body.positive;
  if (
    !Array.isArray(positive) ||
    positive.length !== expected.length ||
    !expected.every((label) => positive.includes(label))
  ) {
    throw invalid('classes positives');
  }
  const sorted = positive as EcgClass[];
  if (
    sorted.some(
      (label, index) =>
        index > 0 && probabilities[label] > probabilities[sorted[index - 1]],
    )
  ) {
    throw invalid('ordre des classes positives');
  }

  if (!isPositiveInteger(body.windows)) throw invalid('fenêtres');
  if (
    !Number.isInteger(body.inputSamplingRate) ||
    !isFiniteBetween(
      body.inputSamplingRate,
      ECG_MIN_SAMPLING_RATE,
      ECG_MAX_SAMPLING_RATE,
    )
  ) {
    throw invalid("fréquence d'échantillonnage");
  }
  if (
    !isFiniteBetween(
      body.durationSeconds,
      ECG_MIN_DURATION_S,
      ECG_MAX_DURATION_S,
    )
  ) {
    throw invalid('durée du signal');
  }
  if (!isPositiveInteger(body.traceSamplingRate))
    throw invalid('fréquence du tracé');
  const leads = parseTrace(body.trace);
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  return {
    configSha256: body.configSha256,
    durationMs: Math.round(body.durationMs as number),
    durationSeconds: body.durationSeconds as number,
    inputSamplingRate: body.inputSamplingRate as number,
    modelId: CARDIO_ECG_MODEL_ID,
    positive: [...sorted],
    probabilities,
    thresholds,
    trace: { leads, samplingRate: body.traceSamplingRate, unit: 'mV' },
    weightsSha256: body.weightsSha256,
    windows: body.windows,
  };
}

/** The ECG refusals of the service (ecg_*): any other 422 is a service error. */
export function ecgRejection(code: unknown): AiServiceFailure {
  const upper = typeof code === 'string' ? code.toUpperCase() : '';
  return (ECG_REJECTIONS as readonly string[]).includes(upper)
    ? (upper as EcgRejection)
    : 'SERVICE_ERROR';
}

const DETAIL_KEYS = [
  'accepted',
  'channelSpread',
  'found',
  'frames',
  'maxAngleDeg',
  'modality',
  'phasesPerPosition',
  'toleranceDeg',
  'maxSide',
  'minSide',
  'duplicateLead',
  'durationSeconds',
  'leads',
  'line',
  'max',
  'maxBytes',
  'maxMillivolts',
  'maxSeconds',
  'maxShare',
  'min',
  'minSeconds',
  'missing',
  'reason',
] as const;
const isShortText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40;
const MAX_NUMBER_LIST = 100;

/** The known details of a refusal: numbers, short texts or short lists of them. */
export function rejectionDetails(body: unknown): RejectionDetails {
  const detail = isRecord(body) && isRecord(body.detail) ? body.detail : {};
  const details: RejectionDetails = {};
  for (const key of DETAIL_KEYS) {
    const value = detail[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      details[key] = value;
    } else if (isShortText(value)) {
      details[key] = value;
    } else if (
      Array.isArray(value) &&
      value.length <= ECG_LEADS.length &&
      value.every(isShortText)
    ) {
      details[key] = [...value];
    } else if (
      Array.isArray(value) &&
      value.length <= MAX_NUMBER_LIST &&
      value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ) {
      // The number of phases at each position, for instance.
      details[key] = [...(value as number[])];
    }
  }
  return details;
}

/** The MRI slice refusals (cardio_seg_*), then the image ones. */
export function cardioSegRejection(code: unknown): AiServiceFailure {
  const upper = typeof code === 'string' ? code.toUpperCase() : '';
  return (CARDIO_SEG_REJECTIONS as readonly string[]).includes(upper)
    ? (upper as CardioSegRejection)
    : pathologyRejection(code);
}

function parseArea(value: unknown, withSpacing: boolean): CardioSegArea {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.pixels) ||
    (value.pixels as number) < 0 ||
    (withSpacing
      ? !isFiniteBetween(value.areaMm2, 0, Number.MAX_SAFE_INTEGER)
      : value.areaMm2 !== null)
  ) {
    throw invalid('surface');
  }
  return {
    areaMm2: withSpacing ? (value.areaMm2 as number) : null,
    pixels: value.pixels as number,
  };
}

/**
 * Validates POST /analyze/cardio/segmentation-mri: the 3 structures, mm²
 * exactly when a pixel spacing is given, the pixels within the slice, the
 * three images PNG. Anything else is a service error, never stored.
 */
export function parseCardioSegAnalysis(body: unknown): CardioSegAnalysisResult {
  if (!isRecord(body)) throw invalid('forme');
  if (body.modelId !== CARDIO_SEG_MODEL_ID) throw invalid('modèle');
  if (!isSha256(body.weightsSha256)) throw invalid('empreinte');
  if (!isSha256(body.configSha256)) throw invalid('empreinte de la carte');

  const images = [body.labelMapPng, body.overlayPng, body.slicePng];
  if (!images.every((image) => typeof image === 'string'))
    throw invalid('images');
  const [labelMapPng, overlayPng, slicePng] = images.map((image) =>
    Buffer.from(image, 'base64'),
  );
  if (![labelMapPng, overlayPng, slicePng].every(isPng))
    throw invalid('images non PNG');

  if (
    !isPositiveInteger(body.imageWidth) ||
    !isPositiveInteger(body.imageHeight)
  ) {
    throw invalid('dimensions');
  }
  const spacing: unknown = body.pixelSpacingMm;
  if (
    spacing !== null &&
    !(
      Array.isArray(spacing) &&
      spacing.length === 2 &&
      spacing.every(
        (value) => isFiniteBetween(value, 0, 1000) && (value as number) > 0,
      )
    )
  ) {
    throw invalid('espacement des pixels');
  }
  const rawStructures = body.structures;
  if (
    !isRecord(rawStructures) ||
    Object.keys(rawStructures).length !== CARDIO_SEG_STRUCTURES.length
  ) {
    throw invalid('structures');
  }
  const structures = Object.fromEntries(
    CARDIO_SEG_STRUCTURES.map((name) => [
      name,
      parseArea(rawStructures[name], spacing !== null),
    ]),
  ) as Record<CardioSegStructure, CardioSegArea>;
  const total = CARDIO_SEG_STRUCTURES.reduce(
    (sum, name) => sum + structures[name].pixels,
    0,
  );
  if (total > body.imageWidth * body.imageHeight) throw invalid('surfaces');
  if (body.noStructureFound !== (total === 0))
    throw invalid('absence de structure');
  if (body.source !== 'image' && body.source !== 'dicom')
    throw invalid('source');
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  return {
    configSha256: body.configSha256,
    durationMs: Math.round(body.durationMs as number),
    imageHeight: body.imageHeight,
    imageWidth: body.imageWidth,
    labelMapPng,
    modelId: CARDIO_SEG_MODEL_ID,
    noStructureFound: total === 0,
    overlayPng,
    pixelSpacingMm: spacing === null ? null : [spacing[0], spacing[1]],
    slicePng,
    source: body.source,
    structures,
    weightsSha256: body.weightsSha256,
  };
}

/** The cine stack refusals (cardio_volume_*), then the image ones. */
export function cardioVolumeRejection(code: unknown): AiServiceFailure {
  const upper = typeof code === 'string' ? code.toUpperCase() : '';
  return (CARDIO_VOLUME_REJECTIONS as readonly string[]).includes(upper)
    ? (upper as CardioVolumeRejection)
    : pathologyRejection(code);
}

// A cine holds up to 600 images over at most 30 phases: a few dozen slices.
const MAX_VOLUME_PHASES = 30;
const MIN_VOLUME_SLICES = 6;
const MAX_VOLUME_SLICES = 100;
const MAX_VOLUME_WARNINGS = 20;
// What the service computed and what we compute again must agree this closely.
const MEASURES_TOLERANCE = 1e-6;

function parsePngList(value: unknown, count: number, what: string): Buffer[] {
  if (!Array.isArray(value) || value.length !== count) throw invalid(what);
  return value.map((item) => {
    if (typeof item !== 'string') throw invalid(what);
    const png = Buffer.from(item, 'base64');
    if (!isPng(png)) throw invalid(`${what} non PNG`);
    return png;
  });
}

function parseVolumeWarnings(value: unknown): CardioVolumeWarning[] {
  if (!Array.isArray(value) || value.length > MAX_VOLUME_WARNINGS) {
    throw invalid('avertissements');
  }
  return value.map((item) => {
    if (!isRecord(item) || typeof item.code !== 'string' || item.code === '') {
      throw invalid('avertissement');
    }
    const warning: CardioVolumeWarning = { code: item.code.slice(0, 60) };
    for (const [key, detail] of Object.entries(item)) {
      if (key === 'code') continue;
      if (typeof detail === 'number' && Number.isFinite(detail)) {
        warning[key] = detail;
      } else if (isShortText(detail)) {
        warning[key] = detail;
      }
    }
    return warning;
  });
}

// Every number of `actual` within the tolerance of the one of `expected`, the rest equal.
function sameMeasures(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') {
    return (
      typeof actual === 'number' &&
      Math.abs(actual - expected) <=
        MEASURES_TOLERANCE * Math.max(1, Math.abs(expected))
    );
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => sameMeasures(actual[index], item))
    );
  }
  if (isRecord(expected)) {
    return (
      isRecord(actual) &&
      Object.keys(actual).length === Object.keys(expected).length &&
      Object.entries(expected).every(([key, item]) =>
        sameMeasures(actual[key], item),
      )
    );
  }
  return actual === expected;
}

/**
 * Validates POST /analyze/cardio/volume-mri: the shapes, the areas, the images
 * (PNG, one per slice, ED and ES only), the curve and ED / ES the areas give, and
 * the measures, which must be the ones this backend computes from the same areas
 * (volumetry-measures.ts): the two implementations disagreeing is a service error,
 * never a result a physician would read. The measures kept are ours.
 */
export function parseCardioVolumeAnalysis(
  body: unknown,
): CardioVolumeAnalysisResult {
  if (!isRecord(body)) throw invalid('forme');
  if (body.modelId !== CARDIO_SEG_MODEL_ID) throw invalid('modèle');
  if (!isSha256(body.weightsSha256)) throw invalid('empreinte');
  if (!isSha256(body.configSha256)) throw invalid('empreinte de la carte');

  const { phases } = body;
  if (
    !Number.isInteger(phases) ||
    (phases as number) < 2 ||
    (phases as number) > MAX_VOLUME_PHASES
  ) {
    throw invalid('phases');
  }
  const phaseCount = phases as number;
  if (
    !isPositiveInteger(body.imageWidth) ||
    !isPositiveInteger(body.imageHeight)
  ) {
    throw invalid('dimensions');
  }
  const spacing: unknown = body.pixelSpacingMm;
  if (
    !(
      Array.isArray(spacing) &&
      spacing.length === 2 &&
      spacing.every(
        (value) => isFiniteBetween(value, 0, 1000) && (value as number) > 0,
      )
    )
  ) {
    throw invalid('espacement des pixels');
  }
  const pixelMm2 = (spacing[0] as number) * (spacing[1] as number);

  const rawSlices: unknown = body.slices;
  if (
    !Array.isArray(rawSlices) ||
    rawSlices.length < MIN_VOLUME_SLICES ||
    rawSlices.length > MAX_VOLUME_SLICES
  ) {
    throw invalid('coupes');
  }
  const slices = rawSlices.map((item, index): CardioVolumeSlice => {
    const last = index === rawSlices.length - 1;
    if (
      !isRecord(item) ||
      !isFiniteBetween(item.positionMm, 0, 100_000) ||
      (last
        ? item.stepMm !== null
        : !isFiniteBetween(item.stepMm, 0, 1000) ||
          (item.stepMm as number) <= 0)
    ) {
      throw invalid('coupe');
    }
    return {
      positionMm: item.positionMm as number,
      stepMm: last ? null : (item.stepMm as number),
    };
  });
  const sliceCount = slices.length;
  const rawGap: unknown = body.sliceGapMm;
  if (!isFiniteBetween(rawGap, 0, 1000) || (rawGap as number) <= 0) {
    throw invalid('pas entre les coupes');
  }
  const gap = rawGap as number;
  if (typeof body.sliceOrderInferred !== 'boolean') {
    throw invalid('ordre des coupes');
  }

  let phaseTimesMs: number[] | null = null;
  if (body.phaseTimesMs !== null && body.phaseTimesMs !== undefined) {
    const times: unknown = body.phaseTimesMs;
    if (
      !Array.isArray(times) ||
      times.length !== phaseCount ||
      !times.every((value) => isFiniteBetween(value, 0, 600_000))
    ) {
      throw invalid('instants des phases');
    }
    phaseTimesMs = [...(times as number[])];
  }

  const rawAreas: unknown = body.areasMm2;
  if (!Array.isArray(rawAreas) || rawAreas.length !== phaseCount) {
    throw invalid('surfaces');
  }
  const maxArea = body.imageWidth * body.imageHeight * pixelMm2;
  const areas = rawAreas.map((phase: unknown): SliceAreas[] => {
    if (!Array.isArray(phase) || phase.length !== sliceCount) {
      throw invalid('surfaces');
    }
    return phase.map((cell: unknown): SliceAreas => {
      if (
        !isRecord(cell) ||
        Object.keys(cell).length !== VOLUMETRY_STRUCTURES.length ||
        !VOLUMETRY_STRUCTURES.every((name) =>
          isFiniteBetween(cell[name], 0, maxArea * 1.0001),
        )
      ) {
        throw invalid('surface');
      }
      return {
        LV: cell.LV as number,
        MYO: cell.MYO as number,
        RV: cell.RV as number,
      };
    });
  });

  const curve = lvVolumeCurveMl(areas, gap);
  if (!sameMeasures(body.lvVolumeCurveMl, curve)) throw invalid('courbe');
  const [ed, es] = automaticPhases(curve);
  if (body.edPhase !== ed || body.esPhase !== es) throw invalid('ED et ES');

  const bsa: unknown = body.bsaM2;
  if (bsa !== null && !(isFiniteBetween(bsa, 0.1, 6) && (bsa as number) > 0)) {
    throw invalid('surface corporelle');
  }
  const heartRate: unknown = body.heartRateBpm;
  if (heartRate !== null && !isFiniteBetween(heartRate, 20, 300)) {
    throw invalid('fréquence cardiaque');
  }

  const measures = computeMeasures(
    areas,
    gap,
    ed,
    es,
    [],
    bsa as number | null,
    heartRate as number | null,
  );
  if (!sameMeasures(body.measures, measures)) throw invalid('mesures');

  const labelMaps: unknown = body.labelMapsPng;
  const shown: unknown = body.slicesPng;
  if (!isRecord(labelMaps) || !isRecord(shown)) throw invalid('images');
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER)) {
    throw invalid('durée');
  }

  return {
    areasMm2: areas,
    bsaM2: bsa as number | null,
    configSha256: body.configSha256,
    durationMs: Math.round(body.durationMs as number),
    edPhase: ed,
    esPhase: es,
    heartRateBpm: heartRate as number | null,
    imageHeight: body.imageHeight,
    imageWidth: body.imageWidth,
    labelMapsPng: {
      ed: parsePngList(labelMaps.ed, sliceCount, 'cartes ED'),
      es: parsePngList(labelMaps.es, sliceCount, 'cartes ES'),
    },
    lvVolumeCurveMl: curve,
    measures,
    modelId: CARDIO_SEG_MODEL_ID,
    phaseTimesMs,
    phases: phaseCount,
    pixelSpacingMm: [spacing[0] as number, spacing[1] as number],
    sliceGapMm: gap,
    sliceOrderInferred: body.sliceOrderInferred,
    slices,
    slicesPng: {
      ed: parsePngList(shown.ed, sliceCount, 'coupes ED'),
      es: parsePngList(shown.es, sliceCount, 'coupes ES'),
    },
    warnings: parseVolumeWarnings(body.warnings),
    weightsSha256: body.weightsSha256,
  };
}

const detailCode = (body: unknown): unknown =>
  isRecord(body) && isRecord(body.detail) ? body.detail.code : undefined;

@Injectable()
export class AiServiceClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(configService: ConfigService) {
    this.baseUrl = (
      configService.get<string>('AI_SERVICE_URL') ?? 'http://127.0.0.1:8001'
    ).replace(/\/+$/, '');
    this.token = configService.get<string>('AI_SERVICE_TOKEN') ?? '';
  }

  async analyzeBrain(
    image: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<BrainAnalysisResult> {
    // Any 422 of /analyze/brain is an image the service could not decode.
    const body = await this.postFile(
      '/analyze/brain',
      { data: image, fileName, mimeType },
      {},
      () => 'INVALID_IMAGE',
    );
    return parseBrainAnalysis(body);
  }

  async analyzeBreast(
    image: Buffer,
    fileName: string,
    mimeType: string,
    magnification: number,
  ): Promise<BreastAnalysisResult> {
    const body = await this.postFile(
      '/analyze/pathology/breast-classification',
      { data: image, fileName, mimeType },
      { magnification: String(magnification) },
      pathologyRejection,
    );
    return parseBreastAnalysis(body, magnification);
  }

  async analyzeNuclei(
    image: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<NucleiAnalysisResult> {
    const body = await this.postFile(
      '/analyze/pathology/nuclei-segmentation',
      { data: image, fileName, mimeType },
      {},
      pathologyRejection,
    );
    return parseNucleiAnalysis(body);
  }

  /** One short-axis MRI slice: PNG/JPEG, or a single-frame DICOM. */
  async analyzeCardioSeg(
    image: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<CardioSegAnalysisResult> {
    const body = await this.postFile(
      '/analyze/cardio/segmentation-mri',
      { data: image, fileName, mimeType },
      {},
      cardioSegRejection,
    );
    return parseCardioSegAnalysis(body);
  }

  /**
   * A short-axis cine stack: a .zip of single-frame DICOM files (multipart field
   * "stack"), a whole cardiac cycle. It waits up to AI_CARDIO_VOLUME_TIMEOUT_MS.
   */
  async analyzeCardioVolume(
    zip: Buffer,
    fileName: string,
  ): Promise<CardioVolumeAnalysisResult> {
    const body = await this.postFile(
      '/analyze/cardio/volume-mri',
      { data: zip, field: 'stack', fileName, mimeType: 'application/zip' },
      {},
      cardioVolumeRejection,
      'CARDIO_VOLUME_TOO_LARGE',
      AI_CARDIO_VOLUME_TIMEOUT_MS,
    );
    return parseCardioVolumeAnalysis(body);
  }

  /**
   * A 12-lead ECG file (multipart field "file"). samplingRate (Hz) and unit
   * are those the physician gave for a CSV/TXT; a WFDB header has its own.
   */
  async analyzeEcg(
    data: Buffer,
    fileName: string,
    mimeType: string,
    options: { samplingRate?: number; unit?: EcgUnit } = {},
  ): Promise<EcgAnalysisResult> {
    const fields: Record<string, string> = {};
    if (options.samplingRate !== undefined)
      fields.samplingRate = String(options.samplingRate);
    if (options.unit !== undefined) fields.unit = options.unit;
    const body = await this.postFile(
      '/analyze/cardio/ecg',
      { data, field: 'file', fileName, mimeType },
      fields,
      ecgRejection,
      'ECG_FILE_TOO_LARGE',
    );
    return parseEcgAnalysis(body);
  }

  /**
   * Sends one file (multipart field "image" unless told otherwise, plus text
   * fields) and returns the JSON body of a 2xx answer. Errors: 413
   * `tooLarge`; 422 as `rejection` reads detail.code, with its details; 503
   * MODEL_NOT_LOADED or SERVICE_UNAVAILABLE; any other status SERVICE_ERROR.
   */
  private async postFile(
    path: string,
    file: { data: Buffer; fileName: string; mimeType: string; field?: string },
    fields: Record<string, string>,
    rejection: (code: unknown) => AiServiceFailure,
    tooLarge: AiServiceFailure = 'IMAGE_TOO_LARGE',
    timeoutMs: number = AI_SERVICE_TIMEOUT_MS,
  ): Promise<unknown> {
    if (!this.token) {
      throw new AiServiceError('SERVICE_NOT_CONFIGURED');
    }

    const form = new FormData();
    form.append(
      file.field ?? 'image',
      new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
      file.fileName,
    );
    for (const [name, value] of Object.entries(fields)) {
      form.append(name, value);
    }

    let response: Response;
    let body: unknown;
    try {
      // The timeout covers the whole exchange, body included.
      const signal = AbortSignal.timeout(timeoutMs);
      response = await this.fetch(path, {
        body: form,
        method: 'POST',
        signal,
      });
      body = await response.json().catch((error: unknown) => {
        if (isTimeout(error)) throw error;
        return undefined;
      });
    } catch (error) {
      throw toTransportError(error);
    }

    if (response.status === 422) {
      const code = rejection(detailCode(body));
      throw new AiServiceError(code, code, rejectionDetails(body));
    }
    if (response.status === 413) throw new AiServiceError(tooLarge);
    if (response.status === 503) {
      throw new AiServiceError(
        detailCode(body) === 'model_not_loaded'
          ? 'MODEL_NOT_LOADED'
          : 'SERVICE_UNAVAILABLE',
      );
    }
    if (!response.ok) {
      throw new AiServiceError(
        'SERVICE_ERROR',
        `Service IA : HTTP ${response.status}.`,
      );
    }
    return body;
  }

  /** GET /models, relayed without ever exposing the token. */
  async getStatus(): Promise<AiServiceStatus> {
    if (!this.token) {
      return { service: 'not_configured', models: [] };
    }

    try {
      const response = await this.fetch('/models', {
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (response.status === 401)
        return { service: 'unauthorized', models: [] };
      if (!response.ok) return { service: 'error', models: [] };

      const body: unknown = await response.json();
      const models =
        isRecord(body) && Array.isArray(body.models) ? body.models : [];
      return {
        service: 'available',
        models: models.filter(isRecord).map((model) => ({
          modelId: String(model.modelId),
          loaded: model.loaded === true,
          weightsSha256: isSha256(model.weightsSha256)
            ? model.weightsSha256
            : null,
          error: typeof model.error === 'string' ? model.error : null,
        })),
      };
    } catch {
      return { service: 'unavailable', models: [] };
    }
  }

  private fetch(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'X-Service-Token': this.token },
    });
  }
}

// By name, not instanceof: AbortSignal.timeout rejects with a DOMException,
// which is not always an Error of the current realm.
function isTimeout(error: unknown): boolean {
  const name =
    typeof error === 'object' && error !== null
      ? (error as { name?: unknown }).name
      : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

function toTransportError(error: unknown): AiServiceError {
  if (error instanceof AiServiceError) return error;
  return new AiServiceError(
    isTimeout(error) ? 'SERVICE_TIMEOUT' : 'SERVICE_UNAVAILABLE',
  );
}
