import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../../common/testing/integration-fixtures';
import { PatientsModule } from '../../patients/patients.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AiAnalysisRunsModule } from '../ai-analysis-runs.module';
import { AiServiceClient } from '../ai-service.client';
import { AiTimelineService } from './ai-timeline.service';

// The timeline against a migrated database: only the SUCCEEDED runs of one
// patient and one chain, oldest first, the measures read back from what the
// database stored, and the workspace isolation (404). TEST_DATABASE_URL names
// a database ending in "_test"; skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);

describeWithDatabase('the AI timeline against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let timeline: AiTimelineService;

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

  const run = (
    owner: Owner,
    createdAt: Date,
    fields: Record<string, unknown> = {},
  ) =>
    prisma.aiAnalysisRun.create({
      data: {
        classificationModelId: 'brain-efficientnetb4-tumor-classification',
        classificationWeightsSha256: SHA_A,
        createdAt,
        patientId: owner.patient.id,
        pipeline: 'brain',
        predictions: [
          { label: 'meningioma', probability: 0.9 },
          { label: 'notumor', probability: 0.1 },
        ],
        requestedById: owner.actor.sub,
        sourceDocumentId: owner.document.id,
        status: 'SUCCEEDED',
        ...fields,
      } as never,
    });

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
      ],
    })
      .overrideProvider(AiServiceClient)
      .useValue({})
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    timeline = moduleRef.get(AiTimelineService);
    fixtures = new IntegrationFixtures(prisma, 'tl');

    owner = await doctorWithPatient();
    other = await doctorWithPatient();

    // Brain, written out of order: a tumour that grows, then a retrained model.
    await run(owner, at(10), {
      maskAreaPx: 1200,
      maskAreaRatio: 0.0183,
      maskPath: '/m1.png',
    });
    await run(owner, at(60), {
      maskAreaPx: 1000,
      maskAreaRatio: 0.0153,
      maskPath: '/m0.png',
    });
    await run(owner, at(5), {
      classificationWeightsSha256: SHA_B,
      maskAreaPx: 900,
      maskAreaRatio: 0.0137,
      maskPath: '/m2.png',
    });
    // Not SUCCEEDED, or another chain: never in the brain timeline.
    await run(owner, at(7), {
      errorCode: 'SERVICE_ERROR',
      predictions: undefined,
      status: 'FAILED',
    });
    await run(owner, at(6), { status: 'RUNNING', predictions: undefined });
    await run(owner, at(4), {
      errorCode: 'AI_INVALID_IMAGE',
      predictions: undefined,
      status: 'REJECTED_INPUT',
    });
    await run(owner, at(3), {
      classificationModelId: 'pathology-breakhis-classification',
      classificationWeightsSha256: SHA_A,
      decisionThreshold: 0.5,
      malignancyScore: 0.61,
      modelDecision: 'malignant',
      pipeline: 'pathology-breast',
      predictions: undefined,
    });

    // A cardiac MRI pair: spacing known, then not.
    await run(owner, at(40), {
      classificationModelId: null,
      classificationWeightsSha256: null,
      pipeline: 'cardio-seg-mri',
      predictions: {
        noStructureFound: false,
        pixelSpacingMm: [0.5, 0.5],
        source: 'dicom',
        structures: {
          LV: { areaMm2: 1000, pixels: 4000 },
          MYO: { areaMm2: 625, pixels: 2500 },
          RV: { areaMm2: 750, pixels: 3000 },
        },
      },
      segmentationModelId: 'cardio-seg-acdc-unet-effb4',
      segmentationWeightsSha256: SHA_A,
      slicePath: '/s0.png',
    });
    await run(owner, at(2), {
      classificationModelId: null,
      classificationWeightsSha256: null,
      pipeline: 'cardio-seg-mri',
      predictions: {
        noStructureFound: false,
        pixelSpacingMm: null,
        source: 'image',
        structures: {
          LV: { areaMm2: null, pixels: 4400 },
          MYO: { areaMm2: null, pixels: 2500 },
          RV: { areaMm2: null, pixels: 3000 },
        },
      },
      segmentationModelId: 'cardio-seg-acdc-unet-effb4',
      segmentationWeightsSha256: SHA_A,
      slicePath: '/s1.png',
    });

    // Another workspace: a run on the same chain that must never show.
    await run(other, at(1), { maskAreaPx: 5000 });
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await moduleRef?.close();
  }, 60_000);

  it('lists only the SUCCEEDED runs of the chain, oldest first', async () => {
    const result = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'brain',
    );

    expect(result.items.map((item) => item.measures.maskAreaPx)).toEqual([
      1000, 1200, 900,
    ]);
    expect(result.patientId).toBe(owner.patient.id);
    expect(result.pipeline).toBe('brain');
    const times = result.items.map((item) => Date.parse(item.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('reads the measures from what was stored, and compares each run with the one before', async () => {
    const result = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'brain',
    );

    expect(result.items[0].comparison).toBeNull();
    expect(result.items[1].comparison).toMatchObject({
      deltas: {
        maskAreaPx: { percent: 20, value: 200 },
        topProbability: { value: 0 },
      },
      previousRunId: result.items[0].runId,
    });
    expect(result.items[2].comparison?.deltas.maskAreaPx).toEqual({
      percent: -25,
      value: -300,
    });
    expect(result.primaryMeasure).toBe('maskAreaPx');
  });

  it('flags the comparison across a retrained model, and every brain area comparison for want of a spacing', async () => {
    const { items } = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'brain',
    );

    expect(items[1].comparison?.caveats).toEqual(['NO_PIXEL_SPACING']);
    expect(items[2].comparison).toMatchObject({
      caveats: ['MODEL_CHANGED', 'NO_PIXEL_SPACING'],
      reliable: false,
    });
  });

  it('says what the screen needs to fetch the images of each run, and no stored path', async () => {
    const { items } = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'brain',
    );

    expect(
      items.every((item) => item.hasMask && !item.hasOverlay && !item.hasSlice),
    ).toBe(true);
    expect(items[0].sourceDocumentId).toBe(owner.document.id);
    expect(JSON.stringify(items)).not.toContain('/m0.png');
  });

  it('follows the cardiac MRI in mm2 where the spacing was known, and flags the pair that lacks it', async () => {
    const result = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'cardio-seg-mri',
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0].pixelSpacingMm).toEqual([0.5, 0.5]);
    expect(result.items[1].pixelSpacingMm).toBeNull();
    expect(result.items[1].comparison).toMatchObject({
      caveats: ['NO_PIXEL_SPACING', 'SOURCE_CHANGED'],
      deltas: { lvAreaMm2: null, lvPixels: { percent: 10, value: 400 } },
      reliable: false,
    });
    // One run only has the mm2: the pixels are the better line.
    expect(result.primaryMeasure).toBe('lvPixels');
  });

  it('follows the breast score of its own chain only', async () => {
    const result = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'pathology-breast',
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      label: 'malignant',
      measures: { malignancyScore: 0.61 },
    });
  });

  it('is empty for a chain the patient has no run of', async () => {
    const result = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'cardio-ecg',
    );

    expect(result.items).toEqual([]);
  });

  it('answers 404 for a patient of another workspace, as for one that does not exist', async () => {
    await expect(
      timeline.timeline(other.actor, owner.patient.id, 'brain'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      timeline.timeline(owner.actor, other.patient.id, 'brain'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      timeline.timeline(owner.actor, 'no-such-patient', 'brain'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows each workspace its own runs', async () => {
    const mine = await timeline.timeline(
      owner.actor,
      owner.patient.id,
      'brain',
    );
    const theirs = await timeline.timeline(
      other.actor,
      other.patient.id,
      'brain',
    );

    expect(mine.items.map((item) => item.measures.maskAreaPx)).not.toContain(
      5000,
    );
    expect(theirs.items.map((item) => item.measures.maskAreaPx)).toEqual([
      5000,
    ]);
  });
});
