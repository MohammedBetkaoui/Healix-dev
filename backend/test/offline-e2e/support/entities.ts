import {
  type DesktopDevice,
  type Local,
  type OutboxRow,
  payloadOf,
} from './desktop-device';
import {
  consultationDraft,
  consultationOperation,
  prescriptionDraft,
  prescriptionItem,
  prescriptionOperation,
} from './operations';
import { type ServerProbe } from './server-probe';

// The two writable offline aggregates behind one interface, so each reliability
// scenario is written once and runs for CONSULTATION and for PRESCRIPTION DRAFT.
// A "marker" is the one visible field that tells content A from content B.

export type Variant = 'A' | 'B' | 'C';

export type EntityAdapter = {
  readonly entity: 'CONSULTATION' | 'PRESCRIPTION';
  // Saves the aggregate on the Desktop, as the clinician does.
  save(
    device: DesktopDevice,
    patientId: string,
    variant: Variant,
    localId?: string,
  ): ReturnType<DesktopDevice['saveConsultation']>;
  // The row of the local aggregate.
  localRow(local: Local, localId: string): Record<string, any> | undefined;
  // The local id of the first aggregate of this type in the local database
  // (one that came from the Cloud has a local id the Desktop minted itself).
  firstLocalId(local: Local): string;
  localMarker(local: Local, localId: string): string | undefined;
  envelopeMarker(row: OutboxRow): string | undefined;
  // Cloud side.
  cloudRows(probe: ServerProbe, patientId: string): Promise<any[]>;
  cloudMarker(row: any): string | undefined;
  // Creates the entity on the Cloud, as the web application would, at a version.
  seedCloud(
    stack: { fixtures: any; prisma: any },
    clinic: any,
    patientId: string,
    syncVersion: number,
  ): Promise<{ id: string }>;
  // A raw sync operation for protocol-level scenarios.
  operation(input: {
    operationId?: string;
    localEntityId?: string;
    patientId: string;
    operation: 'CREATE' | 'UPDATE';
    baseVersion?: number | null;
    serverEntityId?: string | null;
    variant: Variant;
  }): Record<string, any>;
};

const consultationText = (variant: Variant) => `Motif E2E ${variant}`;
const prescriptionFrequency = (variant: Variant) =>
  ({ A: '3 fois par jour', B: '2 fois par jour', C: '1 fois par jour' })[
    variant
  ];

export const consultationAdapter: EntityAdapter = {
  entity: 'CONSULTATION',
  save: (device, patientId, variant, localId) =>
    device.saveConsultation(
      consultationDraft({
        patientId,
        localId,
        chiefComplaint: consultationText(variant),
        assessment: variant === 'A' ? '' : `Évaluation E2E ${variant}`,
      }),
    ),
  localRow: (local, localId) => local.consultation(localId),
  firstLocalId: (local) => local.dump.consultations[0].local_id,
  localMarker: (local, localId) => {
    const row = local.consultation(localId);
    return row ? JSON.parse(row.payload).chiefComplaint : undefined;
  },
  envelopeMarker: (row) => payloadOf(row).chiefComplaint,
  cloudRows: (probe, patientId) => probe.consultations(patientId),
  cloudMarker: (row) => row.chiefComplaint ?? undefined,
  seedCloud: async (stack, clinic, patientId, syncVersion) => {
    const row = await stack.fixtures.cloudConsultation(
      clinic,
      patientId,
      consultationText('A'),
    );
    return stack.prisma.patientConsultation.update({
      where: { id: row.id },
      data: { syncVersion },
    });
  },
  operation: (input) =>
    consultationOperation({
      ...input,
      chiefComplaint: consultationText(input.variant),
    }),
};

export const prescriptionAdapter: EntityAdapter = {
  entity: 'PRESCRIPTION',
  save: (device, patientId, variant, localId) =>
    device.savePrescription(
      prescriptionDraft({
        patientId,
        localId,
        items: [
          prescriptionItem({ frequency: prescriptionFrequency(variant) }),
        ],
      }),
    ),
  localRow: (local, localId) => local.prescription(localId),
  firstLocalId: (local) => local.dump.prescriptions[0].local_id,
  localMarker: (local, localId) => {
    const row = local.prescription(localId);
    return row ? JSON.parse(row.payload).items?.[0]?.frequency : undefined;
  },
  envelopeMarker: (row) => payloadOf(row).items?.[0]?.frequency,
  cloudRows: (probe, patientId) => probe.prescriptions(patientId),
  cloudMarker: (row) => row.items?.[0]?.frequency ?? undefined,
  seedCloud: async (stack, clinic, patientId, syncVersion) => {
    const row = await stack.fixtures.cloudPrescriptionDraft(clinic, patientId);
    await stack.prisma.prescriptionItem.updateMany({
      where: { prescriptionId: row.id },
      data: { frequency: prescriptionFrequency('A') },
    });
    return stack.prisma.prescription.update({
      where: { id: row.id },
      data: { syncVersion },
    });
  },
  operation: (input) =>
    prescriptionOperation({
      ...input,
      items: [
        prescriptionItem({ frequency: prescriptionFrequency(input.variant) }),
      ],
    }),
};

export const markerOf = (adapter: EntityAdapter, variant: Variant) =>
  adapter.entity === 'CONSULTATION'
    ? consultationText(variant)
    : prescriptionFrequency(variant);

export const adapters = [consultationAdapter, prescriptionAdapter];
