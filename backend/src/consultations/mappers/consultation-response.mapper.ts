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
  _count: {
    select: {
      prescriptions: true,
      // The current versions only: a replaced version is the same report.
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
  id: patient.id,
  firstName: patient.firstName,
  firstNameAr: patient.firstNameAr,
  lastName: patient.lastName,
  lastNameAr: patient.lastNameAr,
  birthDate: patient.birthDate.toISOString().slice(0, 10),
  gender: patient.gender,
  hospitalRecordNumber: patient.hospitalRecordNumber,
});

const toDoctor = (doctor: ConsultationListRow['doctorProfile']) =>
  doctor
    ? {
        id: doctor.id,
        fullName: doctor.user.fullName,
        speciality: doctor.speciality,
      }
    : null;

export function toConsultationListItem(row: ConsultationListRow) {
  return {
    id: row.id,
    date: row.date,
    reason: row.reason,
    diagnosis: row.diagnosis,
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
    date: row.date,
    reason: row.reason,
    diagnosis: row.diagnosis,
    treatment: row.treatment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    appointmentId: row.appointmentId,
    patient: toPatient(row.patient),
    doctor: toDoctor(row.doctorProfile),
    appointment: row.appointment
      ? {
          id: row.appointment.id,
          scheduledAt: row.appointment.scheduledAt,
          durationMinutes: row.appointment.durationMinutes,
          status: row.appointment.status,
          reason: row.appointment.reason,
        }
      : null,
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
