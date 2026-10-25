import { type HttpException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { PatientsModule } from '../patients/patients.module';
import { PrismaService } from '../prisma/prisma.service';
import { AiAnalysisRunsModule } from './ai-analysis-runs.module';
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';
import { CorrectVolumetryDto } from './dto/correct-volumetry.dto';
import { DecideAiAnalysisRunDto } from './dto/decide-ai-analysis-run.dto';
import { computeAiPriority, PRIORITY_RUN_SELECT } from './priority/ai-priority';
import { AiTimelineService } from './timeline/ai-timeline.service';
import { cardioVolumeResult } from './volumetry/cardio-volume.fixtures';
import { readVolumetry } from './volumetry/volumetry';

// The cine volumetry against a migrated database: the volumetry survives the
// JSON column, the plan and the quota are held, a correction is saved without a
// second inference and cannot land after the decision, a run of another
// workspace is not there, and a run left RUNNING is interrupted after 4 minutes
// (not 2). TEST_DATABASE_URL names a database ending in "_test"; the spec is
// skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const MINUTE = 60_000;

async function errorOf(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const bodyOf = (error: HttpException) =>
  error.getResponse() as Record<string, unknown>;

describeWithDatabase('the cardiac cine volumetry against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let runs: AiAnalysisRunsService;
  let timeline: AiTimelineService;
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-volume-integration-'));
  let analyzed = 0;

  const aiService = {
    analyzeCardioVolume: () => {
      analyzed += 1;
      return Promise.resolve(cardioVolumeResult());
    },
  };

  async function owner(
    subscription: Parameters<IntegrationFixtures['independentDoctor']>[0] = {
      subscription: { plan: 'DOCTOR_PREMIUM_AI' },
    },
  ) {
    const doctor = await fixtures.independentDoctor(subscription);
    const patient = await fixtures.patient(
      doctor.workspace.id,
      doctor.profile.id,
    );
    await prisma.patientConsent.create({
      data: {
        patientId: patient.id,
        recordedAt: new Date(),
        recordedById: doctor.user.id,
        status: 'SIGNED',
        type: 'DIAGNOSTIC_AI',
      },
    });
    const directory = join(uploadRoot, 'patients', patient.id, 'documents');
    mkdirSync(directory, { recursive: true });
    const localPath = join(directory, 'serie-5-cine.zip');
    writeFileSync(localPath, Buffer.from('PK-not-really-a-zip'));
    const document = await prisma.patientDocument.create({
      data: {
        dicomSeries: {
          description: 'SA cine',
          instances: 30,
          phases: 5,
          seriesInstanceUid: '1.2.3.5',
          seriesNumber: 5,
          slices: 6,
        },
        documentType: 'DICOM',
        localPath,
        mimeType: 'application/zip',
        originalName: 'serie-5-cine.zip',
        patientId: patient.id,
        seriesInstanceUid: '1.2.3.5',
        seriesNumber: 5,
        size: 19,
        storedName: 'serie-5-cine.zip',
        uploadedById: doctor.user.id,
      },
    });
    return { actor: doctor.actor, document, patient };
  }
  type Owner = Awaited<ReturnType<typeof owner>>;

  const analyze = (who: Owner) =>
    runs.create(who.actor, who.patient.id, {
      pipeline: 'cardio-volume-mri',
      sourceDocumentId: who.document.id,
    });

  const correct = (who: Owner, runId: string, body: Record<string, unknown>) =>
    runs.correctVolumetry(
      who.actor,
      who.patient.id,
      runId,
      plainToInstance(CorrectVolumetryDto, body),
    );

  const decide = (who: Owner, runId: string, body: Record<string, unknown>) =>
    runs.decide(
      who.actor,
      who.patient.id,
      runId,
      plainToInstance(DecideAiAnalysisRunDto, body),
    );

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    process.env.UPLOAD_ROOT = uploadRoot;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PatientsModule,
        AiAnalysisRunsModule,
      ],
    })
      .overrideProvider(AiServiceClient)
      .useValue(aiService)
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    runs = moduleRef.get(AiAnalysisRunsService);
    timeline = moduleRef.get(AiTimelineService);
    fixtures = new IntegrationFixtures(prisma, 'volume');
    await fixtures.plan('DOCTOR_PRO');
    await fixtures.plan('DOCTOR_PREMIUM_AI');
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await moduleRef?.close();
    rmSync(uploadRoot, { force: true, recursive: true });
  }, 60_000);

  it('stores the volumetry in the JSON column and the images in a folder, and answers without every area', async () => {
    const who = await owner();

    const created = await analyze(who);

    expect(created).toMatchObject({
      hasMask: true,
      pipeline: 'cardio-volume-mri',
      status: 'SUCCEEDED',
    });
    expect(created.volumetry).toMatchObject({ modified: false, phases: 5 });
    expect(created.volumetry).not.toHaveProperty('areasMm2');

    const row = await prisma.aiAnalysisRun.findUniqueOrThrow({
      where: { id: created.id },
    });
    const stored = readVolumetry(row.volumetry);
    expect(stored?.areasMm2).toHaveLength(5);
    expect(stored?.auto.measures.lv.efPercent).toBeCloseTo(38, 10);
    expect(stored?.corrected).toBeNull();
    expect(row.segmentationModelId).toBe('cardio-seg-acdc-unet-effb4');
    expect(existsSync(row.maskPath as string)).toBe(true);

    // The source document names the series it came from.
    const document = await prisma.patientDocument.findUniqueOrThrow({
      where: { id: who.document.id },
    });
    expect(document.dicomSeries).toMatchObject({ seriesNumber: 5, slices: 6 });
  }, 60_000);

  it('reads the priority and the timeline back from the database', async () => {
    const who = await owner();
    const created = await analyze(who);

    const row = await prisma.aiAnalysisRun.findUniqueOrThrow({
      select: PRIORITY_RUN_SELECT,
      where: { id: created.id },
    });
    expect(computeAiPriority(row)).toMatchObject({
      level: 'URGENT',
      reasons: [{ code: 'VOLUME_LVEF_REDUCED' }],
    });

    const line = await timeline.timeline(
      who.actor,
      who.patient.id,
      'cardio-volume-mri',
    );
    expect(line.primaryMeasure).toBe('lvEfPercent');
    expect(line.items[0].measures.lvEfPercent).toBeCloseTo(38, 10);
    expect(line.items[0].source).toBe('dicom');
  }, 60_000);

  it('refuses a plan without the chain, and creates no run', async () => {
    const who = await owner({ subscription: { plan: 'DOCTOR_PRO' } });
    const before = analyzed;

    const error = await errorOf(analyze(who));

    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error)).toMatchObject({
      code: 'AI_PIPELINE_NOT_IN_PLAN',
      pipeline: 'cardio-volume-mri',
    });
    expect(analyzed).toBe(before);
    expect(
      await prisma.aiAnalysisRun.count({
        where: { patientId: who.patient.id },
      }),
    ).toBe(0);
  }, 60_000);

  it('counts a cine as one AI analysis: the second is refused when one was left', async () => {
    const who = await owner({
      subscription: {
        customQuotas: {
          aiAnalysesPerMonth: 1,
          aiPipelines: null,
          maxDoctors: null,
          maxPatients: null,
        },
        plan: 'DOCTOR_PREMIUM_AI',
      },
    });
    await analyze(who);
    const before = analyzed;

    const error = await errorOf(analyze(who));

    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error)).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      limit: 1,
      quota: 'aiAnalysesPerMonth',
      used: 1,
    });
    expect(analyzed).toBe(before);
  }, 60_000);

  it('saves a correction without a second inference, then a decision of the corrected measures', async () => {
    const who = await owner();
    const created = await analyze(who);
    const inferences = analyzed;

    const corrected = await correct(who, created.id, {
      esPhase: 1,
      excludedSlices: [0],
    });

    expect(analyzed).toBe(inferences);
    expect(corrected.volumetry).toMatchObject({
      auto: { esPhase: 3 },
      effective: { esPhase: 1, excludedSlices: [0] },
      modified: true,
    });
    const row = await prisma.aiAnalysisRun.findUniqueOrThrow({
      where: { id: created.id },
    });
    const stored = readVolumetry(row.volumetry);
    expect(stored?.corrected?.measures.lv.edvMl).toBeCloseTo(31.2, 10);
    expect(stored?.auto.measures.lv.edvMl).toBeCloseTo(43.2, 10);

    // Measures that were changed are not validated.
    const refused = await errorOf(
      decide(who, created.id, { status: 'VALIDATED' }),
    );
    expect(bodyOf(refused)).toMatchObject({ code: 'AI_VOLUMETRY_MODIFIED' });

    const decided = await decide(who, created.id, {
      measuresCorrected: true,
      reason: 'Télésystole décalée, coupe basale exclue.',
      status: 'CORRECTED',
    });
    expect(decided).toMatchObject({
      decisionLabel: null,
      decisionStatus: 'CORRECTED',
    });

    // Final: no more correction once the run is decided.
    const late = await errorOf(correct(who, created.id, { esPhase: 2 }));
    expect(bodyOf(late)).toMatchObject({ code: 'AI_RUN_ALREADY_DECIDED' });
    expect(
      readVolumetry(
        (
          await prisma.aiAnalysisRun.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).volumetry,
      )?.corrected?.esPhase,
    ).toBe(1);
  }, 60_000);

  it('lets one of two corrections saved at once through, and tells the other', async () => {
    const who = await owner();
    const created = await analyze(who);

    const results = await Promise.allSettled([
      correct(who, created.id, { esPhase: 1 }),
      correct(who, created.id, { esPhase: 2 }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(bodyOf(rejected[0].reason as HttpException)).toMatchObject({
      code: 'AI_VOLUMETRY_CONFLICT',
    });
  }, 60_000);

  it('does not give a run, its images or its corrections to another workspace', async () => {
    const who = await owner();
    const stranger = await owner();
    const created = await analyze(who);
    const asStranger = {
      actor: stranger.actor,
      patientId: who.patient.id,
    };

    for (const attempt of [
      runs.findOne(asStranger.actor, asStranger.patientId, created.id),
      runs.getMask(asStranger.actor, asStranger.patientId, created.id, {
        phase: 'ed',
        slice: 0,
      }),
      runs.getSlice(asStranger.actor, asStranger.patientId, created.id, {
        phase: 'ed',
        slice: 0,
      }),
      runs.getOverlay(asStranger.actor, asStranger.patientId, created.id, {
        phase: 'es',
        slice: 1,
      }),
      runs.correctVolumetry(
        asStranger.actor,
        asStranger.patientId,
        created.id,
        plainToInstance(CorrectVolumetryDto, { esPhase: 1 }),
      ),
      runs.decide(
        asStranger.actor,
        asStranger.patientId,
        created.id,
        plainToInstance(DecideAiAnalysisRunDto, { status: 'VALIDATED' }),
      ),
    ]) {
      expect(await errorOf(attempt)).toBeInstanceOf(NotFoundException);
    }
    // And through his own patient: the run is not found there either.
    expect(
      await errorOf(
        runs.findOne(stranger.actor, stranger.patient.id, created.id),
      ),
    ).toBeInstanceOf(NotFoundException);

    const row = await prisma.aiAnalysisRun.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.decisionStatus).toBeNull();
    expect(readVolumetry(row.volumetry)?.corrected).toBeNull();
  }, 60_000);

  it('interrupts a run left RUNNING after 4 minutes for a cine, 2 for the other chains', async () => {
    const who = await owner();
    const running = (pipeline: string, minutesAgo: number) =>
      prisma.aiAnalysisRun.create({
        data: {
          createdAt: new Date(Date.now() - minutesAgo * MINUTE),
          patientId: who.patient.id,
          pipeline,
          requestedById: who.actor.sub,
          sourceDocumentId: who.document.id,
          status: 'RUNNING',
        },
      });
    const cineStillWaiting = await running('cardio-volume-mri', 3.5);
    const cineLost = await running('cardio-volume-mri', 4.5);
    const brainLost = await running('brain', 2.5);

    const statusOf = async (id: string) =>
      (await runs.findOne(who.actor, who.patient.id, id)).status;

    expect(await statusOf(cineStillWaiting.id)).toBe('RUNNING');
    expect(await statusOf(cineLost.id)).toBe('FAILED');
    expect(await statusOf(brainLost.id)).toBe('FAILED');
    expect(
      (
        await prisma.aiAnalysisRun.findUniqueOrThrow({
          where: { id: cineLost.id },
        })
      ).errorCode,
    ).toBe('RUN_INTERRUPTED');
  }, 60_000);
});
