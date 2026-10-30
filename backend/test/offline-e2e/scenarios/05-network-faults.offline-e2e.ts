import { adapters, markerOf } from '../support/entities';
import { SYNC_PUSH } from '../support/network-fault-controller';
import { OfflineE2EStack } from '../support/stack';

// Scénarios 7, 8, 23 et 24 — timeout ambigu, reset TCP, latence, requête
// dupliquée. Dans tous les cas : même operationId, même enveloppe figée, une
// seule mutation, aucune perte.
describe.each(adapters)('Offline E2E — network faults — $entity', (adapter) => {
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

  const expectConverged = async (
    desktop: Awaited<ReturnType<typeof prepare>>['desktop'],
    patientId: string,
    localId: string,
    operationId: string,
  ) => {
    const cloud = await adapter.cloudRows(stack.probe, patientId);
    expect(cloud).toHaveLength(1);
    const local = await desktop.local();
    expect(local.outbox(operationId)).toMatchObject({ status: 'ACK' });
    expect(local.mappingFor(localId)?.server_entity_id).toBe(cloud[0].id);
    expect(local.openConflicts()).toHaveLength(0);
    expect(await stack.probe.entityMaps(local.deviceId)).toHaveLength(1);
    return { cloud: cloud[0], local };
  };

  it('ambiguous timeout (request processed, answer held): same operationId, same payload, no second mutation', async () => {
    const { desktop, patientId, localId, operationId } = await prepare('s07');
    desktop.httpTimeoutMs = 1_500;
    desktop.network.timeout(SYNC_PUSH, { forward: true });
    const timedOut = await desktop.sync();
    expect(timedOut.ok).toBe(false);
    expect(desktop.network.allFaultsFired()).toBe(true);

    // The Desktop cannot know; the Cloud did apply it.
    expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(1);
    const local = await desktop.local();
    expect(local.outboxFor(localId)).toHaveLength(1);
    expect(local.outbox(operationId)).toMatchObject({
      status: 'PENDING',
      attempt_count: 1,
    });
    const frozen = local.outbox(operationId)!.payload;

    desktop.httpTimeoutMs = undefined;
    expect(await desktop.sync()).toMatchObject({ ok: true });
    const converged = await expectConverged(
      desktop,
      patientId,
      localId,
      operationId,
    );
    expect(converged.local.outbox(operationId)!.payload).toBe(frozen);
    expect(converged.local.outbox(operationId)!.attempt_count).toBe(2);
    // The very same operation went twice; the Cloud holds it once.
    const operations = await stack.probe.operations(converged.local.deviceId);
    expect(
      operations.filter((operation) => operation.operationId === operationId),
    ).toHaveLength(1);
    expect(operations).toHaveLength(1);
    expect(converged.cloud.syncVersion).toBe(1);
  });

  it('timeout before the request reached the Cloud: retried as the same operation, created once', async () => {
    const { desktop, patientId, localId, operationId } = await prepare('s07b');
    desktop.httpTimeoutMs = 1_500;
    desktop.network.timeout(SYNC_PUSH, { forward: false });
    expect((await desktop.sync()).ok).toBe(false);
    expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(0);
    expect((await desktop.local()).outbox(operationId)).toMatchObject({
      status: 'PENDING',
      attempt_count: 1,
    });
    desktop.httpTimeoutMs = undefined;
    expect(await desktop.sync()).toMatchObject({ ok: true });
    await expectConverged(desktop, patientId, localId, operationId);
    expect(
      await stack.probe.operations((await desktop.local()).deviceId),
    ).toHaveLength(1);
  });

  it.each([
    ['after', 1],
    ['before', 0],
  ] as const)(
    'TCP reset %s the Cloud processed the request: nothing lost, safe retry',
    async (when, cloudCount) => {
      const { desktop, patientId, localId, operationId } = await prepare(
        `s08${when}`,
      );
      desktop.network.resetConnection(SYNC_PUSH, when);
      expect((await desktop.sync()).ok).toBe(false);
      expect(desktop.network.allFaultsFired()).toBe(true);
      expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(
        cloudCount,
      );

      let local = await desktop.local();
      expect(local.outboxFor(localId)).toHaveLength(1);
      expect(local.outbox(operationId)).toMatchObject({
        status: 'PENDING',
        attempt_count: 1,
      });
      expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'A'));
      const frozen = local.outbox(operationId)!.payload;

      expect(await desktop.sync()).toMatchObject({ ok: true });
      const converged = await expectConverged(
        desktop,
        patientId,
        localId,
        operationId,
      );
      expect(converged.local.outbox(operationId)!.payload).toBe(frozen);
      local = converged.local;
      expect(adapter.cloudMarker(converged.cloud)).toBe(markerOf(adapter, 'A'));
      expect(await stack.probe.operations(local.deviceId)).toHaveLength(1);
    },
  );

  it('latency below the timeout: the session completes, one operation, no automatic duplicate sync', async () => {
    const { desktop, patientId, localId, operationId } = await prepare('s23a');
    desktop.network.enableLatency(SYNC_PUSH, { responseMs: 3_000 });
    const startedAt = Date.now();
    expect(await desktop.sync()).toMatchObject({ ok: true });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2_800);
    // The Desktop sent the push exactly once: it waited, it did not re-send.
    expect(desktop.network.count(SYNC_PUSH)).toBe(1);
    await expectConverged(desktop, patientId, localId, operationId);
    expect((await desktop.local()).outbox(operationId)!.attempt_count).toBe(1);
  });

  it('latency above the timeout: the client gives up, the Cloud applied it, the retry converges', async () => {
    const { desktop, patientId, localId, operationId } = await prepare('s23b');
    desktop.httpTimeoutMs = 1_500;
    desktop.network.enableLatency(SYNC_PUSH, { responseMs: 4_000 }, 1);
    expect((await desktop.sync()).ok).toBe(false);
    expect(desktop.network.count(SYNC_PUSH)).toBe(1);
    expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(1);
    desktop.httpTimeoutMs = undefined;
    expect(await desktop.sync()).toMatchObject({ ok: true });
    await expectConverged(desktop, patientId, localId, operationId);
    expect(
      await stack.probe.operations((await desktop.local()).deviceId),
    ).toHaveLength(1);
  });

  it('duplicated request: one clinical mutation, the replay is stopped before the sync service', async () => {
    const { desktop, patientId, localId, operationId } = await prepare('s24');
    desktop.network.duplicateRequest(SYNC_PUSH);
    expect(await desktop.sync()).toMatchObject({ ok: true });
    expect(desktop.network.allFaultsFired()).toBe(true);
    const converged = await expectConverged(
      desktop,
      patientId,
      localId,
      operationId,
    );
    expect(converged.cloud.syncVersion).toBe(1);
    const operations = await stack.probe.operations(converged.local.deviceId);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ operationId, status: 'ACK' });
    expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(1);
  });
});
