import { type Prisma } from '@prisma/client';

import { effectivePrescriptionStatus } from '../../prescriptions/mappers/prescription-response.mapper';

const patientSelect = {
  id: true,
  firstName: true,
  firstNameAr: true,
  lastName: true,
  lastNameAr: true,
  birthDate: true,
  gender: true,
  bloodGroup: true,
  hospitalRecordNumber: true,
} as const;

const doctorSelect = {
  id: true,
  speciality: true,
  user: { select: { fullName: true } },
} as const;

export const consultationListInclude = {
  patient: { select: patientSelect },
  doctorProfile: { select: doctorSelect },
  diagnoses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  _count: {
    select: {
      prescriptions: true,
      clinicalReports: { where: { supersededAt: null } },
    },
  },
} satisfies Prisma.PatientConsultationInclude;

export type ConsultationListRow = Prisma.PatientConsultationGetPayload<{
  include: typeof consultationListInclude;
}>;

export const consultationDetailInclude = {
  patient: { select: patientSelect },
  doctorProfile: { select: doctorSelect },
  appointment: {
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      reason: true,
    },
  },
  vitalSigns: true,
  diagnoses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  addenda: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, fullName: true } } },
  },
  completedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PatientConsultationInclude;

export type ConsultationDetailRow = Prisma.PatientConsultationGetPayload<{
  include: typeof consultationDetailInclude;
}>;

export const linkedPrescriptionSelect = {
  id: true,
  number: true,
  status: true,
  type: true,
  prescribedAt: true,
  validUntil: true,
  _count: { select: { items: true } },
} satisfies Prisma.PrescriptionSelect;

export const linkedReportSelect = {
  id: true,
  number: true,
  status: true,
  category: true,
  sourceType: true,
  title: true,
  version: true,
  effectiveAt: true,
  finalizedAt: true,
} satisfies Prisma.ClinicalReportSelect;

type LinkedPrescription = Prisma.PrescriptionGetPayload<{
  select: typeof linkedPrescriptionSelect;
}>;
type LinkedReport = Prisma.ClinicalReportGetPayload<{
  select: typeof linkedReportSelect;
}>;

const toPatient = (patient: ConsultationListRow['patient']) => ({
  ...patient,
  birthDate: patient.birthDate.toISOString().slice(0, 10),
});

const toDoctor = (doctor: ConsultationListRow['doctorProfile']) => ({
  id: doctor.id,
  fullName: doctor.user.fullName,
  speciality: doctor.speciality,
});

export function toConsultationListItem(row: ConsultationListRow) {
  return {
    id: row.id,
    status: row.status,
    occurredAt: row.startedAt ?? row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    chiefComplaint: row.chiefComplaint,
    primaryDiagnosis:
      row.diagnoses.find((diagnosis) => diagnosis.isPrimary)?.label ??
      row.diagnoses[0]?.label ??
      null,
    appointmentId: row.appointmentId,
    patient: toPatient(row.patient),
    doctor: toDoctor(row.doctorProfile),
    prescriptionCount: row._count.prescriptions,
    reportCount: row._count.clinicalReports,
  };
}

export function toConsultationDetail(
  row: ConsultationDetailRow,
  prescriptions: LinkedPrescription[],
  reports: LinkedReport[],
) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    canceledAt: row.canceledAt,
    chiefComplaint: row.chiefComplaint,
    historyPresentIllness: row.historyPresentIllness,
    clinicalExamination: row.clinicalExamination,
    assessment: row.assessment,
    carePlan: row.carePlan,
    followUpPlan: row.followUpPlan,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    appointmentId: row.appointmentId,
    patient: toPatient(row.patient),
    doctor: toDoctor(row.doctorProfile),
    completedBy: row.completedBy,
    vitalSigns: row.vitalSigns,
    diagnoses: row.diagnoses,
    addenda: row.addenda.map((addendum) => ({
      id: addendum.id,
      content: addendum.content,
      createdAt: addendum.createdAt,
      author: addendum.author,
    })),
    appointment: row.appointment,
    prescriptions: prescriptions.map((prescription) => ({
      id: prescription.id,
      number: prescription.number,
      status: prescription.status,
      effectiveStatus: effectivePrescriptionStatus(prescription),
      type: prescription.type,
      prescribedAt: prescription.prescribedAt,
      itemCount: prescription._count.items,
    })),
    reports: reports.map((report) => ({
      id: report.id,
      number: report.number,
      status: report.status,
      category: report.category,
      sourceType: report.sourceType,
      title: report.title,
      version: report.version,
      effectiveDate: report.effectiveAt,
      finalizedAt: report.finalizedAt,
    })),
  };
}
