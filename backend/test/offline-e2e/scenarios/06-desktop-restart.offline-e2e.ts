import { adapters, markerOf } from '../support/entities';
import { OfflineE2EStack } from '../support/stack';

// Scénarios 9, 10 et 12 — le Desktop est tué à des points précis du cycle de
// sync (même base SQLCipher, même coffre), puis relancé ; deux sync en même
// temps. L'enveloppe tentée est immuable, le Cloud applique une seule fois.
describe.each(adapters)(
  'Offline E2E — Desktop restart and double sync — $entity',
  (adapter) => {
    let stack: OfflineE2EStack;

    beforeAll(async () => {
      stack = await OfflineE2EStack.start();
    });
    afterAll(async () => {
      await stack.stop();
    });

    const prepare = async (label: string) => {
      const clinic = await stack.fixtures.clinic(
        `${label}-${adapter.entity.toLowerCase()}`,
      );
      const desktop = await stack.desktop(clinic, 'A');
      await desktop.register();
      const saved = await adapter.save(desktop, clinic.alpha.id, 'A');
      return { clinic, desktop, patientId: clinic.alpha.id, ...saved.result! };
    };

    it('killed after the attempt was recorded and before any HTTP push: X survives intact and is then sent', async () => {
      const { desktop, patientId, localId, operationId } = await prepare('s09');
      const before = (await desktop.local()).outbox(operationId)!;
      expect(before.attempt_count).toBe(0);

      const crashed = await desktop.sync({ crashAt: 'after-attempt-marked' });
      expect(crashed.crashed).toBe(true);
      expect(desktop.network.count({ path: '/api/sync/push' })).toBe(0);
      expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(0);

      // A new process on the same encrypted database and the same vault.
      const local = await desktop.local();
      const after = local.outbox(operationId)!;
      expect(after).toMatchObject({ status: 'PENDING', attempt_count: 1 });
      expect(after.operation_id).toBe(before.operation_id);
      expect(after.payload).toBe(before.payload);
      expect(local.outboxFor(localId)).toHaveLength(1);

      expect(await desktop.sync()).toMatchObject({ ok: true });
      const cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud).toHaveLength(1);
      const converged = await desktop.local();
      expect(converged.outbox(operationId)).toMatchObject({
        status: 'ACK',
        attempt_count: 2,
      });
      expect(converged.outbox(operationId)!.payload).toBe(before.payload);
      expect(await stack.probe.operations(converged.deviceId)).toHaveLength(1);
    });

    it.each([
      'after-push-response',
      'after-push-applied',
      'after-pull-applied',
    ])(
      'killed at %s: the restarted Desktop converges without a second mutation',
      async (crashAt) => {
        const { desktop, patientId, localId, operationId } = await prepare(
          `s10-${crashAt}`,
        );
        const frozen = (await desktop.local()).outbox(operationId)!.payload;
        const crashed = await desktop.sync({ crashAt });
        expect(crashed.crashed).toBe(true);

        // The Cloud processed X; what the Desktop knows depends on the kill point.
        const cloudAfterCrash = await adapter.cloudRows(stack.probe, patientId);
        expect(cloudAfterCrash).toHaveLength(1);
        const afterCrash = await desktop.local();
        expect(afterCrash.outbox(operationId)!.payload).toBe(frozen);
        expect(afterCrash.outboxFor(localId)).toHaveLength(1);
        if (crashAt === 'after-push-response') {
          expect(afterCrash.outbox(operationId)).toMatchObject({
            status: 'PENDING',
            attempt_count: 1,
          });
          expect(afterCrash.mappingFor(localId)).toBeUndefined();
        } else {
          expect(afterCrash.outbox(operationId)).toMatchObject({
            status: 'ACK',
          });
        }

        expect(await desktop.sync()).toMatchObject({ ok: true });
        const cloud = await adapter.cloudRows(stack.probe, patientId);
        expect(cloud).toHaveLength(1);
        expect(cloud[0].id).toBe(cloudAfterCrash[0].id);
        expect(cloud[0].syncVersion).toBe(1);
        const local = await desktop.local();
        expect(local.outbox(operationId)).toMatchObject({ status: 'ACK' });
        expect(local.mappingFor(localId)?.server_entity_id).toBe(cloud[0].id);
        expect(local.openConflicts()).toHaveLength(0);
        expect(adapter.localMarker(local, localId)).toBe(
          markerOf(adapter, 'A'),
        );
        expect(await stack.probe.operations(local.deviceId)).toHaveLength(1);
        expect(await stack.probe.entityMaps(local.deviceId)).toHaveLength(1);
      },
    );

    it('killed after the Cloud answered, the clinician then edits: the relaunched Desktop replays X/A and sends B', async () => {
      const { desktop, patientId, localId, operationId } =
        await prepare('s10edit');
      expect(
        (await desktop.sync({ crashAt: 'after-push-response' })).crashed,
      ).toBe(true);
      expect((await adapter.save(desktop, patientId, 'B', localId)).ok).toBe(
        true,
      );
      expect((await desktop.sync()).ok).toBe(true);
      expect((await desktop.sync()).ok).toBe(true);
      const cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud).toHaveLength(1);
      expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'B'));
      expect(cloud[0].syncVersion).toBe(2);
      const local = await desktop.local();
      expect(local.openConflicts()).toHaveLength(0);
      expect(
        local.dump.outbox.filter((row) => row.operation_id === operationId),
      ).toHaveLength(1);
      expect(adapter.envelopeMarker(local.outbox(operationId)!)).toBe(
        markerOf(adapter, 'A'),
      );
    });

    it('two sync_now() at the same time: no duplicate, one mapping, no parasitic follow-up', async () => {
      const { desktop, patientId, localId, operationId } = await prepare('s12');
      // The hardest shape: an ACK-less attempt plus a newer local edit, so that a
      // double application of the ACK would queue two follow-ups.
      desktop.network.dropResponse({ method: 'POST', path: '/api/sync/push' });
      expect((await desktop.sync()).ok).toBe(false);
      expect((await adapter.save(desktop, patientId, 'B', localId)).ok).toBe(
        true,
      );

      const both = await desktop.syncConcurrent(2);
      expect(both.ok).toBe(true);

      let local = await desktop.local();
      const followUps = local
        .outboxFor(localId)
        .filter((row) => row.operation_id !== operationId);
      expect(followUps.length).toBeLessThanOrEqual(1);
      expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(1);
      expect(await stack.probe.entityMaps(local.deviceId)).toHaveLength(1);

      // Whatever the interleaving, the next sync settles on B, once.
      expect((await desktop.sync()).ok).toBe(true);
      const cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud).toHaveLength(1);
      expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'B'));
      expect(cloud[0].syncVersion).toBe(2);
      local = await desktop.local();
      expect(local.openConflicts()).toHaveLength(0);
      expect(
        local.outboxFor(localId).filter((row) => row.status !== 'ACK'),
      ).toHaveLength(0);
      expect(local.outboxFor(localId)).toHaveLength(2);
      const operations = await stack.probe.operations(local.deviceId);
      expect(
        operations.filter(
          (operation) => operation.entityType === adapter.entity,
        ),
      ).toHaveLength(2);
    });
  },
);
