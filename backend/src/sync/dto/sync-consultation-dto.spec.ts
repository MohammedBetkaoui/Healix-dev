import 'reflect-metadata';

import { SyncEntityType, SyncOperationKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { parseSyncOperationPayload, type SyncOperationDto } from './sync.dto';

// The service validates the payload of every operation with
// parseSyncOperationPayload (whitelist + forbidNonWhitelisted, nested objects
// included): an operation that does not fit is REJECTED. The desktop must send
// the DTO shape and nothing else.
const parse = (payload: Record<string, unknown>) =>
  parseSyncOperationPayload({
    operationId: randomUUID(),
    entityType: SyncEntityType.CONSULTATION,
    localEntityId: randomUUID(),
    operation: SyncOperationKind.UPDATE,
    baseVersion: 3,
    occurredAt: '2026-10-30T09:40:00.000Z',
    payload: { patientId: 'patient-1', localStatus: 'IN_PROGRESS', ...payload },
  } satisfies SyncOperationDto);

const vitalSigns = {
  systolicBp: 150,
  diastolicBp: 95,
  heartRate: 80,
  respiratoryRate: 16,
  oxygenSaturation: 97.5,
  temperature: 37.2,
  weightKg: 82.5,
  heightCm: 178,
};
const diagnoses = [
  {
    label: 'Hypertension artérielle',
    code: 'I10',
    codeSystem: 'CIM-10',
    isPrimary: true,
  },
  { label: 'Surpoids', isPrimary: false },
];

describe('the consultation operation sent by the desktop', () => {
  it('accepts vital signs, diagnoses and an appointment link in the DTO shape', () => {
    const result = parse({
      appointmentId: 'appointment-1',
      localStatus: 'READY_TO_SYNC',
      chiefComplaint: 'Douleur thoracique',
      vitalSigns,
      diagnoses,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a payload with no appointmentId key, null vital signs and no diagnosis', () => {
    expect(
      parse({
        localStatus: 'LOCAL_DRAFT',
        chiefComplaint: 'Toux',
        vitalSigns: null,
        diagnoses: [],
      }).ok,
    ).toBe(true);
  });

  it('refuses the ids and timestamps of a server snapshot, hence the normalization on the desktop', () => {
    expect(
      parse({
        vitalSigns: {
          ...vitalSigns,
          id: 'v1',
          consultationId: 'c1',
          createdAt: '2026-10-28T09:30:00.000Z',
        },
      }).ok,
    ).toBe(false);
    expect(
      parse({
        diagnoses: [
          { ...diagnoses[0], id: 'd1', createdAt: '2026-10-28T09:40:00.000Z' },
        ],
      }).ok,
    ).toBe(false);
    // And any other key the DTO does not know, at the top level too.
    expect(parse({ addenda: [] }).ok).toBe(false);
  });

  it('holds vital signs and diagnoses to the bounds the desktop checks before saving', () => {
    for (const bad of [
      { vitalSigns: { systolicBp: 301 } },
      { vitalSigns: { systolicBp: 39 } },
      { vitalSigns: { diastolicBp: 201 } },
      { vitalSigns: { diastolicBp: 19 } },
      { vitalSigns: { heartRate: 19 } },
      { vitalSigns: { heartRate: 301 } },
      { vitalSigns: { respiratoryRate: 4 } },
      { vitalSigns: { respiratoryRate: 101 } },
      { vitalSigns: { oxygenSaturation: 100.5 } },
      { vitalSigns: { temperature: 24.5 } },
      { vitalSigns: { temperature: 45.5 } },
      { vitalSigns: { weightKg: 0 } },
      { vitalSigns: { weightKg: 701 } },
      { vitalSigns: { heightCm: 9 } },
      { vitalSigns: { heightCm: 301 } },
      { diagnoses: [{ label: '' }] },
      { diagnoses: [{ label: 'x'.repeat(501) }] },
      { diagnoses: [{ label: 'A', code: 'c'.repeat(81) }] },
    ]) {
      expect(parse(bad).ok).toBe(false);
    }
    // The edges are accepted.
    expect(
      parse({
        vitalSigns: {
          systolicBp: 40,
          diastolicBp: 200,
          heartRate: 300,
          respiratoryRate: 5,
          oxygenSaturation: 100,
          temperature: 25,
          weightKg: 700,
          heightCm: 300,
        },
        diagnoses: [{ label: 'x'.repeat(500), code: 'c'.repeat(80) }],
      }).ok,
    ).toBe(true);
  });
});
