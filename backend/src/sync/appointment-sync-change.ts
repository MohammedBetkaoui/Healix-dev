import { Prisma, SyncChangeOperation, SyncEntityType } from '@prisma/client';

type PrismaExecutor = Prisma.TransactionClient;

// Cloud -> desktop, read-only. Only the fields the offline agenda needs;
// `notes` stays online-only by design. Appointment deletes do not exist in
// the web API for now (cancellation is a status update), but a TOMBSTONE
// change is still produced if the row ever disappears.
export const appointmentSyncSelect = {
  id: true,
  patientId: true,
  doctorProfileId: true,
  scheduledAt: true,
  durationMinutes: true,
  reason: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.AppointmentSelect;

type AppointmentSyncRow = Prisma.AppointmentGetPayload<{
  select: typeof appointmentSyncSelect;
}>;

export const toAppointmentSyncPayload = (row: AppointmentSyncRow) => ({
  id: row.id,
  patientId: row.patientId,
  doctorProfileId: row.doctorProfileId,
  scheduledAt: row.scheduledAt.toISOString(),
  durationMinutes: row.durationMinutes,
  reason: row.reason,
  status: row.status,
  updatedAt: row.updatedAt.toISOString(),
});

export async function recordAppointmentSyncChange(
  client: PrismaExecutor,
  appointmentId: string,
  operation: SyncChangeOperation,
) {
  const appointment = await client.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    select: {
      ...appointmentSyncSelect,
      patient: { select: { workspace: { select: { id: true } } } },
    },
  });
  if (!appointment.patient.workspace) {
    throw new Error('Rendez-vous introuvable dans un workspace.');
  }
  const payload = toAppointmentSyncPayload(appointment);
  await client.syncChange.create({
    data: {
      workspaceId: appointment.patient.workspace.id,
      patientId: appointment.patientId,
      entityType: SyncEntityType.APPOINTMENT,
      entityId: appointment.id,
      operation,
      payload,
    },
  });
  return payload;
}
