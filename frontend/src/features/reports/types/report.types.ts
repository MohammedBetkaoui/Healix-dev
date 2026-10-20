import { type AiPipelineId, type AiRunDecision, type AiAnalysisRunStatus } from "@/features/ai-analyses/ai-analyses.types";

export type LocalizedReportText = {
  ar: string;
  fr: string;
};

export type ReportSourceType =
  | "AI_ANALYSIS"
  | "CONSULTATION"
  | "IMAGING"
  | "LABORATORY"
  | "EXTERNAL_DOCUMENT"
  | "OTHER";

export type ReportStatus =
  | "DRAFT"
  | "PRELIMINARY"
  | "FINAL"
  | "AMENDED"
  | "CORRECTED"
  | "CANCELED";

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

export type ReportGrant =
  | "REPORT_VIEW"
  | "REPORT_CREATE"
  | "REPORT_FINALIZE"
  | "REPORT_AMEND"
  | "REPORT_DOWNLOAD"
  | "REPORT_PRINT"
  | "REPORT_SHARE"
  | "REPORT_CANCEL";

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

export type ReportPatient = {
  id: string;
  displayName: LocalizedReportText;
  fullName: LocalizedReportText;
  birthDate?: string;
  fileNumber?: string;
};

export type ReportPractitioner = {
  id: string;
  displayName: LocalizedReportText;
  specialty?: LocalizedReportText;
  professionalNumber?: string;
};

export type ReportOrganization = {
  name: LocalizedReportText;
  type: LocalizedReportText;
  wilaya: LocalizedReportText;
  address: LocalizedReportText;
  phone?: string;
  email?: string;
};

export type ReportDocument = {
  id: string;
  kind: "PRESENTED_FORM" | "SOURCE" | "IMAGE" | "OVERLAY" | "MASK" | "ECG_TRACE";
  label: LocalizedReportText;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  sha256?: string;
};

export type ReportContentSection = {
  id: string;
  title: LocalizedReportText;
  body: LocalizedReportText;
};

export type ReportStructuredResult = {
  code: string;
  label: LocalizedReportText;
  value: string;
  score?: number;
};

export type ReportTimelineEvent = {
  id: string;
  action: "CREATED" | "GENERATED" | "VALIDATED" | "CORRECTED" | "DOWNLOADED" | "SHARED" | "CANCELED" | "REPLACED";
  at: string;
  actor: string;
  detail: LocalizedReportText;
};

export type ReportVersion = {
  version: number;
  status: ReportStatus;
  issuedAt: string;
  replacesVersion?: number;
  note?: LocalizedReportText;
};

export type AiReportContext = {
  patientId: string;
  runId: string;
  pipeline: AiPipelineId;
  runStatus: AiAnalysisRunStatus;
  decisionStatus: Extract<AiRunDecision, "VALIDATED" | "CORRECTED">;
  modelName: string;
  modelVersion?: string;
  modelChecksum?: string;
  clinicianImpression?: string;
  results: ReportStructuredResult[];
  isBackendBacked: boolean;
};

/**
 * Internal report shape aligned with future DiagnosticReport,
 * DocumentReference and Composition mappings without importing FHIR.
 */
export type ClinicalReport = {
  id: string;
  identifier: string | null;
  status: ReportStatus;
  category: ReportCategory;
  sourceType: ReportSourceType;
  title: LocalizedReportText;
  subject: ReportPatient;
  encounterId?: string;
  effectiveDate: string;
  issuedAt?: string;
  createdAt: string;
  finalizedAt?: string;
  author?: ReportPractitioner;
  validator?: ReportPractitioner;
  service: LocalizedReportText;
  sourceLabel: LocalizedReportText;
  organization: ReportOrganization;
  version: number;
  replacesVersion?: number;
  conclusion?: LocalizedReportText;
  sections: ReportContentSection[];
  presentedForm?: ReportDocument;
  linkedDocuments: ReportDocument[];
  timeline: ReportTimelineEvent[];
  versions: ReportVersion[];
  aiContext?: AiReportContext;
  isDemo: boolean;
  isImported: boolean;
  canceledAt?: string;
  canceledBy?: string;
  cancellationReason?: string;
};

