import { Prisma, SyncChangeOperation, SyncEntityType } from '@prisma/client';

type PrismaExecutor = Prisma.TransactionClient;

// Cloud -> desktop, read-only. The payload carries exactly the fields the
// offline V1 cache needs and never the administrative/identity extras the
// web app only uses online (minimum data necessary):
// no nationalId, no insurance details, no email, no address, no phone,
// no emergency contacts, no sector/wilaya, no sms flags.
export const patientSyncSelect = {
  id: true,
  workspaceId: true,
  firstName: true,
  firstNameAr: true,
  lastName: true,
  lastNameAr: true,
  gender: true,
  birthDate: true,
  bloodGroup: true,
  hospitalRecordNumber: true,
  status: true,
  administrativeStatus: true,
  medicalSummary: true,
  updatedAt: true,
} satisfies Prisma.PatientSelect;

type PatientSyncRow = Prisma.PatientGetPayload<{
  select: typeof patientSyncSelect;
}>;

export const toPatientSyncPayload = (row: PatientSyncRow) => ({
  id: row.id,
  firstName: row.firstName,
  firstNameAr: row.firstNameAr,
  lastName: row.lastName,
  lastNameAr: row.lastNameAr,
  gender: row.gender,
  birthDate: row.birthDate.toISOString(),
  bloodGroup: row.bloodGroup,
  hospitalRecordNumber: row.hospitalRecordNumber,
  status: row.status,
  administrativeStatus: row.administrativeStatus,
  medicalSummary: row.medicalSummary,
  updatedAt: row.updatedAt.toISOString(),
});

export async function recordPatientSyncChange(
  client: PrismaExecutor,
  patientId: string,
  operation: SyncChangeOperation,
) {
  const patient = await client.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: {
      ...patientSyncSelect,
      workspace: { select: { id: true } },
    },
  });
  if (!patient.workspace) {
    throw new Error('Patient introuvable dans un workspace.');
  }
  const payload = toPatientSyncPayload(patient);
  await client.syncChange.create({
    data: {
      workspaceId: patient.workspace.id,
      patientId: patient.id,
      entityType: SyncEntityType.PATIENT,
      entityId: patient.id,
      operation,
      payload,
    },
  });
  return payload;
}
