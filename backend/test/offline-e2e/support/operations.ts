import { randomUUID } from 'node:crypto';

// Sync operation envelopes shaped exactly like the ones the Desktop engine
// stores in its outbox (desktop/src-tauri/src/database.rs), for the scenarios
// that speak to /sync/push at the protocol level.

export const E2E_MEDICATION_ID = 'e2e-med-paracetamol';

export type ConsultationOperationInput = {
  operationId?: string;
  localEntityId?: string;
  patientId: string;
  operation: 'CREATE' | 'UPDATE';
  baseVersion?: number | null;
  serverEntityId?: string | null;
  localStatus?: 'LOCAL_DRAFT' | 'IN_PROGRESS' | 'READY_TO_SYNC';
  chiefComplaint: string;
};

export const consultationOperation = (input: ConsultationOperationInput) => ({
  operationId: input.operationId ?? randomUUID(),
  entityType: 'CONSULTATION' as const,
  localEntityId: input.localEntityId ?? randomUUID(),
  operation: input.operation,
  baseVersion: input.baseVersion ?? null,
  occurredAt: new Date().toISOString(),
  payload: {
    patientId: input.patientId,
    serverEntityId: input.serverEntityId ?? null,
    localStatus: input.localStatus ?? 'LOCAL_DRAFT',
    chiefComplaint: input.chiefComplaint,
    historyPresentIllness: '',
    clinicalExamination: '',
    assessment: '',
    carePlan: '',
    followUpPlan: '',
    vitalSigns: null,
    diagnoses: [],
  },
});

export const prescriptionItem = (overrides: Record<string, unknown> = {}) => ({
  medicationId: E2E_MEDICATION_ID,
  dci: 'Paracétamol E2E',
  brandName: null,
  strength: '500 mg',
  pharmaceuticalForm: 'TABLET',
  route: 'ORAL',
  manufacturer: null,
  regulatoryCategory: 'STANDARD',
  dosePerIntake: '1 comprimé',
  frequency: '3 fois par jour',
  intakeMoment: null,
  durationDays: 5,
  quantity: '1 boîte',
  patientInstructions: null,
  indication: null,
  asNeeded: false,
  renewalAllowed: false,
  substitutionAllowed: true,
  ...overrides,
});

export type PrescriptionOperationInput = {
  operationId?: string;
  localEntityId?: string;
  patientId: string;
  operation: 'CREATE' | 'UPDATE';
  baseVersion?: number | null;
  serverEntityId?: string | null;
  items?: Record<string, unknown>[];
};

export const prescriptionOperation = (input: PrescriptionOperationInput) => ({
  operationId: input.operationId ?? randomUUID(),
  entityType: 'PRESCRIPTION' as const,
  localEntityId: input.localEntityId ?? randomUUID(),
  operation: input.operation,
  baseVersion: input.baseVersion ?? null,
  occurredAt: new Date().toISOString(),
  payload: {
    patientId: input.patientId,
    serverEntityId: input.serverEntityId ?? null,
    encounterId: null,
    type: 'STANDARD',
    validUntil: null,
    regulatory: null,
    items: input.items ?? [prescriptionItem()],
  },
});

// What the Desktop commands take (database.rs: ConsultationDraftInput,
// PrescriptionDraftInput).
export const consultationDraft = (input: {
  patientId: string;
  chiefComplaint: string;
  localId?: string;
  localStatus?: 'LOCAL_DRAFT' | 'IN_PROGRESS' | 'READY_TO_SYNC';
  assessment?: string;
}) => ({
  localId: input.localId,
  patientId: input.patientId,
  localStatus: input.localStatus ?? 'LOCAL_DRAFT',
  chiefComplaint: input.chiefComplaint,
  historyPresentIllness: '',
  clinicalExamination: '',
  assessment: input.assessment ?? '',
  carePlan: '',
  followUpPlan: '',
});

export const prescriptionDraft = (input: {
  patientId: string;
  localId?: string;
  items?: Record<string, unknown>[];
}) => ({
  localId: input.localId,
  patientId: input.patientId,
  encounterId: null,
  type: 'STANDARD',
  validUntil: null,
  regulatory: null,
  items: input.items ?? [prescriptionItem()],
});
