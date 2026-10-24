import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../../common/testing/integration-fixtures';
import { DashboardModule } from '../../dashboard/dashboard.module';
import { DashboardService } from '../../dashboard/dashboard.service';
import { PatientsModule } from '../../patients/patients.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AiAnalysisRunsModule } from '../ai-analysis-runs.module';
import { AiServiceClient } from '../ai-service.client';
import { AiRunsOverviewService } from './ai-runs-overview.service';

// The reading priority in the list and on the dashboard, against a migrated
// database: the order of the waiting runs, the paging across them and the
// rest, the level filter, the workspace scope, and the dashboard counter.
// TEST_DATABASE_URL names a database ending in "_test"; skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

const softmax = (top: string, probability: number) => {
  const others = ['glioma', 'meningioma', 'notumor', 'pituitary'].filter(
    (label) => label !== top,
  );
  return [
    { label: top, probability },
    ...others.map((label) => ({
      label,
      probability: (1 - probability) / others.length,
    })),
  ];
};

describeWithDatabase('the reading priority against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let overview: AiRunsOverviewService;
  let dashboard: DashboardService;

  async function doctorWithPatient() {
    const doctor = await fixtures.independentDoctor();
    const patient = await fixtures.patient(
      doctor.workspace.id,
      doctor.profile.id,
    );
    const document = await prisma.patientDocument.create({
      data: {
        documentType: 'MEDICAL_IMAGE',
        localPath: 'x',
        mimeType: 'image/png',
        originalName: 'irm.png',
        patientId: patient.id,
        size: 1,
        storedName: 'irm.png',
        uploadedById: doctor.actor.sub,
      },
    });
    return { actor: doctor.actor, document, patient };
  }

  type Owner = Awaited<ReturnType<typeof doctorWithPatient>>;

  // One run by name, so that the order can be read in the test.
  async function run(
    owner: Owner,
    name: string,
    createdAt: Date,
    fields: Record<string, unknown> = {},
  ) {
    const created = await prisma.aiAnalysisRun.create({
      data: {
        createdAt,
        patientId: owner.patient.id,
        pipeline: 'brain',
        predictions: softmax('notumor', 0.99),
        requestedById: owner.actor.sub,
        sourceDocumentId: owner.document.id,
        status: 'SUCCEEDED',
        ...fields,
      } as never,
    });
    names.set(created.id, name);
    return created;
  }

  const names = new Map<string, string>();
  const order = (items: { id: string }[]) =>
    items.map((item) => names.get(item.id) ?? item.id);

  // A doctor whose runs, oldest first:
  //   routine-pending (notumor), high-meningioma, urgent-glioma, decided-glioma
  //   (a glioma already validated), failed, urgent-mi (an ECG), high-heart (an
  //   MRI map with no right ventricle), routine-validated.
  let owner: Owner;
  let other: Owner;

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PatientsModule,
        AiAnalysisRunsModule,
        DashboardModule,
      ],
    })
      .overrideProvider(AiServiceClient)
      .useValue({})
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    overview = moduleRef.get(AiRunsOverviewService);
    dashboard = moduleRef.get(DashboardService);
    fixtures = new IntegrationFixtures(prisma, 'prio');

    owner = await doctorWithPatient();
    other = await doctorWithPatient();

    await run(owner, 'routine-pending', ago(9 * DAY));
    await run(owner, 'high-meningioma', ago(8 * DAY), {
      predictions: softmax('meningioma', 0.95),
    });
    await run(owner, 'urgent-glioma', ago(7 * DAY), {
      predictions: softmax('glioma', 0.9),
    });
    await run(owner, 'decided-glioma', ago(6 * DAY), {
      decidedAt: ago(5 * DAY),
      decisionLabel: 'glioma',
      decisionStatus: 'VALIDATED',
      predictions: softmax('glioma', 0.99),
    });
    await run(owner, 'failed', ago(5 * DAY), {
      errorCode: 'SERVICE_ERROR',
      predictions: undefined,
      status: 'FAILED',
    });
    await run(owner, 'urgent-mi', ago(4 * DAY), {
      pipeline: 'cardio-ecg',
      predictions: {
        positive: ['MI'],
        probabilities: { MI: 0.99, NORM: 0.01 },
      },
    });
    await run(owner, 'high-heart', ago(3 * DAY), {
      pipeline: 'cardio-seg-mri',
      predictions: {
        noStructureFound: false,
        structures: {
          LV: { areaMm2: null, pixels: 4000 },
          MYO: { areaMm2: null, pixels: 2500 },
          RV: { areaMm2: null, pixels: 0 },
        },
      },
    });
    await run(owner, 'routine-validated', ago(2 * DAY), {
      decidedAt: ago(1 * DAY),
      decisionLabel: 'notumor',
      decisionStatus: 'VALIDATED',
    });

    // Another workspace: an urgent run that must never show in the first one.
    await run(other, 'other-urgent', ago(1 * DAY), {
      predictions: softmax('glioma', 0.99),
    });
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await moduleRef?.close();
  }, 60_000);

  const list = (query: Record<string, unknown> = {}, who: Owner = owner) =>
    overview.list(who.actor, query);

  it('lists the runs waiting for a decision in reading order, then the others, the latest first', async () => {
    const page = await list({ sort: 'priority' });

    expect(order(page.items)).toEqual([
      // URGENT: the MI (0.99: score 100) before the glioma (0.9: score 99).
      'urgent-mi',
      'urgent-glioma',
      // HIGH: the meningioma (0.95), then the map missing a structure.
      'high-meningioma',
      'high-heart',
      // Still waiting, nothing suspicious.
      'routine-pending',
      // Decided or failed: ROUTINE, the latest first.
      'routine-validated',
      'failed',
      'decided-glioma',
    ]);
    expect(page.total).toBe(8);
  });

  it('gives each run its priority, and a decided glioma falls back to ROUTINE', async () => {
    const page = await list({ sort: 'priority' });
    const byName = new Map(
      page.items.map((item) => [names.get(item.id), item.priority]),
    );

    expect(byName.get('urgent-mi')).toMatchObject({
      level: 'URGENT',
      reasons: [{ code: 'ECG_MI' }],
    });
    expect(byName.get('urgent-glioma')).toMatchObject({
      level: 'URGENT',
      reasons: [{ code: 'BRAIN_GLIOMA' }],
    });
    expect(byName.get('high-meningioma')).toMatchObject({ level: 'HIGH' });
    expect(byName.get('high-heart')).toMatchObject({
      level: 'HIGH',
      reasons: [
        { code: 'CARDIO_STRUCTURE_ABSENT', params: { structure: 'RV' } },
      ],
    });
    expect(byName.get('decided-glioma')).toEqual({
      level: 'ROUTINE',
      reasons: [{ code: 'ALREADY_DECIDED' }],
      score: 0,
    });
    expect(byName.get('failed')).toMatchObject({
      level: 'ROUTINE',
      reasons: [{ code: 'NO_RESULT' }],
    });
  });

  it('pages across the waiting runs and the others without a gap or a repeat', async () => {
    const whole = order((await list({ sort: 'priority' })).items);
    const paged: string[] = [];

    for (const page of [1, 2, 3, 4]) {
      const result = await list({ limit: 2, page, sort: 'priority' });
      expect(result.total).toBe(8);
      expect(result.totalPages).toBe(4);
      paged.push(...order(result.items));
    }

    expect(paged).toEqual(whole);
    // The boundary between the queue (5 waiting) and the rest falls inside page 3.
    expect(
      order((await list({ limit: 2, page: 3, sort: 'priority' })).items),
    ).toEqual(['routine-pending', 'routine-validated']);
  });

  it('pages a size that does not divide the queue', async () => {
    const whole = order((await list({ sort: 'priority' })).items);
    const paged: string[] = [];

    for (const page of [1, 2, 3]) {
      paged.push(
        ...order((await list({ limit: 3, page, sort: 'priority' })).items),
      );
    }

    expect(paged).toEqual(whole);
  });

  it('filters by level: URGENT and HIGH are among the waiting runs only, in priority order', async () => {
    const urgent = await list({ priority: 'URGENT' });
    const high = await list({ priority: 'HIGH' });

    expect(order(urgent.items)).toEqual(['urgent-mi', 'urgent-glioma']);
    expect(urgent.total).toBe(2);
    expect(order(high.items)).toEqual(['high-meningioma', 'high-heart']);
    expect(high.total).toBe(2);
  });

  it('filters ROUTINE: the waiting ones with nothing suspicious, then the decided and failed ones', async () => {
    const routine = await list({ priority: 'ROUTINE' });

    expect(order(routine.items)).toEqual([
      'routine-pending',
      'routine-validated',
      'failed',
      'decided-glioma',
    ]);
    expect(routine.total).toBe(4);
    for (const item of routine.items)
      expect(item.priority.level).toBe('ROUTINE');
  });

  it('pages a level filter', async () => {
    const first = await list({ limit: 1, page: 1, priority: 'URGENT' });
    const second = await list({ limit: 1, page: 2, priority: 'URGENT' });
    const third = await list({ limit: 1, page: 3, priority: 'URGENT' });

    expect([
      order(first.items),
      order(second.items),
      order(third.items),
    ]).toEqual([['urgent-mi'], ['urgent-glioma'], []]);
    expect(first.total).toBe(2);
    expect(first.totalPages).toBe(2);
  });

  it('combines with the other filters', async () => {
    expect(
      order((await list({ decision: 'pending', sort: 'priority' })).items),
    ).toEqual([
      'urgent-mi',
      'urgent-glioma',
      'high-meningioma',
      'high-heart',
      'routine-pending',
    ]);
    // Decided runs have no waiting queue: the date order.
    expect(
      order((await list({ decision: 'VALIDATED', sort: 'priority' })).items),
    ).toEqual(['routine-validated', 'decided-glioma']);
    expect(
      order((await list({ pipeline: 'cardio-ecg', sort: 'priority' })).items),
    ).toEqual(['urgent-mi']);
    expect(
      order((await list({ priority: 'URGENT', pipeline: 'brain' })).items),
    ).toEqual(['urgent-glioma']);
    expect(
      (await list({ priority: 'URGENT', decision: 'VALIDATED' })).items,
    ).toEqual([]);
  });

  it('keeps the date order, the latest first, without sort or filter, and gives the priority all the same', async () => {
    const page = await list();

    expect(order(page.items)).toEqual([
      'routine-validated',
      'high-heart',
      'urgent-mi',
      'failed',
      'decided-glioma',
      'urgent-glioma',
      'high-meningioma',
      'routine-pending',
    ]);
    expect(page.items.map((item) => item.priority.level)).toEqual([
      'ROUTINE',
      'HIGH',
      'URGENT',
      'ROUTINE',
      'ROUTINE',
      'URGENT',
      'HIGH',
      'ROUTINE',
    ]);
    expect(order((await list({ sort: 'createdAt' })).items)).toEqual(
      order(page.items),
    );
  });

  it('never lists, ranks or counts a run of another workspace', async () => {
    const mine = await list({ sort: 'priority' });
    const theirs = await list({ sort: 'priority' }, other);

    expect(order(mine.items)).not.toContain('other-urgent');
    expect(order(theirs.items)).toEqual(['other-urgent']);
    expect(theirs.total).toBe(1);
    expect(order((await list({ priority: 'URGENT' }, other)).items)).toEqual([
      'other-urgent',
    ]);
  });

  describe('the dashboard counter', () => {
    it('counts the waiting runs that are URGENT, whatever their age: not the HIGH, not the decided', async () => {
      // Two urgent waiting runs, the older one 7 days old, outside nothing:
      // the counter is not bound to the period of the dashboard.
      expect(
        (await dashboard.getOverview(owner.actor, 1)).aiAnalyses.urgentPending,
      ).toBe(2);
      expect(
        (await dashboard.getOverview(owner.actor, 30)).aiAnalyses.urgentPending,
      ).toBe(2);
    });

    it('counts its own workspace only', async () => {
      expect(
        (await dashboard.getOverview(other.actor, 30)).aiAnalyses.urgentPending,
      ).toBe(1);
    });

    it('drops a run once a physician has decided it', async () => {
      const lone = await doctorWithPatient();
      const urgent = await run(lone, 'lone-urgent', ago(1 * HOUR), {
        predictions: softmax('glioma', 0.95),
      });

      expect(
        (await dashboard.getOverview(lone.actor, 30)).aiAnalyses.urgentPending,
      ).toBe(1);

      await prisma.aiAnalysisRun.update({
        data: {
          decidedAt: new Date(),
          decisionLabel: 'glioma',
          decisionStatus: 'VALIDATED',
        },
        where: { id: urgent.id },
      });

      expect(
        (await dashboard.getOverview(lone.actor, 30)).aiAnalyses.urgentPending,
      ).toBe(0);
    });
  });
});
