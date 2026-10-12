import 'reflect-metadata';

import { type AppointmentsService } from '../appointments/appointments.service';
import { UserRole } from '../common/enums/user-role.enum';
import { type PatientsService } from '../patients/patients.service';
import { type PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

// The queries the overview sends, against a simulated database: what each
// one filters on. The real queries run in dashboard.integration.spec.ts.

type Where = { AND?: Record<string, unknown>[] } & Record<string, unknown>;

describe('DashboardService.getOverview (queries)', () => {
  const NOW = new Date('2026-10-11T09:00:00.000Z');
  const runCount = jest.fn<Promise<number>, [{ where: Where }]>();
  // A tagged template: called with (strings, ...values). No row for any query.
  const queryRaw = jest.fn<
    Promise<unknown[]>,
    [TemplateStringsArray, ...unknown[]]
  >(() => Promise.resolve([]));
  const recent = [
    {
      createdAt: new Date('2026-10-11T08:00:00.000Z'),
      decisionLabel: null,
      decisionStatus: null,
      id: 'run-brain',
      modelDecision: null,
      patient: { id: 'p1' },
      pipeline: 'brain',
      predictions: [
        { label: 'pituitary', probability: 0.8 },
        { label: 'glioma', probability: 0.2 },
      ],
      status: 'SUCCEEDED',
    },
    {
      createdAt: new Date('2026-10-11T07:00:00.000Z'),
      decisionLabel: null,
      decisionStatus: null,
      id: 'run-breast',
      modelDecision: 'malignant',
      patient: { id: 'p1' },
      pipeline: 'pathology-breast',
      predictions: null,
      status: 'SUCCEEDED',
    },
    {
      createdAt: new Date('2026-10-11T06:00:00.000Z'),
      decisionLabel: null,
      decisionStatus: 'VALIDATED',
      id: 'run-nuclei',
      modelDecision: null,
      patient: { id: 'p1' },
      pipeline: 'pathology-nuclei',
      predictions: null,
      status: 'SUCCEEDED',
    },
  ];
  const prisma = {
    $queryRaw: queryRaw,
    aiAnalysisRun: {
      aggregate: jest.fn().mockResolvedValue({ _min: { createdAt: null } }),
      count: runCount,
      findMany: jest.fn().mockResolvedValue(recent),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    appointment: {
      findFirst: jest.fn().mockResolvedValue(null),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    doctorProfile: { count: jest.fn().mockResolvedValue(0) },
    patient: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  const service = new DashboardService(
    prisma,
    {
      getPatientScope: jest
        .fn()
        .mockResolvedValue({ where: { workspaceId: 'ws' }, workspaceId: 'ws' }),
    } as unknown as PatientsService,
    {
      getAppointmentScope: jest.fn().mockResolvedValue({
        doctorProfileId: 'dp',
        establishmentId: null,
        where: { doctorProfileId: 'dp' },
      }),
    } as unknown as AppointmentsService,
  );
  const doctor = {
    email: 'doctor@healix.dz',
    role: UserRole.INDEPENDENT_DOCTOR,
    sub: 'doctor',
    tokenType: 'access' as const,
  };

  beforeEach(() => {
    runCount.mockReset().mockResolvedValue(0);
    queryRaw.mockClear();
  });

  it('counts the uncertain share on brain runs only, in SQL and with Prisma', async () => {
    await service.getOverview(doctor, 30, NOW);

    // The SQL count of the runs under the threshold.
    const uncertain = queryRaw.mock.calls.find(([strings]) =>
      strings.join('?').includes('r.predictions IS NOT NULL'),
    );
    expect(uncertain).toBeDefined();
    const [strings, ...values] = uncertain as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join('?');
    expect(sql).toMatch(/r\.pipeline = \?/);
    expect(values).toContain('brain');

    // Its total: the SUCCEEDED brain runs of the period.
    const totals = runCount.mock.calls.filter(([{ where }]) =>
      (where.AND ?? []).some(
        (part) => part.status === 'SUCCEEDED' && 'pipeline' in part,
      ),
    );
    expect(totals).toHaveLength(1);
    expect(totals[0][0].where.AND?.[1]).toEqual({
      pipeline: 'brain',
      status: 'SUCCEEDED',
    });
  });

  it('gives each recent analysis its chain and the model answer', async () => {
    const overview = await service.getOverview(doctor, 30, NOW);

    expect(
      overview.aiAnalyses.recent.map((run) => [run.pipeline, run.modelLabel]),
    ).toEqual([
      ['brain', 'pituitary'],
      ['pathology-breast', 'malignant'],
      ['pathology-nuclei', null],
    ]);
  });
});
