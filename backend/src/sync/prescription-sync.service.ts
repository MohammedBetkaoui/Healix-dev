import { Injectable } from '@nestjs/common';
import {
  PatientAdministrativeStatus,
  PrescriptionStatus,
  Prisma,
  SyncChangeOperation,
  SyncEntityType,
  SyncOperationKind,
  SyncOperationStatus,
} from '@prisma/client';

import { type OfflineActor } from '../offline-devices/offline-device.types';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import {
  SyncPrescriptionPayloadDto,
  type SyncOperationDto,
} from './dto/sync.dto';
import {
  prescriptionSyncSelect,
  recordPrescriptionSyncChange,
  toPrescriptionSyncPayload,
} from './prescription-sync-change';

type Transaction = Prisma.TransactionClient;

// SyncOperationDto narrowed to the prescription payload after
// parseSyncOperationPayload validated it.
export type PrescriptionSyncOperation = SyncOperationDto & {
  payload: SyncPrescriptionPayloadDto;
};

type SyncOperationResult = {
  operationId: string;
  entityType: SyncEntityType;
  localEntityId: string;
  status: SyncOperationStatus;
  code?: string;
  message?: string;
  serverEntityId?: string;
  serverVersion?: number;
  localVersion?: number | null;
  localPayload?: unknown;
  serverPayload?: unknown;
};

// Offline prescription draft sync — the second writable vertical. The
// business rules (patient availability, encounter match, medication catalog
// preparation, regulatory type escalation) are NOT duplicated here: they come
// from PrescriptionsService.prepareSyncDraft (the same private rules that
// back create()/update()). This service only does the sync plumbing:
// idempotent replay via the device-scoped entity map, the optimistic
// syncVersion guard, the offline audit trail and the change-feed emission
// inside the caller's transaction. The backend stays the sole clinical and
// regulatory authority: a synced draft is always created in DRAFT status and
// no ORD number, snapshot, fingerprint or PDF is ever produced here.
@Injectable()
export class PrescriptionSyncService {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  async process(
    client: Transaction,
    actor: OfflineActor,
    doctorProfileId: string,
    allowedPatients: Set<string>,
    operation: PrescriptionSyncOperation,
  ) {
    if (!allowedPatients.has(operation.payload.patientId)) {
      return this.rejected(
        operation,
        'PATIENT_OUTSIDE_OFFLINE_SCOPE',
        "Le patient n'appartient pas au périmètre offline autorisé.",
      );
    }
    if (operation.operation === SyncOperationKind.CREATE) {
      return this.createSync(client, actor, doctorProfileId, operation);
    }
    if (operation.operation === SyncOperationKind.UPDATE) {
      return this.updateSync(client, actor, doctorProfileId, operation);
    }
    return this.rejected(
      operation,
      'UNSUPPORTED_OPERATION',
      'Opération non prise en charge.',
    );
  }

  private async createSync(
    client: Transaction,
    actor: OfflineActor,
    doctorProfileId: string,
    operation: PrescriptionSyncOperation,
  ) {
    // Replay safety: the same device pushing the same local entity twice
    // (lost ACK) re-acknowledges the server row instead of duplicating it.
    const mapped = await client.syncEntityMap.findUnique({
      where: {
        deviceId_entityType_localEntityId: {
          deviceId: actor.deviceId,
          entityType: SyncEntityType.PRESCRIPTION,
          localEntityId: operation.localEntityId,
        },
      },
    });
    if (mapped) {
      const existing = await client.prescription.findUnique({
        where: { id: mapped.serverEntityId },
        select: { id: true, syncVersion: true },
      });
      if (existing) return this.ack(operation, existing.id, existing.syncVersion);
    }
    if (!operation.payload.items?.length) {
      return this.rejected(
        operation,
        'PRESCRIPTION_EMPTY',
        "L'ordonnance doit contenir au moins un médicament.",
      );
    }
    // Re-check beyond the scope snapshot: the patient must still belong to
    // this workspace and be administratively active at push time.
    const patient = await client.patient.findFirst({
      where: {
        id: operation.payload.patientId,
        workspaceId: actor.workspaceId,
        administrativeStatus: PatientAdministrativeStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!patient) {
      return this.rejected(
        operation,
        'PATIENT_NOT_FOUND',
        'Le patient est introuvable ou administrativement inactif.',
      );
    }
    // Same draft rules as PrescriptionsService.create(): authoritative
    // medication values from the catalog, type escalation, encounter match,
    // regulatory data cleaning. A validation error becomes a durable
    // REJECTED result, never a failed request.
    const rules = await this.prescriptions.prepareSyncDraft(client, {
      patientId: operation.payload.patientId,
      doctorProfileId,
      encounterId: operation.payload.encounterId ?? undefined,
      type: operation.payload.type,
      items: operation.payload.items,
      regulatory: operation.payload.regulatory ?? undefined,
    });
    if (!rules.ok) return this.rejected(operation, rules.code, rules.message);

    const prescription = await client.prescription.create({
      data: {
        workspaceId: actor.workspaceId,
        patientId: operation.payload.patientId,
        prescriberDoctorProfileId: doctorProfileId,
        createdById: actor.userId,
        encounterId: operation.payload.encounterId ?? null,
        status: PrescriptionStatus.DRAFT,
        type: rules.effectiveType,
        validUntil: operation.payload.validUntil
          ? new Date(operation.payload.validUntil)
          : null,
        regulatoryData: rules.regulatoryData,
        items: rules.prepared
          ? { create: this.prescriptions.itemCreates(rules.prepared) }
          : undefined,
      },
      select: { id: true, syncVersion: true },
    });
    await client.syncEntityMap.create({
      data: {
        deviceId: actor.deviceId,
        entityType: SyncEntityType.PRESCRIPTION,
        localEntityId: operation.localEntityId,
        serverEntityId: prescription.id,
      },
    });
    await this.auditOfflineMutation(client, actor, operation, prescription.id);
    const snapshot = await recordPrescriptionSyncChange(
      client,
      prescription.id,
      SyncChangeOperation.CREATE,
    );
    return this.ack(operation, prescription.id, snapshot.syncVersion);
  }

  private async updateSync(
    client: Transaction,
    actor: OfflineActor,
    doctorProfileId: string,
    operation: PrescriptionSyncOperation,
  ) {
    const mapping = await client.syncEntityMap.findUnique({
      where: {
        deviceId_entityType_localEntityId: {
          deviceId: actor.deviceId,
          entityType: SyncEntityType.PRESCRIPTION,
          localEntityId: operation.localEntityId,
        },
      },
    });
    const serverEntityId =
      mapping?.serverEntityId ?? operation.payload.serverEntityId;
    if (!serverEntityId || operation.baseVersion === undefined) {
      return this.rejected(
        operation,
        'BASE_VERSION_REQUIRED',
        'Identifiant serveur et version de base requis.',
      );
    }
    const current = await client.prescription.findFirst({
      where: { id: serverEntityId, workspaceId: actor.workspaceId },
      select: prescriptionSyncSelect,
    });
    if (!current) {
      return this.rejected(
        operation,
        'PRESCRIPTION_NOT_FOUND',
        "Ordonnance introuvable dans ce workspace.",
      );
    }
    if (current.patientId !== operation.payload.patientId) {
      return this.rejected(
        operation,
        'PATIENT_MISMATCH',
        'Patient incohérent.',
      );
    }
    // Same ownership rule as assertOwnedByPrescriber(): only the prescriber
    // doctor may touch a draft, whatever the device claims.
    if (current.prescriberDoctorProfileId !== doctorProfileId) {
      return this.rejected(
        operation,
        'PRESCRIBER_REQUIRED',
        "Seul le prescripteur de l'ordonnance peut effectuer cette action.",
      );
    }
    // A draft validated (or canceled) on the cloud while the device was
    // offline is terminal: never overwritten, the server keeps its ORD
    // number, snapshots and fingerprint untouched.
    if (current.status !== PrescriptionStatus.DRAFT) {
      return this.notEditable(operation, current);
    }
    // Optimistic concurrency: a draft edited on the web (or on another
    // device) between the pull and this push moves syncVersion past the
    // baseVersion the device derived from — that push must not clobber it.
    if (current.syncVersion !== operation.baseVersion) {
      return this.conflict(operation, current);
    }

    const rules = await this.prescriptions.prepareSyncDraft(client, {
      patientId: current.patientId,
      doctorProfileId,
      encounterId: operation.payload.encounterId,
      type: operation.payload.type,
      items: operation.payload.items,
      existingCategories:
        operation.payload.items === undefined
          ? current.items.map((item) => item.regulatoryCategory)
          : undefined,
      regulatory: operation.payload.regulatory ?? undefined,
    });
    if (!rules.ok) return this.rejected(operation, rules.code, rules.message);

    const validUntil =
      operation.payload.validUntil === undefined
        ? undefined
        : operation.payload.validUntil === null
          ? null
          : new Date(operation.payload.validUntil);

    const updated = await client.prescription.updateMany({
      where: {
        id: current.id,
        workspaceId: actor.workspaceId,
        syncVersion: operation.baseVersion,
        status: PrescriptionStatus.DRAFT,
      },
      data: {
        ...(operation.payload.encounterId !== undefined
          ? { encounterId: operation.payload.encounterId }
          : {}),
        ...(validUntil !== undefined ? { validUntil } : {}),
        type: rules.effectiveType,
        ...(rules.regulatoryData !== undefined
          ? { regulatoryData: rules.regulatoryData }
          : {}),
        syncVersion: { increment: 1 },
      },
    });
    if (!updated.count) {
      const raced = await client.prescription.findUniqueOrThrow({
        where: { id: current.id },
        select: prescriptionSyncSelect,
      });
      return this.conflict(operation, raced);
    }
    if (rules.prepared) {
      await client.prescriptionItem.deleteMany({
        where: { prescriptionId: current.id },
      });
      await client.prescriptionItem.createMany({
        data: this.prescriptions
          .itemCreates(rules.prepared)
          .map((item) => ({ ...item, prescriptionId: current.id })),
      });
    }
    if (!mapping) {
      await client.syncEntityMap.create({
        data: {
          deviceId: actor.deviceId,
          entityType: SyncEntityType.PRESCRIPTION,
          localEntityId: operation.localEntityId,
          serverEntityId: current.id,
        },
      });
    }
    await this.auditOfflineMutation(client, actor, operation, current.id);
    const snapshot = await recordPrescriptionSyncChange(
      client,
      current.id,
      SyncChangeOperation.UPDATE,
    );
    return this.ack(operation, current.id, snapshot.syncVersion);
  }

  private auditOfflineMutation(
    client: Transaction,
    actor: OfflineActor,
    operation: SyncOperationDto,
    entityId: string,
  ) {
    return client.auditLog.create({
      data: {
        userId: actor.userId,
        action:
          operation.operation === SyncOperationKind.CREATE
            ? 'PRESCRIPTION_CREATED_OFFLINE'
            : 'PRESCRIPTION_UPDATED_OFFLINE',
        entityType: 'PRESCRIPTION',
        entityId,
        metadata: {
          deviceId: actor.deviceId,
          operationId: operation.operationId,
          clientOccurredAt: operation.occurredAt,
          syncedAt: new Date().toISOString(),
        },
      },
    });
  }

  private ack(
    operation: SyncOperationDto,
    serverEntityId: string,
    serverVersion: number,
  ): SyncOperationResult {
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.ACK,
      serverEntityId,
      serverVersion,
    };
  }

  // Stale baseVersion: the server state wins, the local payload is preserved
  // into the conflict so the desktop can present it to the practitioner.
  private conflict(
    operation: PrescriptionSyncOperation,
    current: Prisma.PrescriptionGetPayload<{
      select: typeof prescriptionSyncSelect;
    }>,
  ): SyncOperationResult {
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.CONFLICT,
      code: 'SYNC_CONFLICT',
      localVersion: operation.baseVersion ?? null,
      serverVersion: current.syncVersion,
      localPayload: operation.payload,
      serverPayload: toPrescriptionSyncPayload(current),
    };
  }

  // The draft stopped being a draft on the server (validated, canceled or
  // submitted): keep the CONFLICT shape so the device surfaces it, but with
  // the explicit domain code the UI relies on.
  private notEditable(
    operation: PrescriptionSyncOperation,
    current: Prisma.PrescriptionGetPayload<{
      select: typeof prescriptionSyncSelect;
    }>,
  ): SyncOperationResult {
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.CONFLICT,
      code: 'PRESCRIPTION_NOT_EDITABLE',
      localVersion: operation.baseVersion ?? null,
      serverVersion: current.syncVersion,
      localPayload: operation.payload,
      serverPayload: toPrescriptionSyncPayload(current),
    };
  }

  private rejected(
    operation: SyncOperationDto,
    code: string,
    message: string,
  ): SyncOperationResult {
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.REJECTED,
      code,
      message,
    };
  }
}
