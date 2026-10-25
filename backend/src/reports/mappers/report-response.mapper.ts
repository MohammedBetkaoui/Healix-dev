import { type Prisma } from '@prisma/client';

import {
  effectiveMeasures,
  isModified,
  readVolumetry,
} from '../../ai-analysis-runs/volumetry/volumetry';

/**
 * The few figures of a cardiac cine volumetry the reports center lists next to
 * its report: the measures in force (the physician's, else the model's).
 */
export function volumetrySummary(value: unknown) {
  const volumetry = readVolumetry(value);
  if (!volumetry) return null;
  const measures = effectiveMeasures(volumetry);
  return {
    cardiacOutputLMin: measures.cardiacOutputLMin,
    lvEdvMl: measures.lv.edvMl,
    lvEfPercent: measures.lv.efPercent,
    lvEsvMl: measures.lv.esvMl,
    lvMassG: measures.lvMassG,
    lvefClass: measures.lvefClass,
    modified: isModified(volumetry),
    rvEfPercent: measures.rv.efPercent,
  };
}

const patientSelect = {
  id: true,
  firstName: true,
  firstNameAr: true,
  lastName: true,
  lastNameAr: true,
  birthDate: true,
  gender: true,
  hospitalRecordNumber: true,
} as const;

export const reportListInclude = {
  patient: { select: patientSelect },
  author: { select: { id: true, fullName: true } },
  finalizedBy: { select: { id: true, fullName: true } },
  document: { select: { id: true } },
  patientDocument: { select: { id: true } },
  aiAnalysisReport: {
    select: { run: { select: { id: true, patientId: true, pipeline: true } } },
  },
} satisfies Prisma.ClinicalReportInclude;

export const reportDetailInclude = {
  patient: { select: patientSelect },
  author: {
    select: {
      id: true,
      fullName: true,
      doctorProfile: { select: { speciality: true } },
    },
  },
  finalizedBy: { select: { id: true, fullName: true } },
  canceledBy: { select: { id: true, fullName: true } },
  encounter: { select: { id: true, date: true, reason: true } },
  document: { select: { id: true, size: true, checksum: true } },
  replaces: { select: { id: true, number: true, version: true } },
  replacedBy: { select: { id: true, number: true, version: true } },
  patientDocument: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      checksum: true,
    },
  },
  aiAnalysisReport: {
    select: {
      id: true,
      reportNumber: true,
      sizeBytes: true,
      sha256: true,
      run: {
        select: {
          id: true,
          patientId: true,
          pipeline: true,
          decisionStatus: true,
          clinicianImpression: true,
          predictions: true,
          volumetry: true,
          classificationModelId: true,
          segmentationModelId: true,
          classificationWeightsSha256: true,
          segmentationWeightsSha256: true,
        },
      },
    },
  },
} satisfies Prisma.ClinicalReportInclude;

export type ReportDetail = Prisma.ClinicalReportGetPayload<{
  include: typeof reportDetailInclude;
}>;

export type ReportListRow = Prisma.ClinicalReportGetPayload<{
  include: typeof reportListInclude;
}>;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown) => (typeof value === 'string' ? value : null);

type StoredSection = { id: string; title: string; body: string };

export function readSections(value: unknown): StoredSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const section = record(entry);
    return section && typeof section.id === 'string'
      ? [
          {
            id: section.id,
            title: str(section.title) ?? section.id,
            body: str(section.body) ?? '',
          },
        ]
      : [];
  });
}

// A draft shows the live patient; a finalized version, the copy taken when it
// was finalized (the record may change afterwards, the report may not).
function patientView(report: {
  finalizedAt: Date | null;
  patientSnapshot: Prisma.JsonValue;
  patient: ReportListRow['patient'];
}) {
  const snapshot = report.finalizedAt ? record(report.patientSnapshot) : null;
  if (snapshot) {
    return {
      id: report.patient.id,
      firstName: str(snapshot.firstName),
      firstNameAr: str(snapshot.firstNameAr),
      lastName: str(snapshot.lastName),
      lastNameAr: str(snapshot.lastNameAr),
      birthDate: str(snapshot.birthDate),
      gender: str(snapshot.gender),
      hospitalRecordNumber: str(snapshot.hospitalRecordNumber),
    };
  }
  return {
    id: report.patient.id,
    firstName: report.patient.firstName,
    firstNameAr: report.patient.firstNameAr,
    lastName: report.patient.lastName,
    lastNameAr: report.patient.lastNameAr,
    birthDate: report.patient.birthDate.toISOString().slice(0, 10),
    gender: report.patient.gender,
    hospitalRecordNumber: report.patient.hospitalRecordNumber,
  };
}

function validatorView(report: {
  finalizedAt: Date | null;
  authorSnapshot: Prisma.JsonValue;
  finalizedBy: { id: string; fullName: string } | null;
}) {
  if (!report.finalizedAt) return null;
  const snapshot = record(report.authorSnapshot);
  return {
    id: report.finalizedBy?.id ?? null,
    fullName: str(snapshot?.fullName) ?? report.finalizedBy?.fullName ?? null,
    speciality: str(snapshot?.speciality),
    registrationNumber: str(snapshot?.registrationNumber),
    regionalCouncil: str(snapshot?.regionalCouncil),
  };
}

const isAi = (report: { aiAnalysisReportId: string | null }) =>
  report.aiAnalysisReportId !== null;

export function toReportListItem(report: ReportListRow) {
  const run = report.aiAnalysisReport?.run ?? null;
  return {
    id: report.id,
    number: report.number,
    status: report.status,
    category: report.category,
    sourceType: report.sourceType,
    title: report.title,
    version: report.version,
    effectiveDate: report.effectiveAt,
    createdAt: report.createdAt,
    finalizedAt: report.finalizedAt,
    supersededAt: report.supersededAt,
    isCurrent: report.supersededAt === null,
    isAmendment: report.replacesId !== null,
    canceledAt: report.canceledAt,
    patient: patientView(report),
    author: { id: report.author.id, fullName: report.author.fullName },
    validator: report.finalizedBy
      ? { id: report.finalizedBy.id, fullName: report.finalizedBy.fullName }
      : null,
    documentAvailable:
      Boolean(report.document) ||
      Boolean(report.patientDocument) ||
      isAi(report),
    ai: run
      ? { runId: run.id, patientId: run.patientId, pipeline: run.pipeline }
      : null,
  };
}

export function toReportDetail(report: ReportDetail) {
  const run = report.aiAnalysisReport?.run ?? null;
  const external = record(report.externalSource);
  const organization = report.finalizedAt
    ? record(report.organizationSnapshot)
    : null;
  const presentedForm = report.aiAnalysisReport
    ? {
        kind: 'AI_REPORT' as const,
        fileName: `${report.aiAnalysisReport.reportNumber}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: report.aiAnalysisReport.sizeBytes,
        sha256: report.aiAnalysisReport.sha256,
      }
    : report.patientDocument
      ? {
          kind: 'IMPORTED' as const,
          fileName: report.patientDocument.originalName,
          mimeType: report.patientDocument.mimeType,
          sizeBytes: report.patientDocument.size,
          sha256: report.patientDocument.checksum,
        }
      : report.document
        ? {
            kind: 'GENERATED' as const,
            fileName: `${report.number ?? 'rapport'}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: report.document.size,
            sha256: report.document.checksum,
          }
        : null;
  return {
    ...toReportListItem(report),
    conclusion: report.conclusion,
    sections: readSections(report.sections),
    updatedAt: report.updatedAt,
    patient: patientView(report),
    author: {
      id: report.author.id,
      fullName: report.author.fullName,
      speciality: report.author.doctorProfile?.speciality ?? null,
    },
    validator: validatorView(report),
    organization: organization
      ? {
          name: str(organization.name),
          type: str(organization.type),
          address: str(organization.address),
          wilaya: str(organization.wilaya),
          phone: str(organization.phone),
        }
      : null,
    encounter: report.encounter
      ? {
          id: report.encounter.id,
          date: report.encounter.date,
          label: report.encounter.reason,
        }
      : null,
    replaces: report.replaces,
    replacedBy: report.replacedBy,
    canceledByName: report.canceledBy?.fullName ?? null,
    cancellationReason: report.cancellationReason,
    presentedForm,
    importedDocument: report.patientDocument
      ? {
          id: report.patientDocument.id,
          fileName: report.patientDocument.originalName,
          mimeType: report.patientDocument.mimeType,
          sizeBytes: report.patientDocument.size,
        }
      : null,
    external: external
      ? {
          author: str(external.author),
          specialty: str(external.specialty),
          notes: str(external.notes),
        }
      : null,
    ai: run
      ? {
          runId: run.id,
          patientId: run.patientId,
          pipeline: run.pipeline,
          decisionStatus: run.decisionStatus,
          clinicianImpression: run.clinicianImpression,
          classificationModelId: run.classificationModelId,
          segmentationModelId: run.segmentationModelId,
          weightsSha256:
            run.classificationWeightsSha256 ?? run.segmentationWeightsSha256,
          predictions: run.predictions,
          // A cine volumetry lists its measures; the other chains add nothing.
          ...(run.pipeline === 'cardio-volume-mri'
            ? { volumetry: volumetrySummary(run.volumetry) }
            : {}),
        }
      : null,
    contentFingerprint: report.contentFingerprint,
  };
}
