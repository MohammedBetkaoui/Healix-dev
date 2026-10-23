import { PrescriptionStatus, type Prisma } from '@prisma/client';

export const prescriptionDetailInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      firstNameAr: true,
      lastName: true,
      lastNameAr: true,
      birthDate: true,
      gender: true,
      hospitalRecordNumber: true,
      insurance: true,
      insuredNumber: true,
      medicalSummary: true,
    },
  },
  prescriber: {
    select: {
      id: true,
      speciality: true,
      professionalAddress: true,
      user: { select: { fullName: true, phone: true } },
    },
  },
  encounter: {
    select: {
      id: true,
      date: true,
      reason: true,
      doctorProfileId: true,
    },
  },
  items: { orderBy: { position: 'asc' as const } },
  basedOnPrescription: { select: { number: true } },
  document: { select: { id: true } },
} satisfies Prisma.PrescriptionInclude;

export type PrescriptionDetail = Prisma.PrescriptionGetPayload<{
  include: typeof prescriptionDetailInclude;
}>;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const mask = (value: string | null) =>
  value
    ? `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
    : null;

export function effectivePrescriptionStatus(prescription: {
  status: PrescriptionStatus;
  validUntil: Date | null;
}) {
  return prescription.status === PrescriptionStatus.VALIDATED &&
    prescription.validUntil &&
    prescription.validUntil.getTime() < Date.now()
    ? 'EXPIRED'
    : prescription.status;
}

export function toPrescriptionResponse(prescription: PrescriptionDetail) {
  const patientSnapshot = record(prescription.patientSnapshot);
  const prescriberSnapshot = record(prescription.prescriberSnapshot);
  const safety = record(prescription.safetySnapshot);
  const regulatory = record(prescription.regulatorySnapshot);
  const frozen =
    prescription.status !== PrescriptionStatus.DRAFT &&
    prescription.status !== PrescriptionStatus.PENDING_VALIDATION;
  const patient =
    frozen && patientSnapshot
      ? {
          id: prescription.patient.id,
          firstName: patientSnapshot.firstName ?? null,
          firstNameAr: patientSnapshot.firstNameAr ?? null,
          lastName: patientSnapshot.lastName ?? null,
          lastNameAr: patientSnapshot.lastNameAr ?? null,
          birthDate: patientSnapshot.birthDate ?? null,
          gender: patientSnapshot.gender ?? null,
          hospitalRecordNumber: patientSnapshot.hospitalRecordNumber ?? null,
        }
      : {
          id: prescription.patient.id,
          firstName: prescription.patient.firstName,
          firstNameAr: prescription.patient.firstNameAr,
          lastName: prescription.patient.lastName,
          lastNameAr: prescription.patient.lastNameAr,
          birthDate: prescription.patient.birthDate,
          gender: prescription.patient.gender,
          hospitalRecordNumber: prescription.patient.hospitalRecordNumber,
        };
  const prescriber =
    frozen && prescriberSnapshot
      ? {
          id: prescription.prescriber.id,
          fullName: prescriberSnapshot.fullName ?? null,
          speciality: prescriberSnapshot.speciality ?? null,
          registrationNumber: prescriberSnapshot.registrationNumber ?? null,
          regionalCouncil: prescriberSnapshot.regionalCouncil ?? null,
          professionalAddress: prescriberSnapshot.professionalAddress ?? null,
          phone: prescriberSnapshot.professionalPhone ?? null,
        }
      : {
          id: prescription.prescriber.id,
          fullName: prescription.prescriber.user.fullName,
          speciality: prescription.prescriber.speciality,
          registrationNumber: null,
          regionalCouncil: null,
          professionalAddress: prescription.prescriber.professionalAddress,
          phone: prescription.prescriber.user.phone,
        };
  return {
    id: prescription.id,
    number: prescription.number,
    patient,
    prescriber,
    encounter: prescription.encounter
      ? {
          id: prescription.encounter.id,
          date: prescription.encounter.date,
          practitionerId: prescription.encounter.doctorProfileId,
          label: prescription.encounter.reason,
        }
      : null,
    prescribedAt: prescription.prescribedAt,
    validUntil: prescription.validUntil,
    status: prescription.status,
    effectiveStatus: effectivePrescriptionStatus(prescription),
    type: prescription.type,
    items: prescription.items.map((item) => ({
      id: item.id,
      position: item.position,
      medication: {
        id: item.medicationId,
        dci: item.dci,
        brandName: item.brandName,
        strength: item.strength,
        pharmaceuticalForm: item.pharmaceuticalForm,
        route: item.route,
        manufacturer: item.manufacturer,
        regulatoryCategory: item.regulatoryCategory,
      },
      dosePerIntake: item.dosePerIntake,
      frequency: item.frequency,
      intakeMoment: item.intakeMoment,
      durationDays: item.durationDays,
      quantity: item.quantity,
      patientInstructions: item.patientInstructions,
      indication: item.indication,
      asNeeded: item.asNeeded,
      renewalAllowed: item.renewalAllowed,
      substitutionAllowed: item.substitutionAllowed,
    })),
    alerts: Array.isArray(safety?.alerts) ? safety.alerts : [],
    safetyEvaluation: safety,
    regulatoryDetails: regulatory ?? prescription.regulatoryData,
    basedOnPrescriptionNumber: prescription.basedOnPrescription?.number ?? null,
    validatedAt: prescription.validatedAt,
    canceledAt: prescription.canceledAt,
    cancellationReason: prescription.cancellationReason,
    printedAt: prescription.printedAt,
    printCount: prescription.printCount,
    documentAvailable: Boolean(prescription.document),
    insurance: frozen
      ? record(prescription.insuranceSnapshot)
      : {
          organization: prescription.patient.insurance,
          maskedInsuredNumber: mask(prescription.patient.insuredNumber),
        },
    createdAt: prescription.createdAt,
    updatedAt: prescription.updatedAt,
  };
}
