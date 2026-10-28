import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type HttpException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { readFile } from 'node:fs/promises';
import { join as pathJoin } from 'node:path';

import { AiServiceClient } from '../ai-analysis-runs/ai-service.client';
import { AiTimelineService } from '../ai-analysis-runs/timeline/ai-timeline.service';
import {
  applyStorageTestEnv,
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { PatientsModule } from '../patients/patients.module';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_MAGIC } from '../storage/crypto/file-encryption.service';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { storageReferenceOf } from '../storage/storage-keys';
import { DicomAnalysisService } from './dicom-analysis.service';
import { DicomStudiesService } from './dicom-studies.service';
import { DicomModule } from './dicom.module';
import { OrthancClient, type OrthancInstance } from './orthanc.client';

// "Analyser cette coupe" against a migrated database, with the real creation
// flow of a run (consent, plan, quota under the lock, audit) and the AI service
// and Orthanc replaced: the document made from the slice, what each chain is
// given, the DICOM fields saved on the document, the quota consumed, nothing
// left behind by a refusal, and the slice named in the timeline.
// TEST_DATABASE_URL names a database ending in "_test"; skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const ORTHANC_STUDY = 'aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa';
const SERIES = 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb';
const INSTANCE = 'cccccccc-cccccccc-cccccccc-cccccccc-cccccccc';
const DICOM_BYTES = Buffer.concat([
  Buffer.alloc(128),
  Buffer.from('DICM'),
  Buffer.from('mri-slice'),
]);
const PNG_BYTES = Buffer.from('rendered-png-of-the-slice');

async function errorOf(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

describeWithDatabase('the analysis of a DICOM slice against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let analysis: DicomAnalysisService;
  let studies: DicomStudiesService;
  let timeline: AiTimelineService;
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-dicom-analysis-'));
  const cleanupStorage = applyStorageTestEnv();

  const received: {
    brain: Buffer[];
    cardio: { mime: string; image: Buffer }[];
  } = {
    brain: [],
    cardio: [],
  };
  const aiService = {
    analyzeBrain: (image: Buffer) => {
      received.brain.push(image);
      return Promise.resolve({
        classification: {
          modelId: 'brain-test',
          predictions: [
            { label: 'notumor', probability: 0.9 },
            { label: 'glioma', probability: 0.1 },
          ],
          weightsSha256: 'a'.repeat(64),
        },
        durationMs: 3,
        imageHeight: 8,
        imageWidth: 8,
        segmentation: null,
        segmentationSkippedReason: 'not_applicable_for_class',
      });
    },
    analyzeCardioSeg: (image: Buffer, _name: string, mime: string) => {
      received.cardio.push({ image, mime });
      return Promise.resolve({
        configSha256: 'd'.repeat(64),
        durationMs: 5,
        imageHeight: 216,
        imageWidth: 256,
        labelMapPng: Buffer.from('label'),
        modelId: 'cardio-seg-acdc-unet-effb4',
        noStructureFound: false,
        overlayPng: Buffer.from('overlay'),
        pixelSpacingMm: [1.5, 1.5],
        slicePng: Buffer.from('slice'),
        source: 'dicom',
        structures: {
          LV: { areaMm2: 3600, pixels: 1600 },
          MYO: { areaMm2: 1800, pixels: 800 },
          RV: { areaMm2: 1100, pixels: 489 },
        },
        weightsSha256: 'e'.repeat(64),
      });
    },
  };

  const orthanc = {
    getInstance: jest.fn(),
    getInstanceFile: jest.fn(),
    getInstanceRendered: jest.fn(),
    getStudySeries: jest.fn(),
  };

  const instance = (
    overrides: Partial<OrthancInstance> = {},
  ): OrthancInstance => ({
    fileSize: DICOM_BYTES.length,
    id: INSTANCE,
    imageOrientationPatient: null,
    imagePositionPatient: null,
    instanceNumber: 12,
    numberOfFrames: 1,
    parentSeries: SERIES,
    parentStudy: ORTHANC_STUDY,
    sopInstanceUid: '1.2.826.0.1.3680043.8.498.77',
    ...overrides,
  });

  // A doctor, a patient with the AI consent, and a study in their record.
  async function owner(
    options: { quota?: number; consent?: boolean; withStudy?: boolean } = {},
  ) {
    const doctor = await fixtures.independentDoctor({
      subscription: {
        customQuotas: {
          aiAnalysesPerMonth: options.quota ?? 5,
          aiPipelines: null,
          maxDoctors: null,
          maxPatients: null,
        },
      },
    });
    const patient = await fixtures.patient(
      doctor.workspace.id,
      doctor.profile.id,
    );
    if (options.consent !== false) {
      await prisma.patientConsent.create({
        data: {
          patientId: patient.id,
          recordedAt: new Date(),
          recordedById: doctor.actor.sub,
          status: 'SIGNED',
          type: 'DIAGNOSTIC_AI',
        },
      });
    }
    // A study of this workspace in Orthanc; another workspace may hold the same
    // one (its own row), or none.
    const study =
      options.withStudy === false
        ? null
        : await prisma.dicomStudy.create({
            data: {
              identityWarnings: [],
              instancesCount: 20,
              modalities: ['MR'],
              orthancStudyId: ORTHANC_STUDY,
              patientId: patient.id,
              seriesCount: 1,
              sizeBytes: BigInt(1000),
              studyInstanceUid: `1.2.826.0.1.${fixtures.next()}.${Date.now()}`,
              uploadedById: doctor.actor.sub,
              workspaceId: doctor.workspace.id,
            },
          });
    return { actor: doctor.actor, patient, study };
  }

  type Owner = Awaited<ReturnType<typeof owner>>;
  const documentsOf = (who: Owner) =>
    prisma.patientDocument.findMany({ where: { patientId: who.patient.id } });
  const runsOf = (who: Owner) =>
    prisma.aiAnalysisRun.findMany({ where: { patientId: who.patient.id } });

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    process.env.UPLOAD_ROOT = uploadRoot;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        StorageModule,
        PatientsModule,
        DicomModule,
      ],
    })
      .overrideProvider(OrthancClient)
      .useValue(orthanc)
      .overrideProvider(AiServiceClient)
      .useValue(aiService)
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    analysis = moduleRef.get(DicomAnalysisService);
    studies = moduleRef.get(DicomStudiesService);
    timeline = moduleRef.get(AiTimelineService, { strict: false });
    fixtures = new IntegrationFixtures(prisma, 'dan');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await moduleRef.close();
    rmSync(uploadRoot, { force: true, recursive: true });
    cleanupStorage();
  });

  beforeEach(() => {
    received.brain = [];
    received.cardio = [];
    jest.resetAllMocks();
    orthanc.getInstance.mockResolvedValue(instance());
    orthanc.getInstanceFile.mockResolvedValue(DICOM_BYTES);
    orthanc.getInstanceRendered.mockResolvedValue(PNG_BYTES);
    orthanc.getStudySeries.mockResolvedValue([
      {
        id: SERIES,
        modality: 'MR',
        number: 3,
        seriesInstanceUid: '1.2.826.0.1.3680043.8.498.100',
      },
    ]);
  });

  it('runs the cardiac chain on the DICOM file of the slice, and keeps the slice as a DICOM document', async () => {
    const who = await owner();

    const run = (await analysis.analyze(
      who.actor,
      INSTANCE,
      'cardio-seg-mri',
    )) as {
      id: string;
      status: string;
    };

    expect(run.status).toBe('SUCCEEDED');
    expect(received.cardio).toEqual([
      { image: DICOM_BYTES, mime: 'application/dicom' },
    ]);
    expect(received.brain).toHaveLength(0);
    const [document] = await documentsOf(who);
    expect(document).toMatchObject({
      dicomStudyId: who.study!.id,
      documentType: 'DICOM',
      instanceNumber: 12,
      mimeType: 'application/dicom',
      originalName: 'serie-3-coupe-12.dcm',
      patientId: who.patient.id,
      seriesInstanceUid: '1.2.826.0.1.3680043.8.498.100',
      seriesNumber: 3,
      size: DICOM_BYTES.length,
      sopInstanceUid: '1.2.826.0.1.3680043.8.498.77',
      uploadedById: who.actor.sub,
    });
    // The file reads back through the storage, decrypted to the original
    // bytes; on disk it is the ciphertext of the file format, never the
    // plaintext, under the private root and no path of anything.
    const storage = moduleRef.get(StorageService);
    expect(
      (await storage.getBuffer(storageReferenceOf(document)!)).equals(
        DICOM_BYTES,
      ),
    ).toBe(true);
    const ciphertext = await readFile(
      pathJoin(process.env.STORAGE_LOCAL_ROOT!, document.storageKey!),
    );
    expect(ciphertext.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)).toBe(
      true,
    );
    expect(ciphertext.indexOf(DICOM_BYTES)).toBe(-1);
    const stored = await prisma.aiAnalysisRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(stored.sourceDocumentId).toBe(document.id);
    expect(stored.pipeline).toBe('cardio-seg-mri');
  });

  it("runs the brain chain on Orthanc's PNG rendering, and keeps it as an image document", async () => {
    const who = await owner();

    const run = (await analysis.analyze(who.actor, INSTANCE, 'brain')) as {
      status: string;
    };

    expect(run.status).toBe('SUCCEEDED');
    expect(received.brain).toEqual([PNG_BYTES]);
    expect(received.cardio).toHaveLength(0);
    expect(orthanc.getInstanceRendered).toHaveBeenCalledWith(INSTANCE);
    const [document] = await documentsOf(who);
    expect(document).toMatchObject({
      dicomStudyId: who.study!.id,
      documentType: 'MEDICAL_IMAGE',
      instanceNumber: 12,
      mimeType: 'image/png',
      originalName: 'serie-3-coupe-12.png',
      seriesNumber: 3,
      sopInstanceUid: '1.2.826.0.1.3680043.8.498.77',
    });
    // The rendered PNG of the slice: encrypted like any document of the record.
    expect(
      (
        await moduleRef.get(StorageService).getBuffer(storageReferenceOf(document)!)
      ).equals(PNG_BYTES),
    ).toBe(true);
  });

  it('consumes the quota of AI analyses, and refuses the next one with nothing left behind', async () => {
    const who = await owner({ quota: 2 });
    const entitlements = () =>
      moduleRef
        .get(DicomAnalysisService)
        ['entitlements'].getEntitlements(who.study!.workspaceId) as Promise<{
        usage: { aiAnalysesThisMonth: number };
      }>;

    expect((await entitlements()).usage.aiAnalysesThisMonth).toBe(0);
    await analysis.analyze(who.actor, INSTANCE, 'brain');
    expect((await entitlements()).usage.aiAnalysesThisMonth).toBe(1);
    await analysis.analyze(who.actor, INSTANCE, 'cardio-seg-mri');
    expect((await entitlements()).usage.aiAnalysesThisMonth).toBe(2);

    const error = await errorOf(analysis.analyze(who.actor, INSTANCE, 'brain'));

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      limit: 2,
      used: 2,
    });
    expect(await runsOf(who)).toHaveLength(2);
    expect(await documentsOf(who)).toHaveLength(2);
    expect(received.brain).toHaveLength(1);
  });

  it('refuses a patient without the DIAGNOSTIC_AI consent, and stores nothing', async () => {
    const who = await owner({ consent: false });

    const error = await errorOf(analysis.analyze(who.actor, INSTANCE, 'brain'));

    expect(error.getStatus()).toBe(403);
    expect(await documentsOf(who)).toHaveLength(0);
    expect(await runsOf(who)).toHaveLength(0);
  });

  it('answers 404 to a doctor of another workspace, and stores nothing', async () => {
    const who = await owner();
    // A workspace that holds no row for the study: Orthanc has it, but not for them.
    const stranger = await owner({ withStudy: false });

    await expect(
      analysis.analyze(stranger.actor, INSTANCE, 'brain'),
    ).rejects.toBeInstanceOf(NotFoundException);
    // The slice belongs to one study of one workspace: the other has none.
    expect(await documentsOf(who)).toHaveLength(0);
    expect(await documentsOf(stranger)).toHaveLength(0);
  });

  it.each([
    ['a chain that reads no slice', 'pathology-breast', {}, 'PIPELINE'],
    ['a CT', 'brain', { modality: 'CT' }, 'MODALITY'],
  ] as const)(
    'refuses %s with 422, and stores nothing',
    async (_label, pipeline, series, reason) => {
      const who = await owner();
      orthanc.getStudySeries.mockResolvedValue([
        {
          id: SERIES,
          modality: 'MR',
          number: 3,
          seriesInstanceUid: '1.2.3',
          ...series,
        },
      ]);

      const error = await errorOf(
        analysis.analyze(who.actor, INSTANCE, pipeline),
      );

      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: 'DICOM_PIPELINE_NOT_SUPPORTED',
        reason,
      });
      expect(await documentsOf(who)).toHaveLength(0);
      expect(await runsOf(who)).toHaveLength(0);
    },
  );

  it('refuses a multi-frame instance with 422, and stores nothing', async () => {
    const who = await owner();
    orthanc.getInstance.mockResolvedValue(instance({ numberOfFrames: 25 }));

    const error = await errorOf(
      analysis.analyze(who.actor, INSTANCE, 'cardio-seg-mri'),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'DICOM_MULTIFRAME_NOT_SUPPORTED',
      frames: 25,
    });
    expect(await documentsOf(who)).toHaveLength(0);
  });

  it('names the slice in the timeline of the patient, and keeps it when the study is deleted', async () => {
    const who = await owner();
    await analysis.analyze(who.actor, INSTANCE, 'brain');

    const before = await timeline.timeline(who.actor, who.patient.id, 'brain');
    expect(before.items.map((item) => item.slice)).toEqual([
      { instanceNumber: 12, seriesNumber: 3 },
    ]);

    // The study goes, the analysis and its source stay (Orthanc is mocked: the
    // deletion of its copy is not the subject here).
    orthanc.getInstance.mockResolvedValue(instance());
    await studies.remove(who.actor, who.study!.id);

    const [document] = await documentsOf(who);
    expect(document).toMatchObject({
      dicomStudyId: null,
      instanceNumber: 12,
      seriesNumber: 3,
    });
    const after = await timeline.timeline(who.actor, who.patient.id, 'brain');
    expect(after.items).toHaveLength(1);
    expect(after.items[0].slice).toEqual({
      instanceNumber: 12,
      seriesNumber: 3,
    });
  });

  it('shows no slice for a run made on an ordinary document', async () => {
    const who = await owner();
    const directory = join(uploadRoot, 'ordinary');
    rmSync(directory, { force: true, recursive: true });
    const document = await prisma.patientDocument.create({
      data: {
        documentType: 'MEDICAL_IMAGE',
        localPath: join(directory, 'scan.png'),
        mimeType: 'image/png',
        originalName: 'scan.png',
        patientId: who.patient.id,
        size: 1,
        storedName: 'scan.png',
        uploadedById: who.actor.sub,
      },
    });
    await prisma.aiAnalysisRun.create({
      data: {
        classificationModelId: 'brain-test',
        classificationWeightsSha256: 'a'.repeat(64),
        patientId: who.patient.id,
        pipeline: 'brain',
        predictions: [{ label: 'notumor', probability: 0.9 }],
        requestedById: who.actor.sub,
        sourceDocumentId: document.id,
        status: 'SUCCEEDED',
      } as never,
    });

    const result = await timeline.timeline(who.actor, who.patient.id, 'brain');

    expect(result.items.map((item) => item.slice)).toEqual([null]);
  });
});
