import { Prisma, SyncChangeOperation, SyncEntityType } from '@prisma/client';

type PrismaExecutor = Prisma.TransactionClient;

export const consultationSyncSelect = {
  id: true,
  workspaceId: true,
  patientId: true,
  appointmentId: true,
  status: true,
  syncVersion: true,
  startedAt: true,
  completedAt: true,
  chiefComplaint: true,
  historyPresentIllness: true,
  clinicalExamination: true,
  assessment: true,
  carePlan: true,
  followUpPlan: true,
  createdAt: true,
  updatedAt: true,
  vitalSigns: true,
  diagnoses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  addenda: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, authorId: true, content: true, createdAt: true },
  },
} satisfies Prisma.PatientConsultationSelect;

type ConsultationSyncRow = Prisma.PatientConsultationGetPayload<{
  select: typeof consultationSyncSelect;
}>;

export const toConsultationSyncPayload = (row: ConsultationSyncRow) => ({
  ...row,
  startedAt: row.startedAt?.toISOString() ?? null,
  completedAt: row.completedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  vitalSigns: row.vitalSigns
    ? {
        ...row.vitalSigns,
        createdAt: row.vitalSigns.createdAt.toISOString(),
        updatedAt: row.vitalSigns.updatedAt.toISOString(),
      }
    : null,
  diagnoses: row.diagnoses.map((diagnosis) => ({
    ...diagnosis,
    createdAt: diagnosis.createdAt.toISOString(),
  })),
  addenda: row.addenda.map((addendum) => ({
    ...addendum,
    createdAt: addendum.createdAt.toISOString(),
  })),
});

export async function recordConsultationSyncChange(
  client: PrismaExecutor,
  consultationId: string,
  operation: SyncChangeOperation,
) {
  const consultation = await client.patientConsultation.findUniqueOrThrow({
    where: { id: consultationId },
    select: consultationSyncSelect,
  });
  const payload = toConsultationSyncPayload(consultation);
  await client.syncChange.create({
    data: {
      workspaceId: consultation.workspaceId,
      patientId: consultation.patientId,
      entityType: SyncEntityType.CONSULTATION,
      entityId: consultation.id,
      operation,
      payload,
    },
  });
  return payload;
}
