import { recordPrescriptionSyncChange } from '../../../src/sync/prescription-sync-change';
import { markerOf, prescriptionAdapter as adapter } from '../support/entities';
import { OfflineE2EStack } from '../support/stack';

// Scénario 33 — l'ordonnance est validée sur le Cloud pendant que le Desktop
// édite encore le brouillon hors ligne : l'ancien UPDATE ne l'écrase jamais.
describe('Offline E2E — prescription validated on the Cloud while edited offline', () => {
  let stack: OfflineE2EStack;

  beforeAll(async () => {
    stack = await OfflineE2EStack.start();
  });
  afterAll(async () => {
    await stack.stop();
  });

  it('PRESCRIPTION_NOT_EDITABLE: the validated order is untouched, the offline edit is kept, not retried', async () => {
    const clinic = await stack.fixtures.clinic('s33');
    const patientId = clinic.alpha.id;
    const desktop = await stack.desktop(clinic, 'A');
    await desktop.register();
    const { localId } = (await adapter.save(desktop, patientId, 'A')).result!;
    expect(await desktop.sync()).toMatchObject({ ok: true });

    // Offline edit B of the synced draft.
    desktop.network.goOffline();
    expect((await adapter.save(desktop, patientId, 'B', localId)).ok).toBe(
      true,
    );
    const pending = (await desktop.local())
      .outboxFor(localId)
      .find((row) => row.status === 'PENDING')!;
    expect(pending).toMatchObject({ operation: 'UPDATE', base_version: 1 });

    // The Cloud validates the order meanwhile (official number, new version).
    const [cloudDraft] = await adapter.cloudRows(stack.probe, patientId);
    const number = `ORD-E2E-${Date.now() % 100_000_000}`;
    await stack.prisma.prescription.update({
      where: { id: cloudDraft.id },
      data: {
        status: 'VALIDATED',
        number,
        validatedAt: new Date(),
        syncVersion: { increment: 1 },
      },
    });
    await recordPrescriptionSyncChange(stack.prisma, cloudDraft.id, 'UPDATE');

    desktop.network.restoreNetwork();
    expect(await desktop.sync()).toMatchObject({ ok: true });

    // Cloud: the validated order is exactly as it was.
    const cloud = await stack.probe.prescription(cloudDraft.id);
    expect(cloud).toMatchObject({
      status: 'VALIDATED',
      number,
      syncVersion: 2,
    });
    expect(adapter.cloudMarker(cloud)).toBe(markerOf(adapter, 'A'));
    const durable = await stack.probe.operation(pending.operation_id);
    expect(durable).toMatchObject({ status: 'CONFLICT' });
    expect(durable!.result).toMatchObject({
      code: 'PRESCRIPTION_NOT_EDITABLE',
      serverVersion: 2,
    });

    // Desktop: read-only, with the official number, and the edit kept aside.
    const local = await desktop.local();
    expect(local.prescription(localId)).toMatchObject({
      local_status: 'READ_ONLY',
      server_status: 'VALIDATED',
      number,
    });
    expect(local.outbox(pending.operation_id)).toMatchObject({
      status: 'CONFLICT',
    });
    const conflict = local
      .openConflicts()
      .find((row) => row.entity_type === 'PRESCRIPTION');
    expect(conflict).toBeDefined();
    expect(conflict!.local_payload).toContain(markerOf(adapter, 'B'));

    // No retry, no further edit.
    const pushes = desktop.network.count({
      method: 'POST',
      path: '/api/sync/push',
    });
    expect(await desktop.sync()).toMatchObject({ ok: true });
    expect(
      desktop.network.count({ method: 'POST', path: '/api/sync/push' }),
    ).toBe(pushes);
    expect((await adapter.save(desktop, patientId, 'C', localId)).ok).toBe(
      false,
    );
    expect((await stack.probe.prescription(cloudDraft.id)).syncVersion).toBe(2);
  });
});
