import { payloadOf } from '../support/desktop-device';
import { adapters, markerOf } from '../support/entities';
import {
  consultationDraft,
  prescriptionDraft,
  prescriptionItem,
} from '../support/operations';
import { OfflineE2EStack } from '../support/stack';

// Scénarios 2, 3 et 4 — création hors ligne (coalescing avant la première
// tentative), puis reconnexion normale : reconcile, push, pull, ack.
describe('Offline E2E — offline creation and normal reconnection', () => {
  let stack: OfflineE2EStack;

  beforeAll(async () => {
    stack = await OfflineE2EStack.start();
  });
  afterAll(async () => {
    await stack.stop();
  });

  it('CONSULTATION: LOCAL_DRAFT -> edits -> READY_TO_SYNC offline, then one sync converges', async () => {
    const clinic = await stack.fixtures.clinic('s02');
    const desktop = await stack.desktop(clinic, 'A');
    await desktop.register();
    desktop.network.goOffline();
    const requestsAtCut = desktop.network.count();

    const saved = await desktop.saveConsultation(
      consultationDraft({
        patientId: clinic.alpha.id,
        chiefComplaint: 'Fièvre E2E',
      }),
    );
    const { localId, operationId } = saved.result!;
    for (const [status, assessment] of [
      ['IN_PROGRESS', 'Piste virale'],
      ['READY_TO_SYNC', 'Syndrome viral E2E'],
    ] as const) {
      const again = await desktop.saveConsultation(
        consultationDraft({
          patientId: clinic.alpha.id,
          localId,
          chiefComplaint: 'Fièvre E2E',
          localStatus: status,
          assessment,
        }),
      );
      // Coalesced: the same operation keeps carrying the latest content.
      expect(again.result!.operationId).toBe(operationId);
    }

    let local = await desktop.local();
    expect(local.consultation(localId)).toMatchObject({
      local_status: 'READY_TO_SYNC',
      server_id: null,
    });
    expect(local.outboxFor(localId)).toHaveLength(1);
    expect(local.outbox(operationId)).toMatchObject({
      status: 'PENDING',
      attempt_count: 0,
      operation: 'CREATE',
    });
    expect(payloadOf(local.outbox(operationId)!)).toMatchObject({
      localStatus: 'READY_TO_SYNC',
      assessment: 'Syndrome viral E2E',
    });
    expect(desktop.network.count()).toBe(requestsAtCut);
    expect(await stack.probe.consultations(clinic.alpha.id)).toHaveLength(0);

    desktop.network.restoreNetwork();
    const sync = await desktop.sync();
    expect(sync).toMatchObject({ ok: true });

    // The four calls of a session, in order.
    const calls = desktop.network
      .requests({ path: '/api/sync' })
      .slice(-4)
      .map((entry) => `${entry.method} ${entry.path}`);
    expect(calls).toEqual([
      'POST /api/sync/reconcile',
      'POST /api/sync/push',
      'GET /api/sync/pull',
      'POST /api/sync/ack',
    ]);

    const cloud = await stack.probe.consultations(clinic.alpha.id);
    expect(cloud).toHaveLength(1);
    expect(cloud[0]).toMatchObject({
      chiefComplaint: 'Fièvre E2E',
      assessment: 'Syndrome viral E2E',
      status: 'COMPLETED',
      syncVersion: 1,
    });
    const operation = await stack.probe.operation(operationId);
    expect(operation).toMatchObject({
      status: 'ACK',
      deviceId: local.deviceId,
      baseVersion: null,
    });
    const maps = await stack.probe.entityMaps(local.deviceId);
    expect(maps).toEqual([
      expect.objectContaining({
        localEntityId: localId,
        serverEntityId: cloud[0].id,
      }),
    ]);

    local = await desktop.local();
    expect(local.outbox(operationId)).toMatchObject({
      status: 'ACK',
      attempt_count: 1,
    });
    expect(local.mappingFor(localId)?.server_entity_id).toBe(cloud[0].id);
    expect(local.consultation(localId)).toMatchObject({
      server_id: cloud[0].id,
      base_version: 1,
      local_status: 'SYNCED',
    });
    expect(local.dump.conflicts).toHaveLength(0);
    // The acknowledged cursor reached the Cloud's feed.
    const device = await stack.probe.device(local.deviceId);
    expect(device.id).toBe(local.deviceId);
    expect(local.cursor).not.toBe('');
    expect((await desktop.status()).result).toMatchObject({
      pendingCount: 0,
      conflictCount: 0,
    });
  });

  it('PRESCRIPTION DRAFT: many offline saves coalesce into one operation with the last content', async () => {
    const clinic = await stack.fixtures.clinic('s03');
    const desktop = await stack.desktop(clinic, 'A');
    await desktop.register();
    desktop.network.goOffline();
    const requestsAtCut = desktop.network.count();

    const first = await desktop.savePrescription(
      prescriptionDraft({
        patientId: clinic.alpha.id,
        items: [prescriptionItem()],
      }),
    );
    const { localId, operationId } = first.result!;
    const edits = [
      prescriptionItem({ dosePerIntake: '2 comprimés' }),
      prescriptionItem({
        dosePerIntake: '2 comprimés',
        frequency: '2 fois par jour',
      }),
      prescriptionItem({
        dosePerIntake: '2 comprimés',
        frequency: '2 fois par jour',
        durationDays: 7,
      }),
    ];
    for (const item of edits) {
      const again = await desktop.savePrescription(
        prescriptionDraft({
          patientId: clinic.alpha.id,
          localId,
          items: [item],
        }),
      );
      expect(again.result!.operationId).toBe(operationId);
    }
    // A second medication, last save.
    const finalItems = [
      edits[2],
      prescriptionItem({
        dci: 'Ibuprofène E2E',
        medicationId: null,
        strength: '200 mg',
        durationDays: 3,
      }),
    ];
    await desktop.savePrescription(
      prescriptionDraft({
        patientId: clinic.alpha.id,
        localId,
        items: finalItems,
      }),
    );

    let local = await desktop.local();
    expect(local.outboxFor(localId)).toHaveLength(1);
    expect(local.outbox(operationId)).toMatchObject({
      status: 'PENDING',
      attempt_count: 0,
      operation: 'CREATE',
    });
    const stored = payloadOf(local.outbox(operationId)!);
    expect(stored.items).toHaveLength(2);
    expect(stored.items[0]).toMatchObject({
      dosePerIntake: '2 comprimés',
      frequency: '2 fois par jour',
      durationDays: 7,
    });
    expect(local.prescription(localId)).toMatchObject({
      number: null,
      local_status: 'PENDING_SYNC',
      server_id: null,
    });
    expect(desktop.network.count()).toBe(requestsAtCut);

    desktop.network.restoreNetwork();
    expect(await desktop.sync()).toMatchObject({ ok: true });

    const cloud = await stack.probe.prescriptions(clinic.alpha.id);
    expect(cloud).toHaveLength(1);
    expect(cloud[0]).toMatchObject({
      status: 'DRAFT',
      syncVersion: 1,
      number: null,
    });
    expect(cloud[0].items.map((item) => item.dci)).toEqual([
      'Paracétamol E2E',
      'Ibuprofène E2E',
    ]);
    expect(cloud[0].items[0]).toMatchObject({
      dosePerIntake: '2 comprimés',
      frequency: '2 fois par jour',
      durationDays: 7,
    });
    // Offline never produces an official order: no ORD number, no PDF.
    expect(
      await stack.prisma.prescriptionDocument.count({
        where: { prescriptionId: cloud[0].id },
      }),
    ).toBe(0);
    expect(cloud[0].validatedAt).toBeNull();

    local = await desktop.local();
    expect(local.outbox(operationId)).toMatchObject({ status: 'ACK' });
    expect(local.mappingFor(localId)?.server_entity_id).toBe(cloud[0].id);
    expect(local.prescription(localId)).toMatchObject({
      server_id: cloud[0].id,
      base_version: 1,
      local_status: 'SYNCED',
      server_status: 'DRAFT',
      number: null,
    });
    expect(local.dump.conflicts).toHaveLength(0);
  });

  it.each(adapters)(
    '$entity: a save after the first network attempt does not rewrite the attempted operation',
    async (adapter) => {
      const clinic = await stack.fixtures.clinic(
        `s02b-${adapter.entity.toLowerCase()}`,
      );
      const desktop = await stack.desktop(clinic, 'A');
      await desktop.register();
      const saved = await adapter.save(desktop, clinic.alpha.id, 'A');
      const { localId, operationId } = saved.result!;
      // A refused attempt (the network is out) still freezes the operation.
      desktop.network.goOffline();
      expect((await desktop.sync()).ok).toBe(false);
      let local = await desktop.local();
      expect(local.outbox(operationId)).toMatchObject({ attempt_count: 0 });
      desktop.network.restoreNetwork();
      desktop.network.cutConnection({ method: 'POST', path: '/api/sync/push' });
      expect((await desktop.sync()).ok).toBe(false);
      local = await desktop.local();
      expect(local.outbox(operationId)).toMatchObject({
        attempt_count: 1,
        status: 'PENDING',
      });
      const frozen = local.outbox(operationId)!.payload;
      await adapter.save(desktop, clinic.alpha.id, 'B', localId);
      local = await desktop.local();
      expect(local.outboxFor(localId)).toHaveLength(1);
      expect(local.outbox(operationId)!.payload).toBe(frozen);
      expect(adapter.envelopeMarker(local.outbox(operationId)!)).toBe(
        markerOf(adapter, 'A'),
      );
      expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'B'));
      expect(
        await adapter.cloudRows(stack.probe, clinic.alpha.id),
      ).toHaveLength(0);
    },
  );
});
