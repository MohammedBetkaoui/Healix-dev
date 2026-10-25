// Wire types of backend/src/reports (controller, DTOs, response mapper).
// Texts typed by the physician are plain strings: the API stores one value,
// not a French/Arabic pair.

import { type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";

export type ReportSourceType =
  | "AI_ANALYSIS"
  | "CONSULTATION"
  | "IMAGING"
  | "LABORATORY"
  | "EXTERNAL_DOCUMENT"
  | "OTHER";

/**
 * DRAFT while it is written; FINAL once finalized; AMENDED for a finalized
 * version that replaces an earlier one; CANCELED with a reason.
 * (No PRELIMINARY nor CORRECTED: the API has no such state. A corrected AI
 * decision is still a FINAL report; its decision is in `ai.decisionStatus`.)
 */
export type ReportStatus = "DRAFT" | "FINAL" | "AMENDED" | "CANCELED";

export type ReportCategory =
  | "AI_BRAIN"
  | "AI_ECG"
  | "AI_PATHOLOGY"
  | "AI_CARDIAC_MRI"
  | "CONSULTATION_NOTE"
  | "RADIOLOGY"
  | "LABORATORY_RESULT"
  | "EXTERNAL_MEDICAL"
  | "OTHER_CLINICAL";

/** Categories a physician can write a report in. */
export type WrittenReportCategory = Extract<
  ReportCategory,
  "CONSULTATION_NOTE" | "RADIOLOGY" | "LABORATORY_RESULT" | "OTHER_CLINICAL"
>;

/** Categories of an imported document. */
export type ImportedReportCategory = Extract<
  ReportCategory,
  "EXTERNAL_MEDICAL" | "RADIOLOGY" | "OTHER_CLINICAL"
>;

export type ReportSectionId =
  | "reason"
  | "context"
  | "findings"
  | "results"
  | "interpretation"
  | "recommendations";

/** GET /reports/capabilities. */
export type ReportCapabilities = {
  canViewReports: boolean;
  canCreateReports: boolean;
  canFinalizeReports: boolean;
  canAmendReports: boolean;
  canDownloadReports: boolean;
  canPrintReports: boolean;
  canShareReports: boolean;
  canCancelReports: boolean;
};

export type ReportMeta = {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};

/** GET /reports/stats. */
export type ReportStats = {
  aiValidated: number;
  amended: number;
  final: number;
  month: number;
  toFinalize: number;
};

export type ReportPatient = {
  id: string;
  firstName: string | null;
  firstNameAr: string | null;
  lastName: string | null;
  lastNameAr: string | null;
  birthDate: string | null;
  gender: string | null;
  hospitalRecordNumber: string | null;
};

export type ReportPerson = { id: string | null; fullName: string | null };

export type ReportValidator = ReportPerson & {
  speciality: string | null;
  registrationNumber: string | null;
  regionalCouncil: string | null;
};

export type ReportOrganization = {
  name: string | null;
  type: string | null;
  address: string | null;
  wilaya: string | null;
  phone: string | null;
};

export type ReportSection = { id: string; title: string; body: string };

export type ReportDocumentInfo = {
  kind: "GENERATED" | "AI_REPORT" | "IMPORTED";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
};

/** The AI analysis behind an AI report. */
export type ReportAiInfo = {
  runId: string;
  patientId: string;
  pipeline: AiPipelineId;
};

/** The figures of a cardiac cine volumetry the reports center lists: the measures in force (backend volumetrySummary). */
export type ReportVolumetrySummary = {
  cardiacOutputLMin: number | null;
  lvEdvMl: number;
  lvEfPercent: number | null;
  lvEsvMl: number;
  lvMassG: number;
  lvefClass: "reduced" | "mildlyReduced" | "preserved" | null;
  modified: boolean;
  rvEfPercent: number | null;
};

export type ReportAiDetails = ReportAiInfo & {
  decisionStatus: "VALIDATED" | "CORRECTED" | "REJECTED" | null;
  clinicianImpression: string | null;
  classificationModelId: string | null;
  segmentationModelId: string | null;
  weightsSha256: string | null;
  /** Raw output of the model (shape depends on the pipeline). */
  predictions: unknown;
  /** Cardiac cine volumetry only. */
  volumetry?: ReportVolumetrySummary | null;
};

/** One row of GET /reports and GET /reports/patients/:id. */
export type ReportListItem = {
  id: string;
  number: string | null;
  status: ReportStatus;
  category: ReportCategory;
  sourceType: ReportSourceType;
  title: string;
  version: number;
  effectiveDate: string;
  createdAt: string;
  finalizedAt: string | null;
  supersededAt: string | null;
  isCurrent: boolean;
  isAmendment: boolean;
  canceledAt: string | null;
  patient: ReportPatient;
  author: { id: string; fullName: string };
  validator: { id: string; fullName: string } | null;
  documentAvailable: boolean;
  ai: ReportAiInfo | null;
};

export type ReportVersion = {
  id: string;
  number: string | null;
  version: number;
  status: ReportStatus;
  createdAt: string;
  finalizedAt: string | null;
  supersededAt: string | null;
  canceledAt: string | null;
  isCurrent: boolean;
};

/** GET /reports/:id and every action that returns the report. */
export type ClinicalReport = Omit<ReportListItem, "author" | "validator" | "ai"> & {
  conclusion: string | null;
  sections: ReportSection[];
  updatedAt: string;
  author: { id: string; fullName: string; speciality: string | null };
  validator: ReportValidator | null;
  organization: ReportOrganization | null;
  encounter: { id: string; date: string; label: string } | null;
  replaces: { id: string; number: string | null; version: number } | null;
  replacedBy: { id: string; number: string | null; version: number } | null;
  canceledByName: string | null;
  cancellationReason: string | null;
  presentedForm: ReportDocumentInfo | null;
  importedDocument: { id: string; fileName: string; mimeType: string; sizeBytes: number } | null;
  external: { author: string | null; specialty: string | null; notes: string | null } | null;
  ai: ReportAiDetails | null;
  contentFingerprint: string | null;
  versions: ReportVersion[];
};

export type ReportPage = { data: ReportListItem[]; meta: ReportMeta };

export type ReportHistoryEntry = {
  id: string;
  /** Audit action code, e.g. REPORT_FINALIZED. */
  action: string;
  actorName: string | null;
  createdAt: string;
};

export type ReportListFilters = {
  authorId?: string;
  category?: ReportCategory;
  from?: string;
  includeSuperseded?: boolean;
  limit?: number;
  page?: number;
  patientId?: string;
  query?: string;
  sourceType?: ReportSourceType;
  status?: ReportStatus;
  to?: string;
};

// --- Request bodies (CreateReportDto, UpdateReportDto, ImportReportDto) ---

export type ReportSectionInput = { id: ReportSectionId; body: string };

export type CreateReportInput = {
  patientId: string;
  encounterId?: string;
  category?: WrittenReportCategory;
  title: string;
  effectiveDate?: string;
  conclusion?: string;
  sections?: ReportSectionInput[];
};

export type UpdateReportInput = {
  encounterId?: string | null;
  category?: WrittenReportCategory;
  title?: string;
  effectiveDate?: string;
  conclusion?: string | null;
  sections?: ReportSectionInput[];
};

export type ImportReportInput = {
  patientId: string;
  encounterId?: string;
  category?: ImportedReportCategory;
  title: string;
  effectiveDate: string;
  externalAuthor: string;
  specialty?: string;
  notes?: string;
  file: File;
};
