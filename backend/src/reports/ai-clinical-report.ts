import {
  ClinicalReportCategory,
  ClinicalReportSource,
  ClinicalReportStatus,
  type Prisma,
} from '@prisma/client';

const CATEGORY_BY_PIPELINE: Record<string, ClinicalReportCategory> = {
  brain: ClinicalReportCategory.AI_BRAIN,
  'cardio-ecg': ClinicalReportCategory.AI_ECG,
  'cardio-seg-mri': ClinicalReportCategory.AI_CARDIAC_MRI,
};

const TITLE_BY_PIPELINE: Record<string, string> = {
  brain: 'Compte rendu IA — Brain',
  'cardio-ecg': 'Compte rendu IA — ECG',
  'cardio-seg-mri': 'Compte rendu IA — IRM cardiaque',
  'pathology-nuclei': 'Compte rendu IA — segmentation nucléaire',
  'pathology-breast': 'Compte rendu IA — Pathology',
};

// Same mapping as the SQL backfill of the clinical_reports migration.
export const aiReportCategory = (pipeline: string): ClinicalReportCategory =>
  CATEGORY_BY_PIPELINE[pipeline] ?? ClinicalReportCategory.AI_PATHOLOGY;

export const aiReportTitle = (pipeline: string): string =>
  TITLE_BY_PIPELINE[pipeline] ?? TITLE_BY_PIPELINE['pathology-breast'];

type AiReportRun = {
  id: string;
  patientId: string;
  pipeline: string;
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: {
    id: string;
    fullName: string;
    doctorProfile: { speciality: string } | null;
  } | null;
  patient: {
    workspaceId: string | null;
    birthDate: Date;
    firstName: string;
    firstNameAr: string;
    lastName: string;
    lastNameAr: string;
    gender: string;
    hospitalRecordNumber: string | null;
  };
};

/**
 * The clinical_reports row of the report of an AI analysis: FINAL from its
 * creation, numbered like its PDF, created in the transaction that stores the
 * AiAnalysisReport. Null for a patient with no workspace (a report belongs to
 * a workspace).
 */
export function buildAiClinicalReport(input: {
  aiReport: {
    id: string;
    reportNumber: string;
    contentSha256: string;
    createdAt: Date;
    generatedById: string;
  };
  run: AiReportRun;
}): Prisma.ClinicalReportUncheckedCreateInput | null {
  const { aiReport, run } = input;
  if (!run.patient.workspaceId) return null;
  const authorId = run.decidedBy?.id ?? aiReport.generatedById;
  const finalizedAt = run.decidedAt ?? aiReport.createdAt;
  return {
    number: aiReport.reportNumber,
    workspaceId: run.patient.workspaceId,
    patientId: run.patientId,
    category: aiReportCategory(run.pipeline),
    sourceType: ClinicalReportSource.AI_ANALYSIS,
    status: ClinicalReportStatus.FINAL,
    title: aiReportTitle(run.pipeline),
    sections: [],
    effectiveAt: run.createdAt,
    version: 1,
    authorId,
    finalizedAt,
    finalizedById: authorId,
    patientSnapshot: {
      firstName: run.patient.firstName,
      firstNameAr: run.patient.firstNameAr,
      lastName: run.patient.lastName,
      lastNameAr: run.patient.lastNameAr,
      birthDate: run.patient.birthDate.toISOString().slice(0, 10),
      gender: run.patient.gender,
      hospitalRecordNumber: run.patient.hospitalRecordNumber,
    },
    authorSnapshot: {
      fullName: run.decidedBy?.fullName ?? null,
      speciality: run.decidedBy?.doctorProfile?.speciality ?? null,
      registrationNumber: null,
      regionalCouncil: null,
    },
    contentFingerprint: aiReport.contentSha256,
    aiAnalysisReportId: aiReport.id,
    createdAt: aiReport.createdAt,
  };
}
