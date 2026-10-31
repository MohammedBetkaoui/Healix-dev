import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ConsultationStatus,
  Prisma,
  SyncChangeOperation,
  SyncEntityType,
  SyncOperationKind,
  SyncOperationStatus,
} from '@prisma/client';

import { sanitizeTextInput } from '../common/utils/sanitize';
import { type OfflineActor } from '../offline-devices/offline-device.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  printIdentitySelect,
  toPrintIdentity,
} from '../prescriptions/prescriber-identity';
import {
  AI_REPORT_DECISIONS,
  AI_REPORT_STATUS,
  type AiReportRun,
  aiReportRunSelect,
  keepMostRecentPerPatient,
  toAiReportSyncPayload,
} from './ai-report-sync';
import { appointmentSyncSelect, toAppointmentSyncPayload } from './appointment-sync-change';import {
  consultationSyncSelect,
  recordConsultationSyncChange,
  toConsultationSyncPayload,
} from './consultation-sync-change';import {
  type SyncConsultationPayloadDto,
  type SyncOperationDto,
  type SyncPushDto,
  parseSyncOperationPayload,
} from './dto/sync.dto';
import { OfflineScopeService } from './offline-scope.service';
import {
  prescriptionSyncSelect,
  toPrescriptionSyncPayload,
} from './prescription-sync-change';
import { PrescriptionSyncService } from './prescription-sync.service';
import { computeSyncOperationHash } from './sync-operation-hash';
import { decodeSyncCursor, encodeSyncCursor } from './sync-cursor';
import { PrescriptionStatus } from '@prisma/client';

type Transaction = Prisma.TransactionClient;

// SyncOperationDto narrowed to the consultation payload after
// parseSyncOperationPayload validated it.
type ConsultationSyncOperation = SyncOperationDto & {
  payload: SyncConsultationPayloadDto;
};

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: OfflineScopeService,
    private readonly prescriptionSync: PrescriptionSyncService,
  ) {}

  async bootstrap(actor: OfflineActor) {
    // The whole bootstrap AND its cursor are read inside one REPEATABLE READ
    // transaction: every row and the highest SyncChange.sequence come from
    // the same snapshot. A consultation updated by the web app after the
    // snapshot therefore cannot be missed — either its row (new version)
    // enters the bootstrap, or its SyncChange (sequence > cursor) enters the
    // next pull. `Promise.all` over separate reads cannot guarantee that.
    const result = await this.prisma.$transaction(
      async (tx) => {
        const scope = await this.scope.resolve(actor, tx);
        const [workspace, user, identity, patients, consultations, appointments, prescriptions, latest] =
          await Promise.all([
            tx.workspace.findUniqueOrThrow({
              where: { id: actor.workspaceId },
              select: { id: true, type: true, name: true, updatedAt: true },
            }),
            tx.user.findUniqueOrThrow({
              where: { id: actor.userId },
              select: { id: true, fullName: true, email: true, role: true },
            }),
            // What the desktop prints on a prescription offline (same source as
            // the PDF of a validated prescription).
            tx.user.findUniqueOrThrow({
              where: { id: actor.userId },
              select: printIdentitySelect,
            }),
            // Minimum data necessary: no nationalId, no phone, no clinical
            // notes (still online-only in V1).
            tx.patient.findMany({
              where: { id: { in: scope.patientIds }, workspaceId: actor.workspaceId },
              orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              select: {
                id: true,
                firstName: true,
                firstNameAr: true,
                lastName: true,
                lastNameAr: true,
                gender: true,
                birthDate: true,
                bloodGroup: true,
                hospitalRecordNumber: true,
                status: true,
                administrativeStatus: true,
                medicalSummary: true,
                updatedAt: true,
              },
            }),
            tx.patientConsultation.findMany({
              where: {
                workspaceId: actor.workspaceId,
                doctorProfileId: scope.doctorProfileId,
                patientId: { in: scope.patientIds },
                OR: [
                  { createdAt: { gte: scope.consultationWindowFrom } },
                  {
                    status: {
                      in: [
                        ConsultationStatus.DRAFT,
                        ConsultationStatus.IN_PROGRESS,
                      ],
                    },
                  },
                ],
              },
              orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              select: consultationSyncSelect,
            }),
            tx.appointment.findMany({
              where: {
                doctorProfileId: scope.doctorProfileId,
                patientId: { in: scope.patientIds },
                scheduledAt: {
                  gte: scope.appointmentWindowFrom,
                  lte: scope.appointmentWindowTo,
                },
              },
              orderBy: { scheduledAt: 'asc' },
              select: appointmentSyncSelect,
            }),
            // Only the device's own unsettled DRAFTs: those are what the
            // offline editor works on. Prescriptions finalized elsewhere
            // (or drafts of another prescriber on a shared patient) flow
            // through the change feed as read-only entities instead.
            tx.prescription.findMany({
              where: {
                workspaceId: actor.workspaceId,
                prescriberDoctorProfileId: scope.doctorProfileId,
                patientId: { in: scope.patientIds },
                status: PrescriptionStatus.DRAFT,
              },
              orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              select: prescriptionSyncSelect,
            }),
            tx.syncChange.findFirst({
              where: { workspaceId: actor.workspaceId },
              orderBy: { sequence: 'desc' },
              select: { sequence: true },
            }),
          ]);
        return {
          workspace,
          user,
          ...toPrintIdentity(identity),
          deviceId: actor.deviceId,
          offlineCapabilities: actor.offlineCapabilities,
          offlineScope: actor.offlineScope,
          // The server-authoritative patient set: locally cached rows absent
          // from this list are outdated clinical data, and the desktop must
          // purge or lock them.
          authorizedPatientIds: scope.patientIds,
          patients: patients.map((patient) => ({
            ...patient,
            birthDate: patient.birthDate.toISOString(),
            serverUpdatedAt: patient.updatedAt.toISOString(),
            lastSyncedAt: new Date().toISOString(),
          })),
          consultations: consultations.map(toConsultationSyncPayload),
          appointments: appointments.map(toAppointmentSyncPayload),
          prescriptions: prescriptions.map(toPrescriptionSyncPayload),
          syncCursor: encodeSyncCursor(latest?.sequence ?? 0n),
          serverTime: new Date(),
        };
      },
      {
        isolationLevel: 'RepeatableRead',
        timeout: 30_000,
        maxWait: 10_000,
      },
    );
    return result;
  }

  async push(actor: OfflineActor, dto: SyncPushDto) {    const scoped = await this.scope.resolve(actor);
    const allowedPatients = new Set(scoped.patientIds);
    const results: unknown[] = [];
    for (const operation of dto.operations) {
      results.push(
        await this.processOperation(
          actor,
          scoped.doctorProfileId,
          allowedPatients,
          operation,
        ),
      );
    }
    return { results, serverTime: new Date() };
  }

  // Light scope reconciliation: no clinical payload, just the
  // server-authoritative patient ids for the windows of this device's grant.
  // The desktop calls it at the start of every sync session so a patient
  // leaving the scope is purged or locked locally without waiting for a
  // full bootstrap.
  async reconcile(actor: OfflineActor) {
    const scope = await this.scope.resolve(actor);
    return {
      deviceId: actor.deviceId,
      policy: scope.policy,
      consultationWindowFrom: scope.consultationWindowFrom.toISOString(),
      appointmentWindowFrom: scope.appointmentWindowFrom.toISOString(),
      appointmentWindowTo: scope.appointmentWindowTo.toISOString(),
      authorizedPatientIds: scope.patientIds,
      serverTime: new Date(),
    };
  }

  // Offline medication catalog: a small active-only projection the desktop
  // fills its local cache from at login. Signed like every other sync call;
  // the authoritative values are still re-read server-side by prepareItems
  // when a draft is pushed.
  async medications(actor: OfflineActor) {
    const medications = await this.prisma.medicationReference.findMany({
      where: { active: true },
      orderBy: [{ dci: 'asc' }, { brandName: 'asc' }],
      select: {
        id: true,
        dci: true,
        brandName: true,
        strength: true,
        pharmaceuticalForm: true,
        route: true,
        manufacturer: true,
        regulatoryCategory: true,
        active: true,
        updatedAt: true,
      },
    });
    return {
      medications: medications.map((medication) => ({
        ...medication,
        updatedAt: medication.updatedAt.toISOString(),
      })),
      serverTime: new Date(),
    };
  }

  // Offline AI results: the conclusions a physician already validated or
  // corrected on the web, for the patients of this device's scope. Read-only
  // and separate from the change feed (nothing here is a sync operation); the
  // desktop replaces its cache with the answer, and drops what `runIds` no
  // longer lists. The payload is a field-by-field whitelist (ai-report-sync.ts).
  async aiReports(actor: OfflineActor) {
    const { patientIds } = await this.scope.resolve(actor);
    const candidates = await this.prisma.aiAnalysisRun.findMany({
      where: {
        patientId: { in: patientIds },
        patient: { workspaceId: actor.workspaceId },
        status: AI_REPORT_STATUS,
        decisionStatus: { in: [...AI_REPORT_DECISIONS] },
        decidedAt: { not: null },
      },
      orderBy: [{ decidedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, patientId: true },
    });
    const kept = keepMostRecentPerPatient(candidates);
    const rows: AiReportRun[] = [];
    for (let index = 0; index < kept.length; index += 500) {
      rows.push(
        ...(await this.readAiReportRows(
          kept.slice(index, index + 500).map((row) => row.id),
        )),
      );
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    // The recency order of `kept`, whatever order the second read answered in.
    const reports = kept.flatMap((row) => {
      const run = byId.get(row.id);
      return run ? [toAiReportSyncPayload(run)] : [];
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: 'AI_REPORTS_READ_OFFLINE',
        entityType: 'OfflineDevice',
        entityId: actor.deviceId,
        metadata: { deviceId: actor.deviceId, reportCount: reports.length },
      },
    });
    return {
      reports,
      runIds: reports.map((report) => report.runId),
      serverTime: new Date(),
    };
  }

  private readAiReportRows(ids: string[]) {
    return this.prisma.aiAnalysisRun.findMany({
      where: { id: { in: ids } },
      select: aiReportRunSelect,
    });
  }

  async pull(actor: OfflineActor, cursor?: string) {
    const after = decodeSyncCursor(cursor);
    // The CURRENT scope governs: a change recorded while a patient was in
    // scope stops being delivered once the patient leaves it — the scope is
    // re-evaluated on every pull, never cached from the change emission.
    const { patientIds } = await this.scope.resolve(actor);
    const changes = await this.prisma.syncChange.findMany({
      where: {
        workspaceId: actor.workspaceId,
        patientId: { in: patientIds },
        sequence: { gt: after },
      },
      orderBy: { sequence: 'asc' },
      take: 200,
    });
    const lastSequence = changes.at(-1)?.sequence ?? after;
    const hasMore = Boolean(
      await this.prisma.syncChange.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          patientId: { in: patientIds },
          sequence: { gt: lastSequence },
        },
        select: { sequence: true },
      }),
    );
    return {
      changes: changes.map((change) => ({
        sequence: change.sequence.toString(),
        entityType: change.entityType,
        entityId: change.entityId,
        operation: change.operation,
        payload: change.payload,
        serverOccurredAt: change.createdAt,
      })),
      nextCursor: encodeSyncCursor(lastSequence),
      hasMore,
      serverTime: new Date(),
    };
  }

  async acknowledge(actor: OfflineActor, cursor: string) {
    const sequence = decodeSyncCursor(cursor);
    const latest = await this.prisma.syncChange.findFirst({
      where: { workspaceId: actor.workspaceId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    if (sequence > (latest?.sequence ?? 0n)) {
      throw new BadRequestException('Le curseur dépasse le flux serveur.');
    }
    const current = await this.prisma.syncDeviceState.findUnique({
      where: { deviceId: actor.deviceId },
      select: { lastAcknowledgedSequence: true },
    });
    const acknowledged =
      current && current.lastAcknowledgedSequence > sequence
        ? current.lastAcknowledgedSequence
        : sequence;
    await this.prisma.syncDeviceState.upsert({
      where: { deviceId: actor.deviceId },
      create: {
        deviceId: actor.deviceId,
        lastAcknowledgedSequence: acknowledged,
      },
      update: { lastAcknowledgedSequence: acknowledged },
    });
    return { acknowledgedCursor: encodeSyncCursor(acknowledged) };
  }

  private async processOperation(
    actor: OfflineActor,
    doctorProfileId: string,
    allowedPatients: Set<string>,
    operation: SyncOperationDto,
  ) {
    // Hash before the idempotency lookup: operationId alone is insufficient
    // when a lost ACK is followed by a local edit.
    const payloadHash = computeSyncOperationHash(operation);
    const existing = await this.prisma.syncOperation.findUnique({
      where: { operationId: operation.operationId },
    });
    if (existing) return this.existingOperationResult(actor, existing, payloadHash);

    try {
      return await this.prisma.$transaction(async (client) => {
        await client.syncOperation.create({
          data: {
            operationId: operation.operationId,
            deviceId: actor.deviceId,
            userId: actor.userId,
            workspaceId: actor.workspaceId,
            entityType: operation.entityType,
            localEntityId: operation.localEntityId,
            operation: operation.operation,
            baseVersion: operation.baseVersion,
            payload: operation.payload as unknown as Prisma.InputJsonValue,
            payloadHash,
            clientOccurredAt: new Date(operation.occurredAt),
          },
        });
        const result = await this.processEntityOperation(
          client,
          actor,
          doctorProfileId,
          allowedPatients,
          operation,
        );
        await client.syncOperation.update({
          where: { operationId: operation.operationId },
          data: {
            status: result.status,
            result: result as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });
        return result;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const raced = await this.prisma.syncOperation.findUnique({
          where: { operationId: operation.operationId },
        });
        if (raced) return this.existingOperationResult(actor, raced, payloadHash);
      }
      return {
        operationId: operation.operationId,
        status: SyncOperationStatus.RETRYABLE,
        code: 'TEMPORARY_SERVER_FAILURE',
        message: 'La synchronisation sera réessayée.',
      };
    }
  }

  // One durable, per-entity dispatch. The payload is validated here — after
  // the SyncOperation row exists — so a malformed push is stored REJECTED and
  // replayable instead of failing the whole batch.
  private async processEntityOperation(
    client: Transaction,
    actor: OfflineActor,
    doctorProfileId: string,
    allowedPatients: Set<string>,
    operation: SyncOperationDto,
  ) {
    const parsed = parseSyncOperationPayload(operation);
    if (!parsed.ok) {
      return this.rejected(
        operation,
        'INVALID_PAYLOAD',
        `Payload ${operation.entityType} invalide : ${parsed.message}`,
      );
    }
    if (parsed.entityType === SyncEntityType.PRESCRIPTION) {
      return this.prescriptionSync.process(
        client,
        actor,
        doctorProfileId,
        allowedPatients,
        { ...operation, payload: parsed.payload },
      );
    }
    return this.processConsultation(
      client,
      actor,
      doctorProfileId,
      allowedPatients,
      { ...operation, payload: parsed.payload },
    );
  }

  private async processConsultation(
    client: Transaction,
    actor: OfflineActor,
    doctorProfileId: string,
    allowedPatients: Set<string>,
    operation: ConsultationSyncOperation,
  ) {
    if (operation.entityType !== SyncEntityType.CONSULTATION) {
      return this.rejected(
        operation,
        'UNSUPPORTED_ENTITY',
        'Entité non prise en charge.',
      );
    }
    if (!allowedPatients.has(operation.payload.patientId)) {
      return this.rejected(
        operation,
        'PATIENT_OUTSIDE_OFFLINE_SCOPE',
        "Le patient n'appartient pas au périmètre offline autorisé.",
      );
    }
    if (operation.operation === SyncOperationKind.CREATE) {
      return this.createConsultation(client, actor, doctorProfileId, operation);
    }
    if (operation.operation === SyncOperationKind.UPDATE) {
      return this.updateConsultation(client, actor, doctorProfileId, operation);
    }
    return this.rejected(
      operation,
      'UNSUPPORTED_OPERATION',
      'Opération non prise en charge.',
    );
  }

  private async createConsultation(
    client: Transaction,
    actor: OfflineActor,
    doctorProfileId: string,
    operation: ConsultationSyncOperation,
  ) {
    const mapped = await client.syncEntityMap.findUnique({
      where: {
        deviceId_entityType_localEntityId: {
          deviceId: actor.deviceId,
          entityType: SyncEntityType.CONSULTATION,
          localEntityId: operation.localEntityId,
        },
      },
    });
    if (mapped) {
      const existing = await client.patientConsultation.findUnique({
        where: { id: mapped.serverEntityId },
        select: { id: true, syncVersion: true },
      });
      if (existing)
        return this.ack(operation, existing.id, existing.syncVersion);
    }
    const appointmentError = await this.validateAppointment(
      client,
      actor.workspaceId,
      doctorProfileId,
      operation.payload,
    );
    if (appointmentError) return this.rejected(operation, ...appointmentError);
    if (
      operation.payload.localStatus === 'READY_TO_SYNC' &&
      !this.hasClinicalContent(operation.payload)
    ) {
      return this.rejected(
        operation,
        'CLINICAL_CONTENT_REQUIRED',
        'Une consultation finalisée doit contenir des informations cliniques.',
      );
    }
    const status = this.targetStatus(operation.payload.localStatus);
    const occurredAt = new Date(operation.occurredAt);
    const consultation = await client.patientConsultation.create({
      data: {
        workspaceId: actor.workspaceId,
        patientId: operation.payload.patientId,
        doctorProfileId,
        appointmentId: operation.payload.appointmentId ?? null,
        createdById: actor.userId,
        status,
        startedAt: status === ConsultationStatus.DRAFT ? null : occurredAt,
        completedAt:
          status === ConsultationStatus.COMPLETED ? new Date() : null,
        completedById:
          status === ConsultationStatus.COMPLETED ? actor.userId : null,
        ...this.clinicalScalarData(operation.payload),
        vitalSigns: operation.payload.vitalSigns
          ? { create: this.vitalSignsData(operation.payload.vitalSigns) }
          : undefined,
        diagnoses: operation.payload.diagnoses?.length
          ? {
              create: operation.payload.diagnoses.map((diagnosis) =>
                this.diagnosisData(diagnosis),
              ),
            }
          : undefined,
      },
    });
    await client.syncEntityMap.create({
      data: {
        deviceId: actor.deviceId,
        entityType: SyncEntityType.CONSULTATION,
        localEntityId: operation.localEntityId,
        serverEntityId: consultation.id,
      },
    });
    await this.auditOfflineMutation(client, actor, operation, consultation.id);
    await recordConsultationSyncChange(
      client,
      consultation.id,
      SyncChangeOperation.CREATE,
    );
    return this.ack(operation, consultation.id, consultation.syncVersion);
  }

  private async updateConsultation(
    client: Transaction,
    actor: OfflineActor,
    doctorProfileId: string,
    operation: ConsultationSyncOperation,
  ) {
    const mapping = await client.syncEntityMap.findUnique({
      where: {
        deviceId_entityType_localEntityId: {
          deviceId: actor.deviceId,
          entityType: SyncEntityType.CONSULTATION,
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
    const current = await client.patientConsultation.findFirst({
      where: {
        id: serverEntityId,
        workspaceId: actor.workspaceId,
        doctorProfileId,
      },
      select: consultationSyncSelect,
    });
    if (!current) {
      return this.rejected(
        operation,
        'CONSULTATION_NOT_FOUND',
        'Consultation introuvable.',
      );
    }
    if (current.patientId !== operation.payload.patientId) {
      return this.rejected(
        operation,
        'PATIENT_MISMATCH',
        'Patient incohérent.',
      );
    }
    if (
      current.status === ConsultationStatus.COMPLETED ||
      current.status === ConsultationStatus.CANCELED ||
      current.syncVersion !== operation.baseVersion
    ) {
      return this.conflict(operation, current);
    }
    if (
      operation.payload.localStatus === 'READY_TO_SYNC' &&
      !this.hasClinicalContent(operation.payload)
    ) {
      return this.rejected(
        operation,
        'CLINICAL_CONTENT_REQUIRED',
        'Une consultation finalisée doit contenir des informations cliniques.',
      );
    }
    const appointmentError = await this.validateAppointment(
      client,
      actor.workspaceId,
      doctorProfileId,
      operation.payload,
    );
    if (appointmentError) return this.rejected(operation, ...appointmentError);
    const requestedStatus = this.targetStatus(operation.payload.localStatus);
    const status =
      current.status === ConsultationStatus.IN_PROGRESS &&
      requestedStatus === ConsultationStatus.DRAFT
        ? ConsultationStatus.IN_PROGRESS
        : requestedStatus;
    const now = new Date();
    const updated = await client.patientConsultation.updateMany({
      where: {
        id: current.id,
        workspaceId: actor.workspaceId,
        syncVersion: operation.baseVersion,
        status: {
          in: [ConsultationStatus.DRAFT, ConsultationStatus.IN_PROGRESS],
        },
      },
      data: {
        appointmentId: operation.payload.appointmentId,
        status,
        startedAt:
          status === ConsultationStatus.DRAFT
            ? current.startedAt
            : (current.startedAt ?? new Date(operation.occurredAt)),
        completedAt: status === ConsultationStatus.COMPLETED ? now : null,
        completedById:
          status === ConsultationStatus.COMPLETED ? actor.userId : null,
        ...this.clinicalScalarData(operation.payload),
        syncVersion: { increment: 1 },
      },
    });
    if (!updated.count) {
      const raced = await client.patientConsultation.findUniqueOrThrow({
        where: { id: current.id },
        select: consultationSyncSelect,
      });
      return this.conflict(operation, raced);
    }
    if (operation.payload.vitalSigns === null) {
      await client.consultationVitalSigns.deleteMany({
        where: { consultationId: current.id },
      });
    } else if (operation.payload.vitalSigns) {
      await client.consultationVitalSigns.upsert({
        where: { consultationId: current.id },
        create: {
          consultationId: current.id,
          ...this.vitalSignsData(operation.payload.vitalSigns),
        },
        update: this.vitalSignsData(operation.payload.vitalSigns),
      });
    }
    if (operation.payload.diagnoses !== undefined) {
      await client.consultationDiagnosis.deleteMany({
        where: { consultationId: current.id },
      });
      if (operation.payload.diagnoses.length) {
        await client.consultationDiagnosis.createMany({
          data: operation.payload.diagnoses.map((diagnosis) => ({
            consultationId: current.id,
            ...this.diagnosisData(diagnosis),
          })),
        });
      }
    }
    if (!mapping) {
      await client.syncEntityMap.create({
        data: {
          deviceId: actor.deviceId,
          entityType: SyncEntityType.CONSULTATION,
          localEntityId: operation.localEntityId,
          serverEntityId: current.id,
        },
      });
    }
    await this.auditOfflineMutation(client, actor, operation, current.id);
    const snapshot = await recordConsultationSyncChange(
      client,
      current.id,
      SyncChangeOperation.UPDATE,
    );
    return this.ack(operation, current.id, snapshot.syncVersion);
  }

  private existingOperationResult(
    actor: OfflineActor,
    existing: {
      deviceId: string;
      operationId: string;
      payloadHash: string;
      status: SyncOperationStatus;
      result: Prisma.JsonValue | null;
    },
    incomingPayloadHash: string,
  ) {
    if (existing.deviceId !== actor.deviceId) {
      return {
        operationId: existing.operationId,
        status: SyncOperationStatus.REJECTED,
        code: 'OPERATION_ID_ALREADY_USED',
        message: 'Identifiant d’opération déjà utilisé.',
      };
    }
    if (existing.payloadHash !== incomingPayloadHash) {
      return {
        operationId: existing.operationId,
        status: SyncOperationStatus.REJECTED,
        code: 'OPERATION_ID_PAYLOAD_MISMATCH',
        message: 'Cette opération a déjà été envoyée avec un contenu différent.',
      };
    }
    return (
      existing.result ?? {
        operationId: existing.operationId,
        status: SyncOperationStatus.RETRYABLE,
        code: 'OPERATION_IN_PROGRESS',
        message: 'Opération en cours de traitement.',
      }
    );
  }

  private async validateAppointment(
    client: Transaction,
    workspaceId: string,
    doctorProfileId: string,
    payload: SyncConsultationPayloadDto,
  ): Promise<[string, string] | null> {
    if (!payload.appointmentId) return null;
    const appointment = await client.appointment.findFirst({
      where: {
        id: payload.appointmentId,
        patientId: payload.patientId,
        doctorProfileId,
        patient: { workspaceId },
      },
      select: { id: true },
    });
    return appointment
      ? null
      : [
          'APPOINTMENT_MISMATCH',
          'Le rendez-vous ne correspond pas au contexte.',
        ];
  }

  private clinicalScalarData(payload: SyncConsultationPayloadDto) {
    const clean = (value: string | null | undefined) =>
      value === undefined
        ? undefined
        : value === null
          ? null
          : sanitizeTextInput(value) || null;
    return {
      chiefComplaint: clean(payload.chiefComplaint),
      historyPresentIllness: clean(payload.historyPresentIllness),
      clinicalExamination: clean(payload.clinicalExamination),
      assessment: clean(payload.assessment),
      carePlan: clean(payload.carePlan),
      followUpPlan: clean(payload.followUpPlan),
    };
  }

  private vitalSignsData(
    vitals: NonNullable<SyncConsultationPayloadDto['vitalSigns']>,
  ) {
    return {
      systolicBp: vitals.systolicBp ?? null,
      diastolicBp: vitals.diastolicBp ?? null,
      heartRate: vitals.heartRate ?? null,
      respiratoryRate: vitals.respiratoryRate ?? null,
      oxygenSaturation: vitals.oxygenSaturation ?? null,
      temperature: vitals.temperature ?? null,
      weightKg: vitals.weightKg ?? null,
      heightCm: vitals.heightCm ?? null,
    };
  }

  private diagnosisData(
    diagnosis: NonNullable<SyncConsultationPayloadDto['diagnoses']>[number],
  ) {
    const nullable = (value: string | null | undefined) =>
      value ? sanitizeTextInput(value) : null;
    return {
      label: sanitizeTextInput(diagnosis.label),
      code: nullable(diagnosis.code),
      codeSystem: nullable(diagnosis.codeSystem),
      isPrimary: diagnosis.isPrimary ?? false,
      note: nullable(diagnosis.note),
    };
  }

  private hasClinicalContent(payload: SyncConsultationPayloadDto) {
    return Boolean(
      payload.chiefComplaint?.trim() ||
      payload.assessment?.trim() ||
      payload.clinicalExamination?.trim() ||
      payload.diagnoses?.length,
    );
  }

  private targetStatus(status: SyncConsultationPayloadDto['localStatus']) {
    if (status === 'READY_TO_SYNC') return ConsultationStatus.COMPLETED;
    if (status === 'IN_PROGRESS') return ConsultationStatus.IN_PROGRESS;
    return ConsultationStatus.DRAFT;
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
            ? 'CONSULTATION_CREATED_OFFLINE'
            : 'CONSULTATION_UPDATED_OFFLINE',
        entityType: 'PatientConsultation',
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
  ) {
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.ACK,
      serverEntityId,
      serverVersion,
    };
  }

  private conflict(
    operation: SyncOperationDto,
    current: Prisma.PatientConsultationGetPayload<{
      select: typeof consultationSyncSelect;
    }>,
  ) {
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.CONFLICT,
      code: 'SYNC_CONFLICT',
      localVersion: operation.baseVersion ?? null,
      serverVersion: current.syncVersion,
      localPayload: operation.payload,
      serverPayload: toConsultationSyncPayload(current),
    };
  }

  private rejected(operation: SyncOperationDto, code: string, message: string) {
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.REJECTED,
      code,
      message,
    };
  }

  private isUniqueConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
