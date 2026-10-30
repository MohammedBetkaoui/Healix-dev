import { adapters, markerOf } from '../support/entities';
import { OfflineE2EStack } from '../support/stack';

// Scénario 16 — deux Desktops réels partent de la même version serveur (5).
// L'un écrit d'abord (ACK v6) ; l'autre, resté sur la version 5, reçoit
// CONFLICT. Cloud = version du premier, aucun Last-Write-Wins, rien de perdu
// côté second.
describe.each(adapters)(
  'Offline E2E — multi-device version conflict — $entity',
  (adapter) => {
    let stack: OfflineE2EStack;

    beforeAll(async () => {
      stack = await OfflineE2EStack.start();
    });
    afterAll(async () => {
      await stack.stop();
    });

    it('stale baseVersion on the second device -> CONFLICT; the Cloud keeps the first writer', async () => {
      const clinic = await stack.fixtures.clinic(
        `s16-${adapter.entity.toLowerCase()}`,
      );
      const patientId = clinic.alpha.id;
      const seeded = await adapter.seedCloud(stack, clinic, patientId, 5);

      const deviceA = await stack.desktop(clinic, 'A');
      const deviceB = await stack.desktop(clinic, 'B');
      await deviceA.register();
      await deviceB.register();
      const localA = await deviceA.local();
      const localB = await deviceB.local();
      expect(localA.deviceId).not.toBe(localB.deviceId);
      const idA = adapter.firstLocalId(localA);
      const idB = adapter.firstLocalId(localB);
      expect(adapter.localRow(localA, idA)).toMatchObject({
        server_id: seeded.id,
        base_version: 5,
      });
      expect(adapter.localRow(localB, idB)).toMatchObject({
        server_id: seeded.id,
        base_version: 5,
      });

      // Both edit offline from version 5.
      expect((await adapter.save(deviceA, patientId, 'B', idA)).ok).toBe(true);
      expect((await adapter.save(deviceB, patientId, 'C', idB)).ok).toBe(true);
      const opA = (await deviceA.local()).outboxFor(idA)[0];
      const opB = (await deviceB.local()).outboxFor(idB)[0];
      expect(opA).toMatchObject({ operation: 'UPDATE', base_version: 5 });
      expect(opB).toMatchObject({ operation: 'UPDATE', base_version: 5 });

      // A syncs first: ACK v6.
      expect(await deviceA.sync()).toMatchObject({ ok: true });
      let cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud).toHaveLength(1);
      expect(cloud[0].syncVersion).toBe(6);
      expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'B'));

      // B syncs second, still on version 5: CONFLICT, nothing overwritten.
      expect(await deviceB.sync()).toMatchObject({ ok: true });
      cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud).toHaveLength(1);
      expect(cloud[0].syncVersion).toBe(6);
      expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'B'));
      expect(adapter.cloudMarker(cloud[0])).not.toBe(markerOf(adapter, 'C'));

      const operations = await stack.probe.operations(
        (await deviceB.local()).deviceId,
      );
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        status: 'CONFLICT',
        baseVersion: 5,
      });
      expect(operations[0].result).toMatchObject({
        code: 'SYNC_CONFLICT',
        localVersion: 5,
        serverVersion: 6,
      });

      // B keeps its own work: the conflict carries it, and it is surfaced.
      const afterB = await deviceB.local();
      expect(afterB.outbox(opB.operation_id)).toMatchObject({
        status: 'CONFLICT',
      });
      const conflicts = afterB.openConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        entity_type: adapter.entity,
        local_version: 5,
        server_version: 6,
      });
      expect(conflicts[0].local_payload).toContain(markerOf(adapter, 'C'));
      expect((await deviceB.status()).result).toMatchObject({
        state: 'CONFLICT',
        conflictCount: 1,
      });

      // A second sync of B re-sends nothing and still does not overwrite.
      const pushesBefore = deviceB.network.count({
        method: 'POST',
        path: '/api/sync/push',
      });
      expect(await deviceB.sync()).toMatchObject({ ok: true });
      expect(
        deviceB.network.count({ method: 'POST', path: '/api/sync/push' }),
      ).toBe(pushesBefore);
      cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud[0].syncVersion).toBe(6);
      expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'B'));
    });
  },
);
