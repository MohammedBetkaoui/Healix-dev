/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  ConsultationStatus,
  SyncEntityType,
  SyncOperationKind,
  SyncOperationStatus,
} from '@prisma/client';

import { UserRole } from '../common/enums/user-role.enum';
import { type OfflineActor } from '../offline-devices/offline-device.types';
import { type PrismaService } from '../prisma/prisma.service';
import { type OfflineScopeService } from './offline-scope.service';
import { SyncService } from './sync.service';

const actor: OfflineActor = {
  grantId: 'grant-1',
  userId: 'user-1',
  deviceId: 'device-1',
  workspaceId: 'workspace-1',
  role: UserRole.INDEPENDENT_DOCTOR,
  offlineCapabilities: {
    patients: { readCached: true, searchLocal: true },
    consultations: {
      create: true,
      updateDraft: true,
      completeOnSync: true,
    },
    appointments: { read: true, write: false },
    prescriptions: { draft: false, validate: false },
    ai: false,
    dicom: false,
  },
  offlineScope: {
    policy: 'PRIVATE_PRACTICE_ACTIVE',
    recentConsultationDays: 90,
    upcomingAppointmentDays: 30,
  },
};

const operation = {
  operationId: '6d915e2c-ef3f-47c4-bb73-f7fcb55db694',
  entityType: SyncEntityType.CONSULTATION,
  localEntityId: '471b8c78-09d2-4b81-b8cb-af0e0b2780c7',
  operation: SyncOperationKind.UPDATE,
  baseVersion: 1,
  occurredAt: '2026-10-28T14:00:00.000Z',
  payload: {
    patientId: 'patient-1',
    serverEntityId: 'consultation-1',
    localStatus: 'IN_PROGRESS' as const,
    chiefComplaint: 'Douleur thoracique',
    diagnoses: [],
  },
};

const scope = {
  patientIds: jest.fn().mockResolvedValue({
    doctorProfileId: 'doctor-1',
    patientIds: ['patient-1'],
  }),
} as unknown as OfflineScopeService;

describe('SyncService operation safety', () => {
  it('returns the durable previous result for a retried operationId', async () => {
    const previous = {
      operationId: operation.operationId,
      entityType: SyncEntityType.CONSULTATION,
      localEntityId: operation.localEntityId,
      status: SyncOperationStatus.ACK,
      serverEntityId: 'consultation-1',
      serverVersion: 2,
    };
    const prisma = {
      syncOperation: {
        findUnique: jest.fn().mockResolvedValue({
          operationId: operation.operationId,
          deviceId: actor.deviceId,
          status: SyncOperationStatus.ACK,
          result: previous,
        }),
      },
    } as unknown as PrismaService;
    const service = new SyncService(prisma, scope);

    const response = await service.push(actor, { operations: [operation] });

    expect(response.results).toEqual([previous]);
    expect((prisma as any).$transaction).toBeUndefined();
  });

  it('returns a conflict and never updates a newer server version', async () => {
    const current = {
      id: 'consultation-1',
      workspaceId: actor.workspaceId,
      patientId: 'patient-1',
      appointmentId: null,
      status: ConsultationStatus.IN_PROGRESS,
      syncVersion: 2,
      startedAt: new Date('2026-10-28T13:00:00.000Z'),
      completedAt: null,
      chiefComplaint: 'Version serveur',
      historyPresentIllness: null,
      clinicalExamination: null,
      assessment: null,
      carePlan: null,
      followUpPlan: null,
      createdAt: new Date('2026-10-28T13:00:00.000Z'),
      updatedAt: new Date('2026-10-28T13:30:00.000Z'),
      vitalSigns: null,
      diagnoses: [],
      addenda: [],
    };
    const transaction = {
      syncOperation: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      syncEntityMap: { findUnique: jest.fn().mockResolvedValue(null) },
      patientConsultation: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      syncOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
    } as unknown as PrismaService;
    const service = new SyncService(prisma, scope);

    const response = await service.push(actor, { operations: [operation] });

    expect(response.results).toEqual([
      expect.objectContaining({
        operationId: operation.operationId,
        status: SyncOperationStatus.CONFLICT,
        localVersion: 1,
        serverVersion: 2,
      }),
    ]);
    expect(transaction.patientConsultation.updateMany).not.toHaveBeenCalled();
    expect(transaction.syncOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: SyncOperationStatus.CONFLICT }),
      }),
    );
  });
});
