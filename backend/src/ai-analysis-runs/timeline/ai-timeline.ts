// The evolution of a patient's AI analyses of one chain: the comparable
// measures of each SUCCEEDED run, oldest first, and how each differs from the
// run before it. Nothing here reads the database.
//
// A difference is only worth what the two runs share: the same model weights,
// the same kind of source, and a pixel spacing when an area is compared. When
// they do not, the comparison is kept (the figures are there) but flagged, so
// that no one reads a trend into what may be an artefact.

import { type AiRunDecision, type Prisma } from '@prisma/client';

import {
  getModelLabel,
  getModelLabels,
  getTopPrediction,
  isDicomDocument,
} from '../ai-analysis-runs.service';
import { type AiPipeline } from '../dto/create-ai-analysis-run.dto';

export type MeasureUnit = 'mm2' | 'probability' | 'px' | 'ratio' | 'score';

export type MeasureInfo = {
  key: string;
  unit: MeasureUnit;
  /**
   * A physical area (needs the pixel spacing to mean the same thing from one
   * image to the next): the pixel areas, not the shares of the image.
   */
  area: boolean;
};

const CARDIO_STRUCTURES = [
  ['lv', 'LV'],
  ['rv', 'RV'],
  ['myo', 'MYO'],
] as const;
const ECG_CLASSES = [
  ['probNorm', 'NORM'],
  ['probMi', 'MI'],
  ['probSttc', 'STTC'],
  ['probCd', 'CD'],
  ['probHyp', 'HYP'],
] as const;

/** The measures of each chain, in the order they are shown. */
export const MEASURES: Readonly<Record<AiPipeline, readonly MeasureInfo[]>> = {
  brain: [
    { area: false, key: 'topProbability', unit: 'probability' },
    { area: true, key: 'maskAreaPx', unit: 'px' },
    { area: false, key: 'maskAreaRatio', unit: 'ratio' },
  ],
  'cardio-ecg': ECG_CLASSES.map(([key]) => ({
    area: false,
    key,
    unit: 'probability' as const,
  })),
  'cardio-seg-mri': [
    ...CARDIO_STRUCTURES.map(([name]) => ({
      area: true,
      key: `${name}AreaMm2`,
      unit: 'mm2' as const,
    })),
    ...CARDIO_STRUCTURES.map(([name]) => ({
      area: true,
      key: `${name}Pixels`,
      unit: 'px' as const,
    })),
  ],
  'pathology-breast': [{ area: false, key: 'malignancyScore', unit: 'score' }],
  'pathology-nuclei': [{ area: false, key: 'maskAreaRatio', unit: 'ratio' }],
};

export type Caveat = 'MODEL_CHANGED' | 'NO_PIXEL_SPACING' | 'SOURCE_CHANGED';

export type SourceKind = 'dicom' | 'image' | 'signal';

export type TimelineRun = {
  classificationModelId: string | null;
  classificationWeightsSha256: string | null;
  createdAt: Date;
  decisionLabel: string | null;
  decisionStatus: AiRunDecision | null;
  decisionThreshold: number | null;
  id: string;
  malignancyScore: number | null;
  maskAreaPx: number | null;
  maskAreaRatio: number | null;
  maskPath: string | null;
  modelDecision: string | null;
  overlayPath: string | null;
  pipeline: string;
  predictions: Prisma.JsonValue | null;
  segmentationModelId: string | null;
  segmentationWeightsSha256: string | null;
  slicePath: string | null;
  sourceDocument: {
    documentType: string;
    mimeType: string;
    originalName: string;
    // Set when the document was made from a slice of a DICOM study.
    dicomStudyId?: string | null;
    instanceNumber?: number | null;
    seriesNumber?: number | null;
    sopInstanceUid?: string | null;
  };
  sourceDocumentId: string;
  tracePath: string | null;
};

export const TIMELINE_RUN_SELECT = {
  classificationModelId: true,
  classificationWeightsSha256: true,
  createdAt: true,
  decisionLabel: true,
  decisionStatus: true,
  decisionThreshold: true,
  id: true,
  malignancyScore: true,
  maskAreaPx: true,
  maskAreaRatio: true,
  maskPath: true,
  modelDecision: true,
  overlayPath: true,
  pipeline: true,
  predictions: true,
  segmentationModelId: true,
  segmentationWeightsSha256: true,
  slicePath: true,
  sourceDocument: {
    select: {
      dicomStudyId: true,
      documentType: true,
      instanceNumber: true,
      mimeType: true,
      originalName: true,
      seriesNumber: true,
      sopInstanceUid: true,
    },
  },
  sourceDocumentId: true,
  tracePath: true,
} as const satisfies Prisma.AiAnalysisRunSelect;

export type Delta = {
  /** current - previous, in the unit of the measure. */
  value: number;
  /** Relative to the previous value; null when that is 0. */
  percent: number | null;
};

export type Comparison = {
  previousRunId: string;
  /** One entry per measure of the chain; null when either run has no such measure. */
  deltas: Record<string, Delta | null>;
  /** The class (brain), the result (breast) or the set of classes (ECG) is not the same. */
  labelChanged: boolean;
  caveats: Caveat[];
  /** No caveat: the runs share what a comparison needs. */
  reliable: boolean;
};

/** The slice of a DICOM study a run was made on ("Série 3, coupe n° 12"). */
export type TimelineSlice = {
  instanceNumber: number | null;
  seriesNumber: number | null;
};

export type TimelineItem = {
  runId: string;
  createdAt: string;
  sourceDocumentId: string;
  /** Set when the source is a slice of a DICOM study; null otherwise. */
  slice: TimelineSlice | null;
  /** Brain: the top class; breast: the BreakHis result; null otherwise. */
  label: string | null;
  /** ECG: the classes at or above their threshold; null otherwise. */
  labels: string[] | null;
  decisionStatus: AiRunDecision | null;
  decisionLabel: string | null;
  model: {
    id: string | null;
    weightsSha256: string | null;
    /** Brain only: the segmenter, when one ran. */
    segmentationId: string | null;
    segmentationWeightsSha256: string | null;
  };
  source: SourceKind;
  /** Cardiac MRI: (row, column) in mm; null for an image and for the other chains. */
  pixelSpacingMm: [number, number] | null;
  hasMask: boolean;
  hasOverlay: boolean;
  hasSlice: boolean;
  hasTrace: boolean;
  measures: Record<string, number | null>;
  /** Against the run before it; null for the first. */
  comparison: Comparison | null;
};

export type AiTimeline = {
  patientId: string;
  pipeline: AiPipeline;
  measures: readonly MeasureInfo[];
  /** The measure to draw first. */
  primaryMeasure: string;
  items: TimelineItem[];
};

// ------------------------------------------------------------ extraction

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function pixelSpacingOf(run: TimelineRun): [number, number] | null {
  if (run.pipeline !== 'cardio-seg-mri' || !isRecord(run.predictions)) {
    return null;
  }
  const spacing = run.predictions.pixelSpacingMm;
  return Array.isArray(spacing) &&
    spacing.length === 2 &&
    numberOrNull(spacing[0]) !== null &&
    numberOrNull(spacing[1]) !== null
    ? [spacing[0] as number, spacing[1] as number]
    : null;
}

/** An MRI says so itself; otherwise the document tells a DICOM from an image, an ECG is a signal. */
export function sourceKindOf(run: TimelineRun): SourceKind {
  if (run.pipeline === 'cardio-ecg') return 'signal';
  if (
    run.pipeline === 'cardio-seg-mri' &&
    isRecord(run.predictions) &&
    (run.predictions.source === 'dicom' || run.predictions.source === 'image')
  ) {
    return run.predictions.source;
  }
  return isDicomDocument(run.sourceDocument) ? 'dicom' : 'image';
}

export function extractMeasures(
  run: TimelineRun,
): Record<string, number | null> {
  const measures: Record<string, number | null> = {};
  for (const { key } of MEASURES[run.pipeline as AiPipeline] ?? []) {
    measures[key] = null;
  }

  switch (run.pipeline) {
    case 'brain':
      measures.topProbability =
        getTopPrediction(run.predictions)?.probability ?? null;
      measures.maskAreaPx = numberOrNull(run.maskAreaPx);
      measures.maskAreaRatio = numberOrNull(run.maskAreaRatio);
      break;
    case 'pathology-breast':
      measures.malignancyScore = numberOrNull(run.malignancyScore);
      break;
    case 'pathology-nuclei':
      measures.maskAreaRatio = numberOrNull(run.maskAreaRatio);
      break;
    case 'cardio-ecg': {
      const probabilities =
        isRecord(run.predictions) && isRecord(run.predictions.probabilities)
          ? run.predictions.probabilities
          : {};
      for (const [key, name] of ECG_CLASSES) {
        measures[key] = numberOrNull(probabilities[name]);
      }
      break;
    }
    case 'cardio-seg-mri': {
      const structures =
        isRecord(run.predictions) && isRecord(run.predictions.structures)
          ? run.predictions.structures
          : {};
      for (const [prefix, name] of CARDIO_STRUCTURES) {
        const area = structures[name];
        measures[`${prefix}Pixels`] = isRecord(area)
          ? numberOrNull(area.pixels)
          : null;
        // Square millimetres only when the pixel spacing was known.
        measures[`${prefix}AreaMm2`] = isRecord(area)
          ? numberOrNull(area.areaMm2)
          : null;
      }
      break;
    }
  }

  return measures;
}

// ------------------------------------------------------------ comparison

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** The difference of a measure between two runs, in value and in %. */
export function deltaOf(
  current: number | null,
  previous: number | null,
): Delta | null {
  if (current === null || previous === null) return null;

  return {
    // Rounded, so that 0.3 - 0.1 is 0.2 and not 0.19999999999999998.
    percent:
      previous === 0 ? null : round(((current - previous) / previous) * 100, 2),
    value: round(current - previous, 6),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((label) => b.includes(label));

type Comparable = Pick<
  TimelineItem,
  'label' | 'labels' | 'measures' | 'model' | 'pixelSpacingMm' | 'source'
>;

/**
 * The same model: the same weights (a model id alone does not say which
 * training the weights come from). The brain segmenter counts only when both
 * runs used one: a run with no tumour to outline has none.
 */
function sameModel(current: Comparable, previous: Comparable): boolean {
  const same = (a: string | null, b: string | null) => a !== null && a === b;
  const classifier =
    current.model.id === previous.model.id &&
    same(current.model.weightsSha256, previous.model.weightsSha256);
  const bothSegmented =
    current.model.segmentationWeightsSha256 !== null &&
    previous.model.segmentationWeightsSha256 !== null;
  const segmenter =
    !bothSegmented ||
    (current.model.segmentationId === previous.model.segmentationId &&
      same(
        current.model.segmentationWeightsSha256,
        previous.model.segmentationWeightsSha256,
      ));

  // A chain with a single model keeps it in `model` whichever column it is in.
  return classifier && segmenter;
}

/**
 * How `current` differs from `previous` (the run before it, or any other run
 * to compare with), and whether that comparison can be trusted.
 */
export function compareRuns(
  pipeline: AiPipeline,
  current: Comparable,
  previous: Comparable,
  previousRunId: string,
): Comparison {
  const measures = MEASURES[pipeline] ?? [];
  const deltas: Record<string, Delta | null> = {};
  for (const { key } of measures) {
    deltas[key] = deltaOf(
      current.measures[key] ?? null,
      previous.measures[key] ?? null,
    );
  }

  const caveats: Caveat[] = [];
  if (!sameModel(current, previous)) caveats.push('MODEL_CHANGED');

  // An area in pixels is a physical size only with the pixel spacing; images
  // carry none, so their areas are comparable only if both slices were taken
  // the same way. (An area in mm2 exists only where the spacing was known.)
  const pixelAreaCompared = measures.some(
    ({ area, key, unit }) => area && unit === 'px' && deltas[key] !== null,
  );
  if (
    pixelAreaCompared &&
    (current.pixelSpacingMm === null || previous.pixelSpacingMm === null)
  ) {
    caveats.push('NO_PIXEL_SPACING');
  }

  if (current.source !== previous.source) caveats.push('SOURCE_CHANGED');

  const labelChanged =
    current.labels !== null && previous.labels !== null
      ? !sameSet(current.labels, previous.labels)
      : current.label !== previous.label;

  return {
    caveats,
    deltas,
    labelChanged,
    previousRunId,
    reliable: caveats.length === 0,
  };
}

// --------------------------------------------------------------- the line

function primaryMeasureOf(
  pipeline: AiPipeline,
  items: readonly TimelineItem[],
): string {
  const populated = (key: string) =>
    items.filter((item) => item.measures[key] !== null).length;

  switch (pipeline) {
    case 'brain':
      // The area of the tumour, when at least two runs outlined one.
      return populated('maskAreaPx') >= 2 ? 'maskAreaPx' : 'topProbability';
    case 'cardio-seg-mri':
      return populated('lvAreaMm2') >= 2 ? 'lvAreaMm2' : 'lvPixels';
    case 'pathology-breast':
      return 'malignancyScore';
    case 'pathology-nuclei':
      return 'maskAreaRatio';
    default:
      return 'probMi';
  }
}

export function toTimelineItem(
  run: TimelineRun,
): Omit<TimelineItem, 'comparison'> {
  const pipeline = run.pipeline;
  const single = pipeline === 'brain';

  return {
    createdAt: run.createdAt.toISOString(),
    decisionLabel: run.decisionLabel,
    decisionStatus: run.decisionStatus,
    hasMask: run.maskPath !== null,
    hasOverlay: Boolean(run.overlayPath),
    hasSlice: Boolean(run.slicePath),
    hasTrace: Boolean(run.tracePath),
    label: getModelLabel({
      modelDecision: run.modelDecision,
      pipeline,
      predictions: run.predictions,
    }),
    labels: getModelLabels({ pipeline, predictions: run.predictions }),
    measures: extractMeasures(run),
    model: {
      id: run.classificationModelId ?? run.segmentationModelId,
      segmentationId: single ? run.segmentationModelId : null,
      segmentationWeightsSha256: single ? run.segmentationWeightsSha256 : null,
      weightsSha256:
        run.classificationModelId !== null
          ? run.classificationWeightsSha256
          : run.segmentationWeightsSha256,
    },
    pixelSpacingMm: pixelSpacingOf(run),
    runId: run.id,
    slice:
      run.sourceDocument.dicomStudyId || run.sourceDocument.sopInstanceUid
        ? {
            instanceNumber: run.sourceDocument.instanceNumber ?? null,
            seriesNumber: run.sourceDocument.seriesNumber ?? null,
          }
        : null,
    source: sourceKindOf(run),
    sourceDocumentId: run.sourceDocumentId,
  };
}

/** The timeline of one chain: the runs oldest first, each compared with the one before. */
export function buildAiTimeline(
  patientId: string,
  pipeline: AiPipeline,
  runs: readonly TimelineRun[],
): AiTimeline {
  const ordered = [...runs].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const items: TimelineItem[] = [];

  for (const run of ordered) {
    const base = toTimelineItem(run);
    const previous = items[items.length - 1];

    items.push({
      ...base,
      comparison: previous
        ? compareRuns(pipeline, base, previous, previous.runId)
        : null,
    });
  }

  return {
    items,
    measures: MEASURES[pipeline],
    patientId,
    pipeline,
    primaryMeasure: primaryMeasureOf(pipeline, items),
  };
}
