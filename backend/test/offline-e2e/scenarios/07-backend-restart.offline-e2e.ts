import { adapters } from '../support/entities';
import { SYNC_PUSH } from '../support/network-fault-controller';
import { OfflineE2EStack } from '../support/stack';

// Scénario 11 — le Backend est tué (SIGKILL) autour d'un push puis relancé.
// L'opération et la mutation clinique sont une seule transaction : le Cloud
// n'a jamais l'une sans l'autre, et le retry est sûr dans les deux cas.
describe.each(adapters)(
  'Offline E2E — Backend restart — $entity',
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

    it('killed before it processes the push: nothing applied, the retry creates the entity once', async () => {
      const { desktop, patientId, localId, operationId } =
        await prepare('s11a');
      desktop.network.around(SYNC_PUSH, { before: () => stack.backend.kill() });
      expect((await desktop.sync()).ok).toBe(false);
      expect(stack.backend.running).toBe(false);
      expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(0);
      expect(
        await stack.prisma.syncOperation.count({ where: { operationId } }),
      ).toBe(0);
      expect((await desktop.local()).outbox(operationId)).toMatchObject({
        status: 'PENDING',
        attempt_count: 1,
      });

      await stack.backend.start();
      expect(await desktop.sync()).toMatchObject({ ok: true });
      const cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud).toHaveLength(1);
      const local = await desktop.local();
      expect(local.outbox(operationId)).toMatchObject({
        status: 'ACK',
        attempt_count: 2,
      });
      expect(local.mappingFor(localId)?.server_entity_id).toBe(cloud[0].id);
      expect(await stack.probe.operations(local.deviceId)).toHaveLength(1);
    });

    it('killed right after the mutation committed (answer lost): the new process serves the durable result', async () => {
      const { desktop, patientId, localId, operationId } =
        await prepare('s11b');
      desktop.network.around(SYNC_PUSH, {
        after: () => stack.backend.kill(),
        dropResponse: true,
      });
      expect((await desktop.sync()).ok).toBe(false);
      expect(stack.backend.running).toBe(false);

      // Committed: operation, mutation and mapping are all there, or none is.
      const cloudBefore = await adapter.cloudRows(stack.probe, patientId);
      expect(cloudBefore).toHaveLength(1);
      const durable = await stack.probe.operation(operationId);
      expect(durable).toMatchObject({ status: 'ACK' });
      expect(durable!.result).toMatchObject({
        serverEntityId: cloudBefore[0].id,
        serverVersion: 1,
      });
      expect((await desktop.local()).outbox(operationId)).toMatchObject({
        status: 'PENDING',
        attempt_count: 1,
      });

      await stack.backend.start();
      expect(await desktop.sync()).toMatchObject({ ok: true });
      const cloud = await adapter.cloudRows(stack.probe, patientId);
      expect(cloud).toHaveLength(1);
      expect(cloud[0].id).toBe(cloudBefore[0].id);
      expect(cloud[0].syncVersion).toBe(1);
      const local = await desktop.local();
      expect(local.outbox(operationId)).toMatchObject({ status: 'ACK' });
      expect(local.mappingFor(localId)?.server_entity_id).toBe(cloud[0].id);
      expect(local.openConflicts()).toHaveLength(0);
      expect(await stack.probe.operations(local.deviceId)).toHaveLength(1);
      expect(await stack.probe.entityMaps(local.deviceId)).toHaveLength(1);
    });

    it('never leaves a half-applied operation: no durable operation without its entity, none stuck PROCESSING', async () => {
      const { clinic } = await prepare('s11c');
      const operations = await stack.prisma.syncOperation.findMany({
        where: { workspaceId: clinic.workspaceId },
      });
      expect(
        operations.filter((operation) => operation.status === 'PROCESSING'),
      ).toHaveLength(0);
      for (const operation of operations.filter(
        (row) => row.status === 'ACK',
      )) {
        const result = operation.result as { serverEntityId: string };
        const exists =
          operation.entityType === 'CONSULTATION'
            ? await stack.prisma.patientConsultation.count({
                where: { id: result.serverEntityId },
              })
            : await stack.prisma.prescription.count({
                where: { id: result.serverEntityId },
              });
        expect(exists).toBe(1);
      }
    });
  },
);

describe('Offline E2E — Backend restart — anti-replay survives', () => {
  let stack: OfflineE2EStack;

  beforeAll(async () => {
    stack = await OfflineE2EStack.start();
  });
  afterAll(async () => {
    await stack.stop();
  });

  it('a nonce spent before a restart is still refused after it (durable table)', async () => {
    const clinic = await stack.fixtures.clinic('s11-nonce');
    const device = await stack.rawDevice(clinic, 'nonce');
    const first = await device.reconcile();
    expect(first.status).toBe(201);
    await stack.backend.restart();
    const replay = await device.reconcile({ nonce: first.nonce });
    expect(replay.status).toBe(401);
    expect(JSON.stringify(replay.body)).toContain('rejoué');
    // The grant itself is still honoured by the restarted process.
    expect((await device.reconcile()).status).toBe(201);
  });
});
