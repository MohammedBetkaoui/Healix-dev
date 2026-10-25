import { getFailedRunId } from "@/features/ai-analyses/run-presentation";
import { type TranslationFunction } from "@/lib/i18n";

import { type CineStack, type DicomInstance, type DicomSeries, type DicomStudyDetail } from "./dicom.types";

// The chains that read a slice of a DICOM study (backend/src/dicom/
// dicom-analysis.service.ts): the brain chain and the cardiac MRI segmentation.
// The pathology chains read slides and the ECG chain a signal.
export const DICOM_ANALYSIS_PIPELINES = ["brain", "cardio-seg-mri"] as const;
export type DicomAnalysisPipeline = (typeof DICOM_ANALYSIS_PIPELINES)[number];

// Only an MRI is analysed.
export const DICOM_ANALYSIS_MODALITY = "MR";

/** The images of a series the analysis can read: one frame each, in the order of the stack. */
export function analysableInstances(series: DicomSeries): DicomInstance[] {
  return series.instances.filter((instance) => !instance.multiFrame);
}

/** The series an analysis can start from: an MRI with at least one single-frame image. */
export function analysableSeries(study: DicomStudyDetail): DicomSeries[] {
  return study.series.filter(
    (series) =>
      series.modality === DICOM_ANALYSIS_MODALITY && analysableInstances(series).length > 0,
  );
}

/** "Série 3, coupe n° 12": a missing number is said, never guessed. */
export function formatDicomSlice(
  slice: { instanceNumber: number | null; seriesNumber: number | null },
  t: TranslationFunction,
): string {
  const none = t("dicom.analysis.noNumber");
  return t("dicom.analysis.slice", {
    instance: slice.instanceNumber ?? none,
    series: slice.seriesNumber ?? none,
  });
}

/** The cine series the volumetry can read: no refusal. */
export const measurableStacks = (stacks: readonly CineStack[]): CineStack[] => stacks.filter((stack) => stack.refusal === null);

/**
 * The series offered first: a short axis that can be read (the volumetry is made for it), else any series
 * that can be read, else none. A series whose description says nothing is not excluded: the physician
 * confirms the view.
 */
export function defaultCineStack(stacks: readonly CineStack[]): CineStack | null {
  const readable = measurableStacks(stacks);
  return readable.find((stack) => stack.shortAxisLikely === true) ?? readable.find((stack) => stack.shortAxisLikely === null) ?? readable[0] ?? null;
}

/**
 * Whether the button may measure the heart: a series that can be read is chosen, the physician confirmed
 * it is a short axis, the patient signed the AI consent (while it is unknown the server decides), the
 * account may write, and nothing is running.
 */
export function canLaunchCineMeasure(state: {
  busy: boolean;
  consentMissing: boolean;
  readOnly: boolean;
  shortAxisConfirmed: boolean;
  stack: CineStack | null;
}): boolean {
  return state.stack !== null && state.stack.refusal === null && state.shortAxisConfirmed && !state.consentMissing && !state.readOnly && !state.busy;
}

/** The result page of a run, in the workspace of the account. */
export function dicomRunPagePath(
  accountType: "DOCTOR" | "ESTABLISHMENT",
  patientId: string,
  runId: string,
): string {
  const base = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  return `${base}/ai-analyses/runs/${encodeURIComponent(runId)}?patient=${encodeURIComponent(patientId)}`;
}

/**
 * The page of a run the service refused (rejected image, service down...): the
 * backend recorded it and puts its id in the error, the page says why. null for
 * a request refused before any run existed (consent, quota, a chain that reads
 * no slice): the panel explains those itself.
 */
export function failedRunPagePath(
  accountType: "DOCTOR" | "ESTABLISHMENT",
  patientId: string,
  error: unknown,
): string | null {
  const runId = getFailedRunId(error);
  return runId ? dicomRunPagePath(accountType, patientId, runId) : null;
}

/**
 * Whether the button may start an analysis: a slice and a chain are chosen, the
 * patient signed the AI consent (while it is unknown the server decides), the
 * account may write, and no analysis is running.
 */
export function canLaunchDicomAnalysis(state: {
  busy: boolean;
  consentMissing: boolean;
  hasSlice: boolean;
  pipeline: DicomAnalysisPipeline | null;
  readOnly: boolean;
}): boolean {
  return state.hasSlice && state.pipeline !== null && !state.consentMissing && !state.readOnly && !state.busy;
}
