import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AdminAiMonitoringService } from '../../admin/ai-monitoring/admin-ai-monitoring.service';
import { AdminModule } from '../../admin/admin.module';
import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../../common/testing/integration-fixtures';
import { PatientsModule } from '../../patients/patients.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AiAnalysisRunsModule } from '../ai-analysis-runs.module';
import { AiServiceClient } from '../ai-service.client';
import { AiRunsOverviewService } from '../overview/ai-runs-overview.service';

// The monitoring board against a migrated database: the scope (a workspace
// sees its own runs, the back-office all of them), the month of a run read
// back from MariaDB at the Algiers boundary, and a drift raised from stored
// runs. TEST_DATABASE_URL names a database ending in "_test"; skipped without
// it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const period = {
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-12-31T22:00:00.000Z',
};

describeWithDatabase('model monitoring against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let overview: AiRunsOverviewService;
  let admin: AdminAiMonitoringService;
  // The same model for both doctors: the back-office sees the two together.
  let modelId = '';

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

  // `count` runs created at `createdAt`, the first `corrected` of them
  // corrected by the physician and the others validated.
  async function runs(
    owner: Owner,
    createdAt: Date,
    count: number,
    corrected = 0,
    status: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED',
  ) {
    await prisma.aiAnalysisRun.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        classificationModelId: status === 'SUCCEEDED' ? modelId : null,
        createdAt,
        decidedAt:
          status === 'SUCCEEDED'
            ? new Date(createdAt.getTime() + 120_000)
            : null,
        decisionLabel:
          status === 'SUCCEEDED'
            ? index < corrected
              ? 'notumor'
              : 'glioma'
            : null,
        decisionStatus:
          status === 'SUCCEEDED'
            ? index < corrected
              ? 'CORRECTED'
              : 'VALIDATED'
            : null,
        durationMs: 2_000,
        patientId: owner.patient.id,
        pipeline: 'brain',
        predictions: [
          { label: 'glioma', probability: 0.95 },
          { label: 'notumor', probability: 0.05 },
        ],
        requestedById: owner.actor.sub,
        sourceDocumentId: owner.document.id,
        status,
      })),
    });
  }

  const board = async (owner: Owner) => {
    const result = await overview.modelMonitoring(owner.actor, period);
    return result.models.find((model) => model.modelId === modelId);
  };

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PatientsModule,
        AiAnalysisRunsModule,
        AdminModule,
      ],
    })
      .overrideProvider(AiServiceClient)
      .useValue({})
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    overview = moduleRef.get(AiRunsOverviewService);
    admin = moduleRef.get(AdminAiMonitoringService);
    fixtures = new IntegrationFixtures(prisma, 'mon');
    modelId = `mon-brain-${fixtures.suffix}`;
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await moduleRef?.close();
  }, 60_000);

  it('shows a workspace its own runs only, and the back-office all of them', async () => {
    const a = await doctorWithPatient();
    const b = await doctorWithPatient();
    await runs(a, new Date('2026-03-10T10:00:00.000Z'), 3, 1);
    await runs(a, new Date('2026-03-12T10:00:00.000Z'), 1, 0, 'FAILED');
    await runs(b, new Date('2026-03-11T10:00:00.000Z'), 5, 2);

    const own = await board(a);
    const other = await board(b);
    const global = (await admin.modelMonitoring(period)).models.find(
      (model) => model.modelId === modelId,
    );

    // The failed run of A (no model answered) goes to the chain's only model.
    expect(own?.months).toEqual([
      expect.objectContaining({
        corrected: 1,
        decided: 3,
        failed: 1,
        month: '2026-03',
        runs: 4,
        validated: 2,
      }),
    ]);
    expect(other?.months).toEqual([
      expect.objectContaining({
        corrected: 2,
        decided: 5,
        failed: 0,
        runs: 5,
        validated: 3,
      }),
    ]);
    expect(global?.months).toEqual([
      expect.objectContaining({
        corrected: 3,
        decided: 8,
        failed: 1,
        runs: 9,
        validated: 5,
      }),
    ]);
  });

  it('measures the median delay of the decision and of the inference from the stored runs', async () => {
    const owner = await doctorWithPatient();
    await runs(owner, new Date('2026-04-10T10:00:00.000Z'), 3);

    const entry = await board(owner);

    expect(entry?.months[0]).toMatchObject({
      medianDecisionMs: 120_000,
      medianInferenceMs: 2_000,
    });
  });

  it('reads the month of a run at the Algiers boundary, back from the database', async () => {
    const owner = await doctorWithPatient();
    // 23:30 UTC on September 30th is 00:30 on October 1st in Algiers.
    await runs(owner, new Date('2026-09-30T23:30:00.000Z'), 2);
    await runs(owner, new Date('2026-09-30T22:30:00.000Z'), 1);

    const entry = await board(owner);

    expect(entry?.months.map((m) => [m.month, m.runs])).toEqual([
      ['2026-09', 1],
      ['2026-10', 2],
    ]);
  });

  it('raises the drift alert when a month goes 10 points above the 3 months before', async () => {
    const owner = await doctorWithPatient();
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      await runs(owner, new Date(`${month}-10T10:00:00.000Z`), 20, 2);
    }
    await runs(owner, new Date('2026-09-10T10:00:00.000Z'), 25, 6);

    const entry = await board(owner);

    expect(entry?.alert).toEqual({
      baselineRate: 0.1,
      deltaPoints: 14,
      month: '2026-09',
      rate: 0.24,
    });
    expect(entry?.months.map((m) => m.drift.alert)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    // 3 x 20 + 25 decisions on a class, all of them in the matrix.
    expect(entry?.matrix?.counts.flat().reduce((a, b) => a + b, 0)).toBe(85);
  });
});
