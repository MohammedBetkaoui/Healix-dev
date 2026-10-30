import { computeSyncOperationHash } from '../../../src/sync/sync-operation-hash';
import { envelopeOf } from '../support/desktop-device';
import { adapters, markerOf } from '../support/entities';
import { SYNC_PUSH } from '../support/network-fault-controller';
import { OfflineE2EStack } from '../support/stack';
import { trace } from '../support/wait';

// Scénarios 5, 6 et 51 (P0) — l'ACK est perdu, l'utilisateur modifie, le
// réseau revient : X est rejoué avec son payload A, le serveur renvoie son
// résultat durable, puis une nouvelle opération Y porte B avec la version de
// l'ACK. Cloud = Desktop = B, une seule entité, aucun conflit parasite.
describe.each(adapters)('Offline E2E — lost ACK — $entity', (adapter) => {
  let stack: OfflineE2EStack;

  beforeAll(async () => {
    stack = await OfflineE2EStack.start();
  });
  afterAll(async () => {
    await stack.stop();
  });

  it('lost ACK after CREATE: X/A is retried untouched, then Y/B is created from the ACK version', async () => {
    const clinic = await stack.fixtures.clinic(
      `s05-${adapter.entity.toLowerCase()}`,
    );
    const patientId = clinic.alpha.id;
    const desktop = await stack.desktop(clinic, 'A');
    await desktop.register();

    // 1. Offline: create A.
    desktop.network.goOffline();
    const requestsBeforeOffline = desktop.network.count();
    const created = await adapter.save(desktop, patientId, 'A');
    expect(created.ok).toBe(true);
    const { localId, operationId: x } = created.result!;
    let local = await desktop.local();
    expect(local.outboxFor(localId)).toHaveLength(1);
    expect(local.outbox(x)).toMatchObject({
      status: 'PENDING',
      attempt_count: 0,
      operation: 'CREATE',
    });
    expect(desktop.network.count()).toBe(requestsBeforeOffline);

    // 2. Back online, but the answer of the push will be lost.
    desktop.network.restoreNetwork();
    desktop.network.dropResponse(SYNC_PUSH);
    const lost = await desktop.sync();
    expect(lost.ok).toBe(false);
    expect(desktop.network.allFaultsFired()).toBe(true);

    // The Cloud applied A and stored the durable result; the Desktop never knew.
    const cloudAfterLoss = await adapter.cloudRows(stack.probe, patientId);
    expect(cloudAfterLoss).toHaveLength(1);
    expect(adapter.cloudMarker(cloudAfterLoss[0])).toBe(markerOf(adapter, 'A'));
    expect(cloudAfterLoss[0].syncVersion).toBe(1);
    const durable = await stack.probe.operation(x);
    expect(durable).toMatchObject({ status: 'ACK', deviceId: local.deviceId });
    local = await desktop.local();
    const attempted = local.outbox(x)!;
    expect(attempted).toMatchObject({ status: 'PENDING', attempt_count: 1 });
    expect(local.mappingFor(localId)).toBeUndefined();
    const frozenEnvelope = attempted.payload;

    // 3. The clinician edits A -> B. The attempted operation stays frozen.
    const edited = await adapter.save(desktop, patientId, 'B', localId);
    expect(edited.ok).toBe(true);
    local = await desktop.local();
    expect(local.outboxFor(localId)).toHaveLength(1);
    expect(local.outbox(x)!.payload).toBe(frozenEnvelope);
    expect(adapter.envelopeMarker(local.outbox(x)!)).toBe(
      markerOf(adapter, 'A'),
    );
    expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'B'));

    // 4. Network restored: the first sync replays X/A and gets the durable ACK.
    const replay = await desktop.sync();
    expect(replay).toMatchObject({ ok: true });
    local = await desktop.local();
    expect(local.outbox(x)).toMatchObject({ status: 'ACK', attempt_count: 2 });
    expect(local.outbox(x)!.payload).toBe(frozenEnvelope);
    const serverId = cloudAfterLoss[0].id as string;
    expect(local.mappingFor(localId)?.server_entity_id).toBe(serverId);
    const followUps = local
      .outboxFor(localId)
      .filter((row) => row.operation_id !== x);
    expect(followUps).toHaveLength(1);
    const y = followUps[0];
    expect(y).toMatchObject({
      operation: 'UPDATE',
      base_version: 1,
      attempt_count: 0,
    });
    expect(y.operation_id).not.toBe(x);
    expect(adapter.envelopeMarker(y)).toBe(markerOf(adapter, 'B'));
    // B is still local: the replay never overwrote it with the Cloud's A.
    expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'B'));
    expect(local.openConflicts()).toHaveLength(0);

    // 5. The next sync sends Y/B on top of the ACK version.
    const send = await desktop.sync();
    expect(send).toMatchObject({ ok: true });

    const cloud = await adapter.cloudRows(stack.probe, patientId);
    expect(cloud).toHaveLength(1);
    expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'B'));
    expect(cloud[0].syncVersion).toBe(2);
    expect(
      cloud[0].status === 'DRAFT' || adapter.entity === 'CONSULTATION',
    ).toBe(true);

    const operations = await stack.probe.operations(local.deviceId);
    const byId = new Map(
      operations.map((operation) => [operation.operationId, operation]),
    );
    expect(byId.get(x)).toMatchObject({ status: 'ACK' });
    expect(byId.get(y.operation_id)).toMatchObject({
      status: 'ACK',
      baseVersion: 1,
    });
    expect(byId.get(x)!.payloadHash).toBe(
      computeSyncOperationHash(envelopeOf(attempted)),
    );
    expect(
      operations.filter((operation) => operation.entityType === adapter.entity),
    ).toHaveLength(2);
    expect(await stack.probe.entityMaps(local.deviceId)).toHaveLength(1);

    local = await desktop.local();
    expect(local.outbox(y.operation_id)).toMatchObject({ status: 'ACK' });
    expect(
      local.dump.outbox.filter((row) =>
        ['PENDING', 'RETRYABLE'].includes(row.status),
      ),
    ).toHaveLength(0);
    expect(local.openConflicts()).toHaveLength(0);
    expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'B'));
    expect(adapter.localRow(local, localId)).toMatchObject({
      server_id: serverId,
      base_version: 2,
      local_status: 'SYNCED',
    });
    expect((await desktop.status()).result).toMatchObject({
      pendingCount: 0,
      conflictCount: 0,
      state: 'ONLINE',
    });
    trace('lost-ack-create', {
      entity: adapter.entity,
      x,
      y: y.operation_id,
      serverVersion: cloud[0].syncVersion,
    });
  });

  it('lost ACK after UPDATE: X/A retried at N+1, then Y/B on baseVersion N+1 gives N+2', async () => {
    const clinic = await stack.fixtures.clinic(
      `s06-${adapter.entity.toLowerCase()}`,
    );
    const patientId = clinic.alpha.id;
    const desktop = await stack.desktop(clinic, 'A');
    await desktop.register();

    // Establish the entity on the Cloud at version N = 1, ACKed and in sync.
    const created = await adapter.save(desktop, patientId, 'A');
    const { localId } = created.result!;
    expect(await desktop.sync()).toMatchObject({ ok: true });
    let local = await desktop.local();
    expect(adapter.localRow(local, localId)).toMatchObject({
      base_version: 1,
      local_status: 'SYNCED',
    });

    // Offline update A' (variant B) -> pushed, ACK lost.
    desktop.network.goOffline();
    const update = await adapter.save(desktop, patientId, 'B', localId);
    expect(update.ok).toBe(true);
    const x = update.result!.operationId;
    local = await desktop.local();
    expect(local.outbox(x)).toMatchObject({
      operation: 'UPDATE',
      base_version: 1,
      attempt_count: 0,
    });
    desktop.network.restoreNetwork();
    desktop.network.dropResponse(SYNC_PUSH);
    expect((await desktop.sync()).ok).toBe(false);
    const rows = await adapter.cloudRows(stack.probe, patientId);
    expect(rows).toHaveLength(1);
    expect(rows[0].syncVersion).toBe(2);
    expect(adapter.cloudMarker(rows[0])).toBe(markerOf(adapter, 'B'));
    const frozenEnvelope = (await desktop.local()).outbox(x)!.payload;

    // Local C while the ACK of X (version 2) is unknown.
    expect((await adapter.save(desktop, patientId, 'C', localId)).ok).toBe(
      true,
    );
    local = await desktop.local();
    expect(local.outbox(x)!.payload).toBe(frozenEnvelope);
    expect(
      local
        .outboxFor(localId)
        .filter((row) => ['PENDING', 'RETRYABLE'].includes(row.status)),
    ).toHaveLength(1);

    // Reconnect: X is replayed and answered from the durable result.
    expect((await desktop.sync()).ok).toBe(true);
    local = await desktop.local();
    expect(local.outbox(x)).toMatchObject({ status: 'ACK' });
    expect(local.outbox(x)!.payload).toBe(frozenEnvelope);
    const y = local
      .outboxFor(localId)
      .find((row) => ['PENDING', 'RETRYABLE'].includes(row.status))!;
    expect(y.operation_id).not.toBe(x);
    expect(y.base_version).toBe(2);
    expect(adapter.envelopeMarker(y)).toBe(markerOf(adapter, 'C'));
    expect(local.openConflicts()).toHaveLength(0);

    expect((await desktop.sync()).ok).toBe(true);
    const cloud = await adapter.cloudRows(stack.probe, patientId);
    expect(cloud).toHaveLength(1);
    expect(cloud[0].syncVersion).toBe(3);
    expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'C'));
    local = await desktop.local();
    expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'C'));
    expect(adapter.localRow(local, localId)).toMatchObject({
      base_version: 3,
      local_status: 'SYNCED',
    });
    expect(local.openConflicts()).toHaveLength(0);
    expect((await stack.probe.operation(y.operation_id))!.baseVersion).toBe(2);
    trace('lost-ack-update', {
      entity: adapter.entity,
      x,
      y: y.operation_id,
      serverVersion: cloud[0].syncVersion,
    });
  });
});
