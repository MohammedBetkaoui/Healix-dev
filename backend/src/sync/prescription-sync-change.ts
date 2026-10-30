import {
  Prisma,
  SyncChangeOperation,
  SyncEntityType,
  PrescriptionStatus,
} from '@prisma/client';

type PrismaExecutor = Prisma.TransactionClient;

// The prescription wire payload deliberately excludes the ten frozen
// snapshots (patient/prescriber/insurance/regulatory/...): finalized rows are
// rendered on the desktop in read-only mode from the change feed using the
// minimal identity fields (number, status timestamps) rather than acting as a
// clinical replica. Draft rows carry their item list — that is what the
// offline editor works on.
export const prescriptionSyncSelect = {
  id: true,
  workspaceId: true,
  patientId: true,
  prescriberDoctorProfileId: true,
  encounterId: true,
  status: true,
  type: true,
  syncVersion: true,
  number: true,
  prescribedAt: true,
  validUntil: true,
  validatedAt: true,
  canceledAt: true,
  regulatoryData: true,
  // The fingerprint only, never the frozen snapshots: the desktop prints it on
  // a validated prescription it holds read-only.
  contentFingerprint: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      medicationId: true,
      dci: true,
      brandName: true,
      strength: true,
      pharmaceuticalForm: true,
      route: true,
      manufacturer: true,
      regulatoryCategory: true,
      dosePerIntake: true,
      frequency: true,
      intakeMoment: true,
      durationDays: true,
      quantity: true,
      patientInstructions: true,
      indication: true,
      asNeeded: true,
      renewalAllowed: true,
      substitutionAllowed: true,
    },
  },
} satisfies Prisma.PrescriptionSelect;

type PrescriptionSyncRow = Prisma.PrescriptionGetPayload<{
  select: typeof prescriptionSyncSelect;
}>;

export type PrescriptionItemSyncRow = PrescriptionSyncRow['items'][number];

// The payload travels and is stored as plain JSON: every Date of the row is
// serialized to an ISO string here (house pattern of
// toConsultationSyncPayload). Item rows carry no Date field in the select,
// so they pass through as-is.
export const toPrescriptionSyncPayload = (row: PrescriptionSyncRow) => ({
  ...row,
  prescribedAt: row.prescribedAt.toISOString(),
  validUntil: row.validUntil?.toISOString() ?? null,
  validatedAt: row.validatedAt?.toISOString() ?? null,
  canceledAt: row.canceledAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  items: row.items.map((item) => ({ ...item })),
});

export async function recordPrescriptionSyncChange(
  client: PrismaExecutor,
  prescriptionId: string,
  operation: SyncChangeOperation,
) {
  const prescription = await client.prescription.findUniqueOrThrow({
    where: { id: prescriptionId },
    select: prescriptionSyncSelect,
  });
  const payload = toPrescriptionSyncPayload(prescription);
  await client.syncChange.create({
    data: {
      workspaceId: prescription.workspaceId,
      patientId: prescription.patientId,
      entityType: SyncEntityType.PRESCRIPTION,
      entityId: prescription.id,
      operation,
      payload,
    },
  });
  return payload;
}

export type PrescriptionTombstoneSource = {
  id: string;
  workspaceId: string;
  patientId: string;
  number: string | null;
  status: PrescriptionStatus;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

// A draft can be deleted from the cloud while a device still holds a copy
// (or even a pending local edit). The tombstone payload keeps just enough
// identity for the desktop to unlock or conflict on it.
export async function recordPrescriptionTombstone(
  client: PrismaExecutor,
  source: PrescriptionTombstoneSource,
) {
  const payload = {
    id: source.id,
    number: source.number,
    status: source.status,
    syncVersion: source.syncVersion,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    deletedAt: new Date().toISOString(),
  };
  await client.syncChange.create({
    data: {
      workspaceId: source.workspaceId,
      patientId: source.patientId,
      entityType: SyncEntityType.PRESCRIPTION,
      entityId: source.id,
      operation: SyncChangeOperation.TOMBSTONE,
      payload,
    },
  });
  return payload;
}
