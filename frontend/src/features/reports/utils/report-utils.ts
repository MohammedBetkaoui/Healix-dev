import { type AiAnalysisRun, type AiRunListItem } from "@/features/ai-analyses/ai-analyses.types";
import { getReportBlocker, type ReportBlocker } from "@/features/ai-analyses/run-report";
import { type Locale } from "@/i18n";

import {
  type ClinicalReport,
  type ReportAiDetails,
  type ReportCapabilities,
  type ReportCategory,
  type ReportListFilters,
  type ReportPatient,
  type ReportSourceType,
  type ReportStatus,
} from "../types/report.types";

export type ReportResult = { code: string; label: string; score?: number; value: string };

/** What the table of results of an AI report shows, from the raw output of the model. */
export function aiResults(ai: Pick<ReportAiDetails, "pipeline" | "predictions"> & Partial<Pick<ReportAiDetails, "volumetry">>): ReportResult[] {
  // A cine volumetry: the measures in force, as the abbreviations the reports use.
  if (ai.pipeline === "cardio-volume-mri") {
    const summary = ai.volumetry;
    if (!summary) return [];
    const rows: [string, number | null, string][] = [
      ["LVEF", summary.lvEfPercent, "%"],
      ["EDV", summary.lvEdvMl, "ml"],
      ["ESV", summary.lvEsvMl, "ml"],
      ["MASS", summary.lvMassG, "g"],
      ["RVEF", summary.rvEfPercent, "%"],
    ];
    return rows.flatMap(([code, value, unit]) => (value === null ? [] : [{ code, label: code, value: `${Math.round(value)} ${unit}` }]));
  }

  const predictions = ai.predictions as AiRunListItem["predictions"];
  if (Array.isArray(predictions)) {
    return predictions.slice(0, 5).map((prediction) => ({
      code: prediction.label,
      label: prediction.label,
      score: prediction.probability,
      value: prediction.label,
    }));
  }

  if (ai.pipeline === "cardio-ecg" && predictions && "probabilities" in predictions) {
    return Object.entries(predictions.probabilities).map(([code, score]) => ({
      code,
      label: code,
      score,
      value: "positive" in predictions && predictions.positive.includes(code as never) ? "positive" : "below-threshold",
    }));
  }

  if (ai.pipeline === "cardio-seg-mri" && predictions && "structures" in predictions) {
    return Object.entries(predictions.structures).map(([code, result]) => ({
      code,
      label: code,
      value: result.areaMm2 === null ? `${result.pixels} px` : `${result.areaMm2.toFixed(1)} mm²`,
    }));
  }

  return [];
}

export function isAiReportEligible(run: Pick<AiAnalysisRun, "decisionStatus" | "status">) {
  return getReportBlocker(run) === null;
}

export type AiReportAvailability = Record<ReportBlocker, number> & { available: number };

export function summarizeAiReportAvailability(runs: ReadonlyArray<Pick<AiAnalysisRun, "decisionStatus" | "status">>): AiReportAvailability {
  const summary: AiReportAvailability = { available: 0, notDecided: 0, notSucceeded: 0, rejected: 0 };
  for (const run of runs) {
    const blocker = getReportBlocker(run);
    if (blocker) summary[blocker] += 1;
    else summary.available += 1;
  }
  return summary;
}

export type ReportFilterValue = {
  author: string;
  category: "" | ReportCategory;
  from: string;
  patient: string;
  query: string;
  source: "" | ReportSourceType;
  status: "" | ReportStatus;
  to: string;
};

export const initialReportFilters: ReportFilterValue = { author: "", category: "", from: "", patient: "", query: "", source: "", status: "", to: "" };

/** The filters of the form as the query of GET /reports (a day is the whole day, UTC). */
export function toReportListFilters(filters: ReportFilterValue, query: string, page: number, limit: number): ReportListFilters {
  return {
    authorId: filters.author || undefined,
    category: filters.category || undefined,
    from: filters.from ? `${filters.from}T00:00:00.000Z` : undefined,
    limit,
    page,
    patientId: filters.patient || undefined,
    query: query || undefined,
    sourceType: filters.source || undefined,
    status: filters.status || undefined,
    to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
  };
}

type ActionSource = Pick<ClinicalReport, "documentAvailable" | "isCurrent" | "replacedBy" | "sourceType" | "status"> & {
  importedDocument?: ClinicalReport["importedDocument"];
};

/**
 * What the user can do with a report: the rights of the account, and what the
 * report allows. The report of an AI analysis can be neither edited, amended
 * nor canceled; an imported document is not amended; only the current version
 * of a finalized report, with no amendment under way, is amended or canceled.
 */
export function getReportActions(report: ActionSource, capabilities: ReportCapabilities) {
  const isAi = report.sourceType === "AI_ANALYSIS";
  const finalized = report.status === "FINAL" || report.status === "AMENDED";
  const open = finalized && report.isCurrent && !report.replacedBy;
  return {
    canAmend: capabilities.canAmendReports && !isAi && !report.importedDocument && open,
    canCancel: capabilities.canCancelReports && !isAi && open,
    canDeleteDraft: capabilities.canCreateReports && report.status === "DRAFT",
    canDownload: capabilities.canDownloadReports && report.documentAvailable,
    canEditDraft: capabilities.canCreateReports && report.status === "DRAFT",
    canFinalize: capabilities.canFinalizeReports && report.status === "DRAFT",
    canPrint: capabilities.canPrintReports && report.documentAvailable,
    isAi,
  };
}

/** Last name then first name, in the script of the page, falling back to the other. */
export function getReportPatientName(patient: Pick<ReportPatient, "firstName" | "firstNameAr" | "lastName" | "lastNameAr">, locale: Locale) {
  const first = (locale === "ar" ? patient.firstNameAr || patient.firstName : patient.firstName || patient.firstNameAr) ?? "";
  const last = (locale === "ar" ? patient.lastNameAr || patient.lastName : patient.lastName || patient.lastNameAr) ?? "";
  return `${first} ${last}`.trim();
}

export function getReportAge(birthDate: string | null, at: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const date = new Date(at);
  let age = date.getFullYear() - birth.getFullYear();
  if (date.getMonth() < birth.getMonth() || (date.getMonth() === birth.getMonth() && date.getDate() < birth.getDate())) age -= 1;
  return age;
}

/** Page of the analysis behind an AI report, in the workspace of the account. */
export function getAiRunHref(ai: { patientId: string; runId: string }, accountType: "DOCTOR" | "ESTABLISHMENT") {
  const base = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  return `${base}/ai-analyses/runs/${encodeURIComponent(ai.runId)}?patient=${encodeURIComponent(ai.patientId)}`;
}
