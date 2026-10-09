// Pure rules of the PDF report of a run (result page, patient record).
// Mirrors backend/src/ai-analysis-runs/report/ai-analysis-reports.service.ts.

import { isAxiosError } from "axios";

import { type AiAnalysisRun } from "./ai-analyses.types";

export type ReportBlocker = "notSucceeded" | "notDecided" | "rejected";

/** Why a run has no report; null when it can be downloaded (SUCCEEDED, validated or corrected). */
export function getReportBlocker(run: Pick<AiAnalysisRun, "status" | "decisionStatus">): ReportBlocker | null {
  if (run.status !== "SUCCEEDED") return "notSucceeded";
  if (run.decisionStatus === null) return "notDecided";
  if (run.decisionStatus === "REJECTED") return "rejected";
  return null;
}

/** Codes and reasons of a failed download the interface explains (aiAnalyses.report.errors.<key>). */
export const knownReportErrorKeys = [
  "RUN_NOT_SUCCEEDED",
  "NOT_DECIDED",
  "REJECTED",
  "AI_REPORT_RENDER_FAILED",
  "AI_REPORT_INTEGRITY_FAILED",
] as const;
const KNOWN_REPORT_ERRORS = new Set<string>(knownReportErrorKeys);

/** AI_REPORT_NOT_AVAILABLE gives its reason; the other codes speak for themselves. */
export function getReportErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "unknown";
  const data = error.response?.data as { code?: unknown; reason?: unknown } | undefined;
  const key = data?.code === "AI_REPORT_NOT_AVAILABLE" ? data.reason : data?.code;
  return typeof key === "string" && KNOWN_REPORT_ERRORS.has(key) ? key : "unknown";
}

/** "<report number>.pdf": never the patient's name. */
export function reportFileName(reportNumber: string | null): string {
  return reportNumber && /^CR-IA-\d{4}-\d{6}$/.test(reportNumber) ? `${reportNumber}.pdf` : "compte-rendu.pdf";
}
