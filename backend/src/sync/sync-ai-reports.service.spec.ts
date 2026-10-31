import 'reflect-metadata';

import { AiAnalysisRunStatus, AiRunDecision } from '@prisma/client';

import { UserRole } from '../common/enums/user-role.enum';
import { DeviceProofGuard } from '../offline-devices/device-proof.guard';
import { OfflineGrantGuard } from '../offline-devices/offline-grant.guard';
import {
  OFFLINE_CAPABILITIES,
  type OfflineActor,
} from '../offline-devices/offline-device.types';
import { type PrismaService } from '../prisma/prisma.service';
import { AI_REPORTS_PER_PATIENT } from './ai-report-sync';
import { type OfflineScopeService } from './offline-scope.service';
import { type PrescriptionSyncService } from './prescription-sync.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

const actor: OfflineActor = {
  grantId: 'grant-1',
  userId: 'user-1',
  deviceId: 'device-1',
  workspaceId: 'workspace-1',
  role: UserRole.INDEPENDENT_DOCTOR,
  offlineCapabilities: OFFLINE_CAPABILITIES,
  offlineScope: {
    policy: 'PRIVATE_PRACTICE_ACTIVE',
    recentConsultationDays: 90,
    upcomingAppointmentDays: 30,
  },
};

type Where = {
  id?: { in: string[] };
  patientId?: { in: string[] };
  patient?: { workspaceId: string };
  status?: string;
  decisionStatus?: { in: string[] };
  decidedAt?: { not: null };
};

type StoredRun = {
  id: string;
  patientId: string;
  workspaceId: string;
  status: AiAnalysisRunStatus;
  decisionStatus: AiRunDecision | null;
  decidedAt: Date | null;
  pipeline?: string;
};

// A small in-memory table that honours the where/orderBy/select the service
// asks for: the service's own filters are what these tests exercise.
function fakeDatabase(runs: StoredRun[]) {
  const audit: unknown[] = [];
  const queries: Array<{ where: Where }> = [];
  const matches = (run: StoredRun, where: Where): boolean => {
    if (where.id?.in && !where.id.in.includes(run.id)) return false;
    if (where.patientId?.in && !where.patientId.in.includes(run.patientId)) {
      return false;
    }
    if (
      where.patient?.workspaceId &&
      where.patient.workspaceId !== run.workspaceId
    ) {
      return false;
    }
    if (where.status && where.status !== run.status) return false;
    if (where.decisionStatus?.in) {
      if (
        !run.decisionStatus ||
        !where.decisionStatus.in.includes(run.decisionStatus)
      ) {
        return false;
      }
    }
    if (where.decidedAt?.not === null && run.decidedAt === null) return false;
    return true;
  };
  const prisma = {
    aiAnalysisRun: {
      findMany: jest.fn(
        ({
          where,
          orderBy,
          select,
        }: {
          where: Where;
          orderBy?: unknown;
          select: Where;
        }) => {
          queries.push({ where });
          let rows = runs.filter((run) => matches(run, where));
          if (orderBy) {
            rows = [...rows].sort(
              (a, b) =>
                (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0) ||
                a.id.localeCompare(b.id),
            );
          } else {
            // The second read answers in any order: the service must not rely on it.
            rows = [...rows].reverse();
          }
          if (Object.keys(select).length === 2) {
            return Promise.resolve(
              rows.map(({ id, patientId }) => ({ id, patientId })),
            );
          }
          return Promise.resolve(
            rows.map((run) => ({
              id: run.id,
              patientId: run.patientId,
              pipeline: run.pipeline ?? 'brain',
              createdAt: new Date('2026-10-01T00:00:00.000Z'),
              decidedAt: run.decidedAt,
              decisionStatus: run.decisionStatus,
              decisionLabel: 'glioma',
              decisionLabels: null,
              clinicianImpression: null,
              modelDecision: null,
              predictions: [],
              malignancyScore: null,
              decisionThreshold: null,
              magnification: null,
              maskAreaRatio: null,
              volumetry: null,
              classificationModelId: null,
              classificationWeightsSha256: null,
              segmentationModelId: null,
              segmentationWeightsSha256: null,
              decidedBy: { fullName: 'Dr X' },
              report: null,
            })),
          );
        },
      ),
    },
    auditLog: {
      create: jest.fn((args: unknown) => {
        audit.push(args);
        return Promise.resolve({});
      }),
    },
  };
  return { prisma: prisma as unknown as PrismaService, audit, queries };
}

const scopeOf = (patientIds: string[]) =>
  ({
    resolve: jest
      .fn()
      .mockResolvedValue({ doctorProfileId: 'doctor-1', patientIds }),
  }) as unknown as OfflineScopeService;

const serviceFor = (runs: StoredRun[], patientIds: string[]) => {
  const database = fakeDatabase(runs);
  const service = new SyncService(
    database.prisma,
    scopeOf(patientIds),
    {} as PrescriptionSyncService,
  );
  return { ...database, service };
};

const run = (
  id: string,
  patientId: string,
  day: number,
  over: Partial<StoredRun> = {},
): StoredRun => ({
  id,
  patientId,
  workspaceId: 'workspace-1',
  status: AiAnalysisRunStatus.SUCCEEDED,
  decisionStatus: AiRunDecision.VALIDATED,
  decidedAt: new Date(Date.UTC(2026, 9, day, 10)),
  ...over,
});

describe('GET /sync/ai-reports', () => {
  it('returns the decided analyses of the scope, and lists every run id it keeps', async () => {
    const { service } = serviceFor(
      [
        run('r1', 'p1', 20),
        run('r2', 'p1', 21, { decisionStatus: AiRunDecision.CORRECTED }),
      ],
      ['p1'],
    );
    const answer = await service.aiReports(actor);
    expect(answer.reports.map((report) => report.runId)).toEqual(['r2', 'r1']);
    expect(answer.runIds).toEqual(['r2', 'r1']);
    expect(answer.reports[0].decisionStatus).toBe('CORRECTED');
  });

  it('leaves out a patient who is not in the scope of the device', async () => {
    const { service } = serviceFor(
      [run('in', 'p1', 20), run('out', 'p-outside', 21)],
      ['p1'],
    );
    const answer = await service.aiReports(actor);
    expect(answer.runIds).toEqual(['in']);
  });

  it('leaves out a patient of another workspace, even one the scope names', async () => {
    const { service } = serviceFor(
      [
        run('mine', 'p1', 20),
        run('foreign', 'p2', 21, { workspaceId: 'workspace-2' }),
      ],
      ['p1', 'p2'],
    );
    const answer = await service.aiReports(actor);
    expect(answer.runIds).toEqual(['mine']);
  });

  it('leaves out what is not a succeeded analysis decided as validated or corrected', async () => {
    const { service } = serviceFor(
      [
        run('ok', 'p1', 20),
        run('rejected', 'p1', 21, { decisionStatus: AiRunDecision.REJECTED }),
        run('undecided', 'p1', 22, { decisionStatus: null, decidedAt: null }),
        run('failed', 'p1', 23, { status: AiAnalysisRunStatus.FAILED }),
        run('running', 'p1', 24, {
          status: AiAnalysisRunStatus.RUNNING,
          decisionStatus: null,
          decidedAt: null,
        }),
        run('input-rejected', 'p1', 25, {
          status: AiAnalysisRunStatus.REJECTED_INPUT,
        }),
      ],
      ['p1'],
    );
    const answer = await service.aiReports(actor);
    expect(answer.runIds).toEqual(['ok']);
  });

  it('keeps the 20 most recent analyses of each patient', async () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      run(`a${index}`, 'p1', 1 + (index % 28), {
        decidedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      }),
    );
    const { service } = serviceFor([...many, run('b1', 'p2', 5)], ['p1', 'p2']);
    const answer = await service.aiReports(actor);
    const ofFirst = answer.reports.filter(
      (report) => report.patientId === 'p1',
    );
    expect(ofFirst).toHaveLength(AI_REPORTS_PER_PATIENT);
    // The oldest five (index 0..4) are the ones dropped.
    expect(ofFirst.map((report) => report.runId)).not.toContain('a0');
    expect(ofFirst.map((report) => report.runId)).toContain('a24');
    expect(
      answer.reports.filter((report) => report.patientId === 'p2'),
    ).toHaveLength(1);
  });

  it('lists in runIds exactly the reports it returns, so the device can drop the rest', async () => {
    const { service } = serviceFor(
      Array.from({ length: 30 }, (_, index) =>
        run(`r${index}`, 'p1', 1, {
          decidedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        }),
      ),
      ['p1'],
    );
    const answer = await service.aiReports(actor);
    expect(answer.runIds).toHaveLength(20);
    expect(new Set(answer.runIds)).toEqual(
      new Set(answer.reports.map((report) => report.runId)),
    );
  });

  it('answers an empty, valid list when nothing qualifies', async () => {
    const { service } = serviceFor([], ['p1']);
    const answer = await service.aiReports(actor);
    expect(answer.reports).toEqual([]);
    expect(answer.runIds).toEqual([]);
  });

  it('answers an empty list, without reading runs of others, for a device with no patient in scope', async () => {
    const { service, queries } = serviceFor([run('r1', 'p1', 20)], []);
    const answer = await service.aiReports(actor);
    expect(answer.runIds).toEqual([]);
    expect(queries[0].where.patientId).toEqual({ in: [] });
  });

  it('asks the database for the scope, the workspace, the status and the decision', async () => {
    const { service, queries } = serviceFor([], ['p1']);
    await service.aiReports(actor);
    expect(queries[0].where).toMatchObject({
      patientId: { in: ['p1'] },
      patient: { workspaceId: 'workspace-1' },
      status: AiAnalysisRunStatus.SUCCEEDED,
      decisionStatus: {
        in: [AiRunDecision.VALIDATED, AiRunDecision.CORRECTED],
      },
    });
  });

  it('writes one audit event per call, with the device and the number of reports', async () => {
    const { service, audit } = serviceFor(
      [run('r1', 'p1', 20), run('r2', 'p1', 21)],
      ['p1'],
    );
    await service.aiReports(actor);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      data: {
        userId: 'user-1',
        action: 'AI_REPORTS_READ_OFFLINE',
        entityId: 'device-1',
        metadata: { deviceId: 'device-1', reportCount: 2 },
      },
    });
    await service.aiReports(actor);
    expect(audit).toHaveLength(2);
  });

  it('the answer holds no key of the forbidden list', async () => {
    const { service } = serviceFor([run('r1', 'p1', 20)], ['p1']);
    const answer = await service.aiReports(actor);
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof Date)
      ) {
        for (const [key, child] of Object.entries(value)) {
          keys.push(key);
          walk(child);
        }
      }
    };
    walk(answer);
    expect(keys.filter((key) => key.endsWith('Path'))).toEqual([]);
    for (const forbidden of [
      'ttaScores',
      'nucleiFractions',
      'predictions',
      'decisionReason',
      'storageKey',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

/* eslint-disable @typescript-eslint/unbound-method -- reads route metadata, never calls the handler */
describe('the route', () => {
  it('is a GET behind the offline grant and the device proof, like the whole sync controller', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      SyncController,
    ) as unknown[];
    expect(guards).toEqual([OfflineGrantGuard, DeviceProofGuard]);
    expect(
      Reflect.getMetadata('path', SyncController.prototype.aiReports),
    ).toBe('ai-reports');
    // 0 is RequestMethod.GET.
    expect(
      Reflect.getMetadata('method', SyncController.prototype.aiReports),
    ).toBe(0);
    // No method-level guard override that could weaken the class-level ones.
    expect(
      Reflect.getMetadata('__guards__', SyncController.prototype.aiReports),
    ).toBeUndefined();
  });
});
