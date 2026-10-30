import { computeSyncOperationHash } from '../../../src/sync/sync-operation-hash';
import { adapters, markerOf } from '../support/entities';
import { OfflineE2EStack } from '../support/stack';

// Scénarios 13, 14 et 15 sur le vrai /sync/push (HTTP + Device PoP réels) :
// même id + même payload => même résultat ; même id + autre payload =>
// OPERATION_ID_PAYLOAD_MISMATCH ; id d'un autre appareil =>
// OPERATION_ID_ALREADY_USED.
describe.each(adapters)(
  'Offline E2E — operationId idempotency — $entity',
  (adapter) => {
    let stack: OfflineE2EStack;

    beforeAll(async () => {
      stack = await OfflineE2EStack.start();
    });
    afterAll(async () => {
      await stack.stop();
    });

    it('same operationId + same payload, twice (fresh signatures): same ACK, one mutation', async () => {
      const clinic = await stack.fixtures.clinic(
        `s13-${adapter.entity.toLowerCase()}`,
      );
      const device = await stack.rawDevice(clinic, 'one');
      const operation = adapter.operation({
        patientId: clinic.alpha.id,
        operation: 'CREATE',
        variant: 'A',
      });

      const first = await device.push([operation]);
      const second = await device.push([operation]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.nonce).not.toBe(second.nonce);
      expect(first.body.results[0]).toMatchObject({
        status: 'ACK',
        serverVersion: 1,
      });
      expect(second.body.results[0]).toEqual(first.body.results[0]);

      const cloud = await adapter.cloudRows(stack.probe, clinic.alpha.id);
      expect(cloud).toHaveLength(1);
      expect(cloud[0].syncVersion).toBe(1);
      const stored = await stack.probe.operations(device.deviceId);
      expect(stored).toHaveLength(1);
      expect(stored[0].payloadHash).toBe(
        computeSyncOperationHash(operation as never),
      );
      expect(await stack.probe.entityMaps(device.deviceId)).toHaveLength(1);
    });

    it('same operationId + different payload: REJECTED OPERATION_ID_PAYLOAD_MISMATCH, the Cloud stays on A', async () => {
      const clinic = await stack.fixtures.clinic(
        `s14-${adapter.entity.toLowerCase()}`,
      );
      const device = await stack.rawDevice(clinic, 'one');
      const operationA = adapter.operation({
        patientId: clinic.alpha.id,
        operation: 'CREATE',
        variant: 'A',
      });
      const operationB = adapter.operation({
        patientId: clinic.alpha.id,
        operation: 'CREATE',
        variant: 'B',
        operationId: operationA.operationId,
        localEntityId: operationA.localEntityId,
      });

      expect((await device.push([operationA])).body.results[0]).toMatchObject({
        status: 'ACK',
      });
      const mismatch = await device.push([operationB]);
      expect(mismatch.body.results[0]).toMatchObject({
        operationId: operationA.operationId,
        status: 'REJECTED',
        code: 'OPERATION_ID_PAYLOAD_MISMATCH',
      });
      // The clinical text never comes back in the rejection.
      expect(JSON.stringify(mismatch.body)).not.toContain(
        markerOf(adapter, 'B'),
      );

      const cloud = await adapter.cloudRows(stack.probe, clinic.alpha.id);
      expect(cloud).toHaveLength(1);
      expect(adapter.cloudMarker(cloud[0])).toBe(markerOf(adapter, 'A'));
      expect(cloud[0].syncVersion).toBe(1);
      const durable = await stack.probe.operation(operationA.operationId);
      expect(durable).toMatchObject({ status: 'ACK' });
      expect(durable!.payloadHash).toBe(
        computeSyncOperationHash(operationA as never),
      );
      expect(JSON.stringify(durable!.payload)).not.toContain(
        markerOf(adapter, 'B'),
      );
    });

    it('an operationId used by another device: REJECTED OPERATION_ID_ALREADY_USED, nothing created', async () => {
      const clinic = await stack.fixtures.clinic(
        `s15-${adapter.entity.toLowerCase()}`,
      );
      const deviceA = await stack.rawDevice(clinic, 'A');
      const deviceB = await stack.rawDevice(clinic, 'B');
      const operation = adapter.operation({
        patientId: clinic.alpha.id,
        operation: 'CREATE',
        variant: 'A',
      });

      expect((await deviceA.push([operation])).body.results[0]).toMatchObject({
        status: 'ACK',
      });
      for (const variant of ['A', 'B'] as const) {
        const attempt = await deviceB.push([
          variant === 'A'
            ? operation
            : adapter.operation({
                patientId: clinic.alpha.id,
                operation: 'CREATE',
                variant,
                operationId: operation.operationId,
                localEntityId: operation.localEntityId,
              }),
        ]);
        expect(attempt.body.results[0]).toMatchObject({
          status: 'REJECTED',
          code: 'OPERATION_ID_ALREADY_USED',
        });
      }
      expect(
        await adapter.cloudRows(stack.probe, clinic.alpha.id),
      ).toHaveLength(1);
      expect(await stack.probe.operations(deviceB.deviceId)).toHaveLength(0);
      expect(await stack.probe.entityMaps(deviceB.deviceId)).toHaveLength(0);
      // The owner is unaffected and still gets its own durable result.
      expect((await deviceA.push([operation])).body.results[0]).toMatchObject({
        status: 'ACK',
      });
    });
  },
);

describe('Offline E2E — what can never be pushed offline', () => {
  let stack: OfflineE2EStack;

  beforeAll(async () => {
    stack = await OfflineE2EStack.start();
  });
  afterAll(async () => {
    await stack.stop();
  });

  it('PATIENT and APPOINTMENT stay read-only: the push is refused at validation', async () => {
    const clinic = await stack.fixtures.clinic('s-readonly');
    const device = await stack.rawDevice(clinic, 'ro');
    for (const entityType of ['PATIENT', 'APPOINTMENT']) {
      const operation = {
        ...adapters[0].operation({
          patientId: clinic.alpha.id,
          operation: 'CREATE',
          variant: 'A',
        }),
        entityType,
      };
      const response = await device.push([operation]);
      expect(response.status).toBe(400);
    }
    expect(await stack.probe.operations(device.deviceId)).toHaveLength(0);
  });

  it('a prescription draft cannot carry an official number, a status or a validation', async () => {
    const clinic = await stack.fixtures.clinic('s-no-official');
    const device = await stack.rawDevice(clinic, 'official');
    const base = adapters[1].operation({
      patientId: clinic.alpha.id,
      operation: 'CREATE',
      variant: 'A',
    });
    for (const extra of [
      { number: 'ORD-2026-000001' },
      { status: 'VALIDATED' },
      { validatedAt: new Date().toISOString() },
    ]) {
      const operation = {
        ...base,
        operationId: crypto.randomUUID(),
        payload: { ...base.payload, ...extra },
      };
      const response = await device.push([operation]);
      expect(response.body.results[0]).toMatchObject({
        status: 'REJECTED',
        code: 'INVALID_PAYLOAD',
      });
    }
    expect(await stack.probe.prescriptions(clinic.alpha.id)).toHaveLength(0);
    expect(
      await stack.prisma.prescription.count({
        where: { number: { not: null }, workspaceId: clinic.workspaceId },
      }),
    ).toBe(0);
  });
});
