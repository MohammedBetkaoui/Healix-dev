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

  it('treats an object property set to undefined as an absent key', () => {
    expect(
      canonicalizeSyncJson({
        patientId: 'p1',
        optional: undefined,
      }),
    ).toBe(canonicalizeSyncJson({ patientId: 'p1' }));
  });

  it('treats undefined nested deeply inside the payload as absent too', () => {
    expect(
      canonicalizeSyncJson({
        vitalSigns: { bloodPressure: '12/8', spo2: undefined },
        diagnoses: [{ label: 'Palu', code: undefined }],
      }),
    ).toBe(
      canonicalizeSyncJson({
        vitalSigns: { bloodPressure: '12/8' },
        diagnoses: [{ label: 'Palu' }],
      }),
    );
  });

  it('keeps an explicit null distinct from an omitted key', () => {
    expect(canonicalizeSyncJson({ appointmentId: null })).not.toBe(
      canonicalizeSyncJson({}),
    );
  });

  it('serializes an undefined array item as JSON null, keeping the order significant', () => {
    // JSON.stringify([1, undefined, 2]) === '[1,null,2]'.
    expect(canonicalizeSyncJson([1, undefined, 2])).toBe('[1,null,2]');
    expect(canonicalizeSyncJson([1, undefined, 2])).not.toBe(
      canonicalizeSyncJson([1, 2]),
    );
    expect(canonicalizeSyncJson([1, undefined, 2])).not.toBe(
      canonicalizeSyncJson([2, undefined, 1]),
    );
  });

  it('still refuses the values JSON cannot carry', () => {
    expect(() => canonicalizeSyncJson(() => {})).toThrow(TypeError);
    expect(() => canonicalizeSyncJson(Symbol('x'))).toThrow(TypeError);
    expect(() => canonicalizeSyncJson(10n)).toThrow(TypeError);
    expect(() => canonicalizeSyncJson(NaN)).toThrow(TypeError);
    expect(() => canonicalizeSyncJson(Infinity)).toThrow(TypeError);
    expect(() => canonicalizeSyncJson({ deep: { fn: () => {} } })).toThrow(
      TypeError,
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

  it('hashes a payload with an explicit undefined optional identically to one without it', () => {
    const first = computeSyncOperationHash({
      ...base,
      payload: {
        patientId: 'p1',
        appointmentId: undefined,
        chiefComplaint: 'Suivi',
      },
    } as any);
    const same = computeSyncOperationHash({
      ...base,
      payload: { patientId: 'p1', chiefComplaint: 'Suivi' },
    } as any);
    const changed = computeSyncOperationHash({
      ...base,
      payload: { patientId: 'p1', chiefComplaint: 'Suivi' },
      baseVersion: 4,
    } as any);

    expect(same).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('changes the hash on a real clinical change only', () => {
    const first = computeSyncOperationHash({
      ...base,
      payload: { dose: '500 mg' },
    } as any);
    const changed = computeSyncOperationHash({
      ...base,
      payload: { dose: '1000 mg' },
    } as any);

    expect(changed).not.toBe(first);
  });
});
