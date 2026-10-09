import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UserRole } from '../../common/enums/user-role.enum';
import { type PatientFileStorageService } from '../../patients/documents/patient-file-storage.service';
import { type PatientAuditService } from '../../patients/patient-audit.service';
import { type PatientsService } from '../../patients/patients.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { AiAnalysisRunsService } from '../ai-analysis-runs.service';
import { type AiServiceClient } from '../ai-service.client';
import {
  buildRunsWhere,
  MIN_DECISIONS_FOR_RATE,
  rateOf,
  type SummaryRun,
  summarizeRuns,
} from './ai-runs-overview';
import { ListAiAnalysisRunsQueryDto } from './ai-runs-overview.dto';
import { AiRunsOverviewService } from './ai-runs-overview.service';

const doctor = {
  email: 'doctor-a@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'doctor-a',
  tokenType: 'access' as const,
};
const SCOPE = { workspaceId: 'ws-a' };

type FakeRun = Record<string, unknown> & {
  id: string;
  createdAt: Date;
  patient: Record<string, unknown>;
};

const predictions = (label: string, probability: number) => [
  { label, probability },
  {
    label: label === 'glioma' ? 'meningioma' : 'glioma',
    probability: 1 - probability,
  },
];

let sequence = 0;
function fakeRun(overrides: Record<string, unknown> = {}): FakeRun {
  sequence += 1;
  const workspaceId = (overrides.workspaceId as string | undefined) ?? 'ws-a';
  return {
    createdAt: new Date(Date.UTC(2026, 9, 1, 8, sequence)),
    decidedBy: null,
    decisionLabel: null,
    decisionStatus: null,
    id: `run-${sequence}`,
    maskPath: null,
    patient: {
      firstName: 'Karim',
      firstNameAr: 'كريم',
      id: `patient-${workspaceId}`,
      lastName: 'Haddad',
      lastNameAr: 'حداد',
      nationalId: '123456789098765432',
      phone: '0555123456',
      workspaceId,
    },
    patientId: `patient-${workspaceId}`,
    predictions: predictions('meningioma', 0.93),
    report: null,
    requestedById: 'doctor-a',
    status: 'SUCCEEDED',
    ...overrides,
  };
}

// The where clauses the overview builds, applied to plain objects.
function matches(run: FakeRun, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Record<string, unknown>[]).every((part) =>
        matches(run, part),
      );
    }
    if (key === 'patient') {
      return Object.entries(condition as Record<string, unknown>).every(
        ([field, value]) => run.patient[field] === value,
      );
    }
    if (key === 'createdAt') {
      const range = condition as { gte?: Date; lte?: Date; lt?: Date };
      return (
        (!range.gte || run.createdAt >= range.gte) &&
        (!range.lte || run.createdAt <= range.lte) &&
        (!range.lt || run.createdAt < range.lt)
      );
    }
    if (condition !== null && typeof condition === 'object') {
      throw new Error(`Unsupported filter on ${key}`);
    }
    return run[key] === condition;
  });
}

function fakePrisma(runs: FakeRun[]) {
  const pick = (
    source: Record<string, unknown>,
    select: Record<string, unknown>,
  ) => Object.fromEntries(Object.keys(select).map((key) => [key, source[key]]));

  return {
    aiAnalysisRun: {
      count: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(runs.filter((run) => matches(run, where)).length),
      findMany: (args: {
        where: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>[];
        skip?: number;
        take?: number;
        include?: { patient?: { select: Record<string, unknown> } };
        select?: Record<string, unknown>;
      }) => {
        const direction = args.orderBy?.[0]?.createdAt === 'asc' ? 1 : -1;
        const found = runs
          .filter((run) => matches(run, args.where))
          .sort(
            (a, b) =>
              direction * (a.createdAt.getTime() - b.createdAt.getTime()),
          )
          .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? runs.length))
          .map((run) => {
            if (args.select) return pick(run, args.select);
            return args.include?.patient
              ? {
                  ...run,
                  patient: pick(run.patient, args.include.patient.select),
                }
              : run;
          });
        return Promise.resolve(found);
      },
    },
  };
}

function overview(runs: FakeRun[]) {
  const prisma = fakePrisma(runs) as unknown as PrismaService;
  const patientsService = {
    getPatientScopeWhere: jest.fn().mockResolvedValue(SCOPE),
  } as unknown as PatientsService;
  const runsService = new AiAnalysisRunsService(
    prisma,
    patientsService,
    {} as PatientFileStorageService,
    { log: jest.fn() } as unknown as PatientAuditService,
    {} as AiServiceClient,
  );
  return new AiRunsOverviewService(prisma, patientsService, runsService);
}

describe('GET /ai-analysis-runs', () => {
  beforeEach(() => {
    sequence = 0;
  });

  const dataset = () => [
    fakeRun(), // pending
    fakeRun({ decisionLabel: 'meningioma', decisionStatus: 'VALIDATED' }),
    fakeRun({ decisionLabel: 'glioma', decisionStatus: 'CORRECTED' }),
    fakeRun({ decisionStatus: 'REJECTED' }),
    fakeRun({ predictions: null, status: 'FAILED' }),
    fakeRun({ requestedById: 'doctor-b' }), // pending, someone else's request
    // Another workspace: pending, validated, failed.
    fakeRun({ workspaceId: 'ws-b' }),
    fakeRun({
      decisionLabel: 'meningioma',
      decisionStatus: 'VALIDATED',
      workspaceId: 'ws-b',
    }),
    fakeRun({ status: 'FAILED', workspaceId: 'ws-b' }),
  ];

  it('never lists a run of a patient outside the scope, whatever the filters', async () => {
    const service = overview(dataset());
    for (const decision of [
      undefined,
      'pending',
      'VALIDATED',
      'CORRECTED',
      'REJECTED',
    ] as const) {
      for (const requestedBy of [undefined, 'me'] as const) {
        const result = await service.list(doctor, {
          decision,
          limit: 50,
          page: 1,
          requestedBy,
        });
        expect(
          result.items.every((run) => run.patientId === 'patient-ws-a'),
        ).toBe(true);
        expect(result.total).toBe(result.items.length);
      }
    }
    expect((await service.list(doctor, { limit: 50, page: 1 })).total).toBe(6);
  });

  it('filters by decision, status, period and requester', async () => {
    const service = overview(dataset());
    const ids = async (query: Partial<ListAiAnalysisRunsQueryDto>) =>
      (await service.list(doctor, { limit: 50, page: 1, ...query })).items.map(
        (run) => run.id,
      );

    // Pending: SUCCEEDED and undecided only, the oldest first.
    expect(await ids({ decision: 'pending' })).toEqual(['run-1', 'run-6']);
    expect(await ids({ decision: 'VALIDATED' })).toEqual(['run-2']);
    expect(await ids({ decision: 'REJECTED' })).toEqual(['run-4']);
    expect(await ids({ status: 'FAILED' })).toEqual(['run-5']);
    expect(await ids({ decision: 'pending', requestedBy: 'me' })).toEqual([
      'run-1',
    ]);
    expect(
      await ids({
        from: '2026-10-01T08:02:00.000Z',
        to: '2026-10-01T08:03:00.000Z',
      }),
    ).toEqual(['run-3', 'run-2']);
  });

  it('paginates, the latest first', async () => {
    const service = overview(dataset());

    const second = await service.list(doctor, { limit: 4, page: 2 });

    expect(second.items.map((run) => run.id)).toEqual(['run-2', 'run-1']);
    expect(second).toEqual(
      expect.objectContaining({ limit: 4, page: 2, total: 6, totalPages: 2 }),
    );
  });

  it('answers the run as for a patient, with the patient named only', async () => {
    const service = overview(dataset());

    const [first] = (
      await service.list(doctor, { decision: 'VALIDATED', limit: 50, page: 1 })
    ).items;

    expect(first).toEqual(
      expect.objectContaining({
        decisionStatus: 'VALIDATED',
        hasMask: false,
        id: 'run-2',
        reportNumber: null,
      }),
    );
    expect(first.patient).toEqual({
      firstName: 'Karim',
      firstNameAr: 'كريم',
      id: 'patient-ws-a',
      lastName: 'Haddad',
      lastNameAr: 'حداد',
    });
  });

  it('refuses a period that ends before it starts', async () => {
    await expect(
      overview(dataset()).list(doctor, {
        from: '2026-10-02T00:00:00Z',
        limit: 20,
        page: 1,
        to: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the query: 50 per page at most, known filters only', async () => {
    const errors = async (query: Record<string, unknown>) =>
      (await validate(plainToInstance(ListAiAnalysisRunsQueryDto, query))).map(
        (error) => error.property,
      );

    expect(await errors({ limit: '50', page: '1' })).toEqual([]);
    expect(await errors({ limit: '51' })).toEqual(['limit']);
    expect(await errors({ page: '0' })).toEqual(['page']);
    expect(await errors({ decision: 'APPROVED' })).toEqual(['decision']);
    expect(await errors({ requestedBy: 'doctor-b' })).toEqual(['requestedBy']);
    expect(await errors({ from: 'hier' })).toEqual(['from']);
  });

  it('always puts the patient scope first in the query', () => {
    expect(buildRunsWhere(SCOPE, {})).toEqual({ AND: [{ patient: SCOPE }] });
    expect(
      buildRunsWhere(SCOPE, { decision: 'pending', requestedById: 'me' }).AND,
    ).toEqual([
      { patient: SCOPE },
      { decisionStatus: null, status: 'SUCCEEDED' },
      { requestedById: 'me' },
    ]);
  });
});

describe('GET /ai-analysis-runs/summary', () => {
  beforeEach(() => {
    sequence = 0;
  });

  it('counts only the runs of patients in scope', async () => {
    const runs = [
      fakeRun({ decisionLabel: 'meningioma', decisionStatus: 'VALIDATED' }),
      fakeRun({ status: 'FAILED' }),
      fakeRun({
        decisionLabel: 'meningioma',
        decisionStatus: 'VALIDATED',
        workspaceId: 'ws-b',
      }),
      fakeRun({ workspaceId: 'ws-b' }),
      fakeRun({ status: 'REJECTED_INPUT', workspaceId: 'ws-b' }),
    ];

    const summary = await overview(runs).summary(doctor, {});

    expect(summary.analyses).toBe(2);
    expect(summary.byStatus).toEqual({
      FAILED: 1,
      REJECTED_INPUT: 0,
      RUNNING: 0,
      SUCCEEDED: 1,
    });
    expect(summary.decisions).toEqual({
      CORRECTED: 0,
      REJECTED: 0,
      total: 1,
      VALIDATED: 1,
    });
    expect(summary.pending.count).toBe(0);
  });
});

describe('summarizeRuns, on a hand-made set', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 8, minute));
  const run = (overrides: Partial<SummaryRun>): SummaryRun => ({
    createdAt: at(0),
    decisionLabel: null,
    decisionStatus: null,
    predictions: predictions('meningioma', 0.95),
    status: 'SUCCEEDED',
    ...overrides,
  });
  const validated = (label: string, probability: number) =>
    run({
      decisionLabel: label,
      decisionStatus: 'VALIDATED',
      predictions: predictions(label, probability),
    });
  const corrected = (model: string, kept: string, probability: number) =>
    run({
      decisionLabel: kept,
      decisionStatus: 'CORRECTED',
      predictions: predictions(model, probability),
    });

  // 12 decided: 8 validated (6 above 0.90, 2 below) and 4 corrected (1 above,
  // 3 below); 1 rejected; 2 pending; 1 failed.
  const runs = [
    ...Array.from({ length: 6 }, () => validated('meningioma', 0.95)),
    validated('pituitary', 0.7),
    validated('glioma', 0.8),
    corrected('meningioma', 'glioma', 0.92),
    corrected('meningioma', 'glioma', 0.6),
    corrected('notumor', 'glioma', 0.75),
    corrected('pituitary', 'other', 0.55),
    run({ decisionStatus: 'REJECTED' }),
    run({ createdAt: at(30), predictions: predictions('glioma', 0.6) }),
    run({ createdAt: at(10) }),
    run({ predictions: null, status: 'FAILED' }),
  ];
  const summary = summarizeRuns(runs, new Date(Date.UTC(2026, 9, 2, 10, 10)));

  it('counts the runs by status, the decisions and the pending runs', () => {
    expect(summary.analyses).toBe(16);
    expect(summary.byStatus).toEqual({
      FAILED: 1,
      REJECTED_INPUT: 0,
      RUNNING: 0,
      SUCCEEDED: 15,
    });
    expect(summary.decisions).toEqual({
      CORRECTED: 4,
      REJECTED: 1,
      total: 13,
      VALIDATED: 8,
    });
    // The oldest pending run is from 08:10, 26 hours before.
    expect(summary.pending).toEqual({
      count: 2,
      oldestAgeHours: 26,
      oldestCreatedAt: at(10).toISOString(),
    });
  });

  it('measures the agreement as VALIDATED / (VALIDATED + CORRECTED), with its counts', () => {
    expect(summary.insufficientData).toBe(false);
    expect(summary.agreement).toEqual({
      count: 8,
      insufficientData: false,
      rate: 8 / 12,
      total: 12,
    });
  });

  it('crosses the model class with the class kept by the physician', () => {
    expect(summary.matrix.modelLabels).toEqual([
      'glioma',
      'meningioma',
      'notumor',
      'pituitary',
    ]);
    expect(summary.matrix.retainedLabels).toEqual([
      'glioma',
      'meningioma',
      'notumor',
      'pituitary',
      'other',
    ]);
    expect(summary.matrix.counts).toEqual([
      [1, 0, 0, 0, 0], // glioma kept once
      [2, 6, 0, 0, 0], // meningioma: 6 kept, 2 corrected to glioma
      [1, 0, 0, 0, 0], // notumor corrected to glioma
      [0, 0, 0, 1, 1], // pituitary: kept once, once "other"
    ]);
  });

  it('splits the agreement at the 0.90 uncertainty threshold', () => {
    // 15 SUCCEEDED with predictions; under 0.90: validated 0.7 and 0.8,
    // corrected 0.6, 0.75 and 0.55, pending 0.6.
    expect(summary.uncertainty.threshold).toBe(0.9);
    expect(summary.uncertainty.belowThreshold).toEqual({
      count: 6,
      insufficientData: false,
      rate: 6 / 15,
      total: 15,
    });
    // Each side has fewer than 10 decisions: counts, no rate.
    expect(summary.uncertainty.agreementAbove).toEqual({
      count: 6,
      insufficientData: true,
      rate: null,
      total: 7,
    });
    expect(summary.uncertainty.agreementBelow).toEqual({
      count: 2,
      insufficientData: true,
      rate: null,
      total: 5,
    });
  });

  it(`gives no rate under ${MIN_DECISIONS_FOR_RATE} decisions`, () => {
    const nine = summarizeRuns(
      [
        ...Array.from({ length: 5 }, () => validated('meningioma', 0.95)),
        ...Array.from({ length: 4 }, () =>
          corrected('meningioma', 'glioma', 0.95),
        ),
      ],
      at(0),
    );
    expect(nine.insufficientData).toBe(true);
    expect(nine.agreement).toEqual({
      count: 5,
      insufficientData: true,
      rate: null,
      total: 9,
    });

    const ten = summarizeRuns([...runs.slice(0, 10)], at(0));
    expect(ten.insufficientData).toBe(false);
    expect(ten.agreement.rate).toBe(8 / 10);

    expect(rateOf(3, 9)).toEqual({
      count: 3,
      insufficientData: true,
      rate: null,
      total: 9,
    });
    expect(rateOf(0, 0)).toEqual({
      count: 0,
      insufficientData: true,
      rate: null,
      total: 0,
    });
  });
});
