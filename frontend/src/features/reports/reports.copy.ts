import { type ReportCategory, type ReportSourceType, type ReportStatus } from "./types/report.types";

export const reportStatusKeys: Record<ReportStatus, string> = {
  AMENDED: "reports.statuses.AMENDED",
  CANCELED: "reports.statuses.CANCELED",
  DRAFT: "reports.statuses.DRAFT",
  FINAL: "reports.statuses.FINAL",
};

export const reportSourceKeys: Record<ReportSourceType, string> = {
  AI_ANALYSIS: "reports.sources.AI_ANALYSIS",
  CONSULTATION: "reports.sources.CONSULTATION",
  EXTERNAL_DOCUMENT: "reports.sources.EXTERNAL_DOCUMENT",
  IMAGING: "reports.sources.IMAGING",
  LABORATORY: "reports.sources.LABORATORY",
  OTHER: "reports.sources.OTHER",
};

export const reportCategoryKeys: Record<ReportCategory, string> = {
  AI_BRAIN: "reports.categories.AI_BRAIN",
  AI_CARDIAC_MRI: "reports.categories.AI_CARDIAC_MRI",
  AI_ECG: "reports.categories.AI_ECG",
  AI_PATHOLOGY: "reports.categories.AI_PATHOLOGY",
  CONSULTATION_NOTE: "reports.categories.CONSULTATION_NOTE",
  EXTERNAL_MEDICAL: "reports.categories.EXTERNAL_MEDICAL",
  LABORATORY_RESULT: "reports.categories.LABORATORY_RESULT",
  OTHER_CLINICAL: "reports.categories.OTHER_CLINICAL",
  RADIOLOGY: "reports.categories.RADIOLOGY",
};
