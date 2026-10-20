import { type AiRunListItem, type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { findModel } from "@/features/ai-analyses/ai-models.registry";
import { getReportBlocker, type ReportBlocker } from "@/features/ai-analyses/run-report";
import { type Locale } from "@/i18n";

import { localizeReport } from "../reports.copy";
import {
  type ClinicalReport,
  type LocalizedReportText,
  type ReportCategory,
  type ReportSourceType,
  type ReportStatus,
  type ReportStructuredResult,
} from "../types/report.types";

const pipelinePresentation: Record<AiRunListItem["pipeline"], { category: ReportCategory; title: LocalizedReportText }> = {
  brain: { category: "AI_BRAIN", title: { ar: "تقرير الذكاء الاصطناعي — الدماغ", fr: "Compte rendu IA — Brain" } },
  "cardio-ecg": { category: "AI_ECG", title: { ar: "تقرير الذكاء الاصطناعي — تخطيط القلب", fr: "Compte rendu IA — ECG" } },
  "cardio-seg-mri": { category: "AI_CARDIAC_MRI", title: { ar: "تقرير الذكاء الاصطناعي — رنين القلب", fr: "Compte rendu IA — IRM cardiaque" } },
  "pathology-breast": { category: "AI_PATHOLOGY", title: { ar: "تقرير الذكاء الاصطناعي — علم الأمراض", fr: "Compte rendu IA — Pathology" } },
  "pathology-nuclei": { category: "AI_PATHOLOGY", title: { ar: "تقرير الذكاء الاصطناعي — تجزئة النوى", fr: "Compte rendu IA — segmentation nucléaire" } },
};

function aiResults(run: AiRunListItem): ReportStructuredResult[] {
  if (Array.isArray(run.predictions)) {
    return run.predictions.slice(0, 5).map((prediction) => ({
      code: prediction.label,
      label: { ar: prediction.label, fr: prediction.label },
      score: prediction.probability,
      value: prediction.label,
    }));
  }

  if (run.pipeline === "cardio-ecg" && run.predictions && "probabilities" in run.predictions) {
    return Object.entries(run.predictions.probabilities).map(([code, score]) => ({
      code,
      label: { ar: code, fr: code },
      score,
      value: run.predictions && "positive" in run.predictions && run.predictions.positive.includes(code as never) ? "positive" : "below-threshold",
    }));
  }

  if (run.pipeline === "cardio-seg-mri" && run.predictions && "structures" in run.predictions) {
    return Object.entries(run.predictions.structures).map(([code, result]) => ({
      code,
      label: { ar: code, fr: code },
      value: result.areaMm2 === null ? `${result.pixels} px` : `${result.areaMm2.toFixed(1)} mm²`,
    }));
  }

  return [];
}

export function isAiReportEligible(run: Pick<AiAnalysisRun, "decisionStatus" | "status">) {
  return getReportBlocker(run) === null;
}

export function mapAiRunToClinicalReport(run: AiRunListItem): ClinicalReport | null {
  if (!isAiReportEligible(run) || (run.decisionStatus !== "VALIDATED" && run.decisionStatus !== "CORRECTED")) return null;

  const presentation = pipelinePresentation[run.pipeline];
  const model = findModel(run.classificationModelId ?? run.segmentationModelId);
  const patientName = {
    ar: `${run.patient.firstNameAr} ${run.patient.lastNameAr}`.trim(),
    fr: `${run.patient.firstName} ${run.patient.lastName}`.trim(),
  };
  const decidedAt = run.decidedAt ?? run.updatedAt;
  const validator = run.decidedByName
    ? { displayName: { ar: run.decidedByName, fr: run.decidedByName }, id: run.decidedById ?? "validator" }
    : undefined;
  const checksum = run.classificationWeightsSha256 ?? run.segmentationWeightsSha256 ?? undefined;

  return {
    aiContext: {
      clinicianImpression: run.clinicianImpression ?? undefined,
      decisionStatus: run.decisionStatus,
      isBackendBacked: true,
      modelChecksum: checksum,
      modelName: model?.architecture ?? run.classificationModelId ?? run.segmentationModelId ?? "—",
      modelVersion: model?.version ?? undefined,
      patientId: run.patientId,
      pipeline: run.pipeline,
      results: aiResults(run),
      runId: run.id,
      runStatus: run.status,
    },
    author: validator,
    category: presentation.category,
    conclusion: run.clinicianImpression ? { ar: run.clinicianImpression, fr: run.clinicianImpression } : undefined,
    createdAt: run.createdAt,
    effectiveDate: run.createdAt,
    finalizedAt: decidedAt,
    id: `ai-${run.id}`,
    identifier: run.reportNumber,
    isDemo: false,
    isImported: false,
    issuedAt: decidedAt,
    linkedDocuments: [],
    organization: {
      address: { ar: "غير متاح في قائمة التحاليل", fr: "Non disponible dans la liste des analyses" },
      name: { ar: "فضاء HealixDz السريري", fr: "Espace clinique HealixDz" },
      type: { ar: "مؤسسة صحية", fr: "Établissement de santé" },
      wilaya: { ar: "غير محدد", fr: "Non renseignée" },
    },
    presentedForm: run.reportNumber
      ? {
          fileName: `${run.reportNumber}.pdf`,
          id: `pdf-${run.id}`,
          kind: "PRESENTED_FORM",
          label: { ar: "التقرير الطبي النهائي", fr: "Compte rendu final" },
          mimeType: "application/pdf",
        }
      : undefined,
    sections: [
      {
        body: { ar: "نتيجة مساعدة على القرار السريري صادق عليها مهني صحي.", fr: "Résultat d’aide à la décision clinique validé par un professionnel de santé." },
        id: "ai-decision",
        title: { ar: "القرار الطبي", fr: "Décision médicale" },
      },
    ],
    service: { ar: "Healix AI", fr: "Healix AI" },
    sourceLabel: { ar: "تحليل ذكاء اصطناعي من HealixDz", fr: "Analyse IA HealixDz" },
    sourceType: "AI_ANALYSIS",
    status: run.decisionStatus === "CORRECTED" ? "CORRECTED" : "FINAL",
    subject: { displayName: patientName, fullName: patientName, id: run.patientId },
    timeline: [
      { action: "GENERATED", actor: "HealixDz", at: run.createdAt, detail: { ar: "تم تشغيل التحليل", fr: "Analyse exécutée" }, id: `generated-${run.id}` },
      { action: run.decisionStatus === "CORRECTED" ? "CORRECTED" : "VALIDATED", actor: run.decidedByName ?? "—", at: decidedAt, detail: { ar: "تم اعتماد القرار الطبي", fr: "Décision médicale enregistrée" }, id: `decision-${run.id}` },
    ],
    title: presentation.title,
    validator,
    version: 1,
    versions: [{ issuedAt: decidedAt, status: run.decisionStatus === "CORRECTED" ? "CORRECTED" : "FINAL", version: 1 }],
  };
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
  service: string;
  source: "" | ReportSourceType;
  status: "" | ReportStatus;
  to: string;
};

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}

export function matchesReportFilters(report: ClinicalReport, filters: ReportFilterValue, locale: Locale) {
  const query = normalized(filters.query);
  if (query) {
    const searchable = [
      report.identifier ?? "",
      localizeReport(report.title, locale),
      localizeReport(report.subject.displayName, locale),
      localizeReport(report.subject.fullName, locale),
      report.subject.fileNumber ?? "",
      report.author ? localizeReport(report.author.displayName, locale) : "",
      report.validator ? localizeReport(report.validator.displayName, locale) : "",
    ].some((value) => normalized(value).includes(query));
    if (!searchable) return false;
  }
  if (filters.category && report.category !== filters.category) return false;
  if (filters.status && report.status !== filters.status) return false;
  if (filters.source && report.sourceType !== filters.source) return false;
  if (filters.patient && report.subject.id !== filters.patient) return false;
  if (filters.author && report.author?.id !== filters.author && report.validator?.id !== filters.author) return false;
  if (filters.service && localizeReport(report.service, locale) !== filters.service) return false;
  if (filters.from && report.effectiveDate.slice(0, 10) < filters.from) return false;
  if (filters.to && report.effectiveDate.slice(0, 10) > filters.to) return false;
  return true;
}

