import {
  canonicalizeSyncJson,
  computeSyncOperationHash,
} from './sync-operation-hash';

describe('sync operation semantic hash', () => {
  const base = {
    operationId: '6d915e2c-ef3f-47c4-bb73-f7fcb55db694',
    entityType: 'CONSULTATION' as const,
    localEntityId: '471b8c78-09d2-4b81-b8cb-af0e0b2780c7',
    operation: 'UPDATE' as const,
    baseVersion: 3,
    occurredAt: '2026-10-30T12:00:00.000Z',
  };

  it('canonicalizes object key order', () => {
    expect(canonicalizeSyncJson({ b: 2, a: 1 })).toBe(
      canonicalizeSyncJson({ a: 1, b: 2 }),
    );
  });

  it('hashes the semantic operation, not transport metadata', () => {
    const first = computeSyncOperationHash({
      ...base,
      payload: { b: 2, a: 1 },
    } as any);
    const same = computeSyncOperationHash({
      ...base,
      occurredAt: '2026-10-30T13:00:00.000Z',
      payload: { a: 1, b: 2 },
    } as any);
    const changed = computeSyncOperationHash({
      ...base,
      payload: { a: 2, b: 2 },
    } as any);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(same).toBe(first);
    expect(changed).not.toBe(first);
  });
});
