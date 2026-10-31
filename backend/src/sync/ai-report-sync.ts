import {
  AiAnalysisRunStatus,
  AiRunDecision,
  type Prisma,
} from '@prisma/client';

import {
  readVolumetry,
  effectiveMeasures,
} from '../ai-analysis-runs/volumetry/volumetry';

// What a device may keep offline of a physician-decided AI analysis: the
// conclusion, a few figures and where the answer came from. Never an image, a
// mask, a path or a storage key, never the raw model output beyond three
// predictions, never a rejection reason. The payload is built field by field
// (no spread of the row): a column added to AiAnalysisRun tomorrow does not
// reach a device until someone puts it here on purpose.

export const AI_REPORTS_PER_PATIENT = 20;
export const AI_REPORT_TOP_PREDICTIONS = 3;
export const AI_REPORT_WEIGHTS_PREFIX_LENGTH = 12;

// Only an analysis that succeeded and that a physician kept (as it is, or
// corrected) is offered offline. REJECTED, undecided, running and failed ones
// are never part of it.
export const AI_REPORT_DECISIONS = [
  AiRunDecision.VALIDATED,
  AiRunDecision.CORRECTED,
] as const;
export const AI_REPORT_STATUS = AiAnalysisRunStatus.SUCCEEDED;

const MODULE_LABELS: Readonly<Record<string, string>> = {
  brain: 'IRM cérébrale',
  'cardio-ecg': 'ECG 12 dérivations',
  'cardio-seg-mri': 'Segmentation cardiaque par IRM',
  'cardio-volume-mri': 'Volumétrie cardiaque par IRM',
  'pathology-breast': 'Pathologie mammaire',
  'pathology-nuclei': 'Segmentation des noyaux cellulaires',
};

export const aiModuleLabel = (pipeline: string): string =>
  MODULE_LABELS[pipeline] ?? 'Analyse IA';

// The rows the payload is read from, and nothing else: the select is the first
// half of the whitelist.
export const aiReportRunSelect = {
  id: true,
  patientId: true,
  pipeline: true,
  createdAt: true,
  decidedAt: true,
  decisionStatus: true,
  decisionLabel: true,
  decisionLabels: true,
  clinicianImpression: true,
  modelDecision: true,
  predictions: true,
  malignancyScore: true,
  decisionThreshold: true,
  magnification: true,
  maskAreaRatio: true,
  volumetry: true,
  classificationModelId: true,
  classificationWeightsSha256: true,
  segmentationModelId: true,
  segmentationWeightsSha256: true,
  decidedBy: { select: { fullName: true } },
  report: { select: { reportNumber: true, sha256: true } },
} as const satisfies Prisma.AiAnalysisRunSelect;

export type AiReportRun = Prisma.AiAnalysisRunGetPayload<{
  select: typeof aiReportRunSelect;
}>;

export type AiReportPrediction = { label: string; probability: number };

export type AiReportSyncPayload = {
  runId: string;
  patientId: string;
  pipeline: string;
  moduleLabel: string;
  createdAt: string;
  decidedAt: string | null;
  decisionStatus: 'VALIDATED' | 'CORRECTED';
  decisionLabel: string | null;
  decisionLabels: string[] | null;
  clinicianImpression: string | null;
  // The model's own answer: the brain class, the BreakHis result; ECG: the
  // classes above their thresholds (modelLabels).
  modelDecision: string | null;
  modelLabels: string[] | null;
  topPredictions: AiReportPrediction[];
  // Only the measures of this pipeline's kind, null when the run has none.
  measures: Record<string, number | null>;
  classificationModelId: string | null;
  classificationWeightsSha12: string | null;
  segmentationModelId: string | null;
  segmentationWeightsSha12: string | null;
  decidedByName: string | null;
  reportNumber: string | null;
  reportSha256: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const stringList = (value: unknown): string[] | null =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : null;

const prefix = (sha: string | null): string | null =>
  sha ? sha.slice(0, AI_REPORT_WEIGHTS_PREFIX_LENGTH) : null;

const byProbabilityDesc = (a: AiReportPrediction, b: AiReportPrediction) =>
  b.probability - a.probability;

// The model's three most likely answers: a list of {label, probability} for
// the brain classifier, the per-class probabilities for an ECG. Anything else
// (the breast score is not a probability, a segmentation has no class) has none.
export function topPredictionsOf(
  pipeline: string,
  predictions: unknown,
): AiReportPrediction[] {
  const candidates: AiReportPrediction[] = [];
  if (pipeline === 'brain' && Array.isArray(predictions)) {
    for (const item of predictions as unknown[]) {
      if (
        isRecord(item) &&
        typeof item.label === 'string' &&
        numberOrNull(item.probability) !== null
      ) {
        candidates.push({
          label: item.label,
          probability: item.probability as number,
        });
      }
    }
  } else if (
    pipeline === 'cardio-ecg' &&
    isRecord(predictions) &&
    isRecord(predictions.probabilities)
  ) {
    for (const [label, probability] of Object.entries(
      predictions.probabilities,
    )) {
      const value = numberOrNull(probability);
      if (value !== null) candidates.push({ label, probability: value });
    }
  }
  return candidates
    .sort(byProbabilityDesc)
    .slice(0, AI_REPORT_TOP_PREDICTIONS)
    .map(({ label, probability }) => ({ label, probability }));
}

function modelLabelOf(run: AiReportRun): string | null {
  if (run.pipeline === 'brain') {
    return topPredictionsOf('brain', run.predictions)[0]?.label ?? null;
  }
  return run.pipeline === 'pathology-breast' ? run.modelDecision : null;
}

function modelLabelsOf(run: AiReportRun): string[] | null {
  if (run.pipeline !== 'cardio-ecg' || !isRecord(run.predictions)) return null;
  return stringList(run.predictions.positive);
}

function measuresOf(run: AiReportRun): Record<string, number | null> {
  switch (run.pipeline) {
    case 'brain':
      return { maskAreaRatio: numberOrNull(run.maskAreaRatio) };
    case 'pathology-breast':
      return {
        malignancyScore: numberOrNull(run.malignancyScore),
        decisionThreshold: numberOrNull(run.decisionThreshold),
        magnification: numberOrNull(run.magnification),
      };
    case 'pathology-nuclei':
      return {
        maskAreaRatio: numberOrNull(run.maskAreaRatio),
        magnification: numberOrNull(run.magnification),
      };
    case 'cardio-volume-mri': {
      const volumetry = readVolumetry(run.volumetry);
      if (!volumetry) return {};
      // What is in force: the physician's correction when there is one.
      const measures = effectiveMeasures(volumetry);
      const indexed = measures.indexed;
      return {
        lvef: numberOrNull(measures.lv.efPercent),
        rvef: numberOrNull(measures.rv.efPercent),
        lvedv: numberOrNull(measures.lv.edvMl),
        lvesv: numberOrNull(measures.lv.esvMl),
        lvMass: numberOrNull(measures.lvMassG),
        lvedvIndexed: numberOrNull(indexed?.lvEdvMlM2),
        lvesvIndexed: numberOrNull(indexed?.lvEsvMlM2),
        rvedvIndexed: numberOrNull(indexed?.rvEdvMlM2),
        rvesvIndexed: numberOrNull(indexed?.rvEsvMlM2),
        lvMassIndexed: numberOrNull(indexed?.lvMassGM2),
      };
    }
    default:
      return {};
  }
}

export function toAiReportSyncPayload(run: AiReportRun): AiReportSyncPayload {
  return {
    runId: run.id,
    patientId: run.patientId,
    pipeline: run.pipeline,
    moduleLabel: aiModuleLabel(run.pipeline),
    createdAt: run.createdAt.toISOString(),
    decidedAt: run.decidedAt ? run.decidedAt.toISOString() : null,
    decisionStatus:
      run.decisionStatus === AiRunDecision.CORRECTED
        ? 'CORRECTED'
        : 'VALIDATED',
    decisionLabel: run.decisionLabel,
    decisionLabels: stringList(run.decisionLabels),
    clinicianImpression: run.clinicianImpression,
    modelDecision: modelLabelOf(run),
    modelLabels: modelLabelsOf(run),
    topPredictions: topPredictionsOf(run.pipeline, run.predictions),
    measures: measuresOf(run),
    classificationModelId: run.classificationModelId,
    classificationWeightsSha12: prefix(run.classificationWeightsSha256),
    segmentationModelId: run.segmentationModelId,
    segmentationWeightsSha12: prefix(run.segmentationWeightsSha256),
    decidedByName: run.decidedBy?.fullName ?? null,
    reportNumber: run.report?.reportNumber ?? null,
    reportSha256: run.report?.sha256 ?? null,
  };
}

// The most recent `limit` rows of each patient, input already ordered by
// recency (most recent first). The order of the input is kept.
export function keepMostRecentPerPatient<
  T extends { id: string; patientId: string },
>(rows: readonly T[], limit = AI_REPORTS_PER_PATIENT): T[] {
  const taken = new Map<string, number>();
  const kept: T[] = [];
  for (const row of rows) {
    const count = taken.get(row.patientId) ?? 0;
    if (count >= limit) continue;
    taken.set(row.patientId, count + 1);
    kept.push(row);
  }
  return kept;
}
