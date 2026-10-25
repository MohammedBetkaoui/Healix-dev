import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiAnalysisRunStatus,
  WorkspaceMembershipRole,
  WorkspaceType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { UserRole } from '../common/enums/user-role.enum';
import { PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { PatientFileValidator } from '../patients/documents/patient-file-validator';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { passThroughEntitlements } from '../subscriptions/testing/entitlements-stub';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import {
  AiAnalysisRunsService,
  isZipDocument,
  staleRunAfterMs,
} from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';
import { CorrectVolumetryDto } from './dto/correct-volumetry.dto';
import { DecideAiAnalysisRunDto } from './dto/decide-ai-analysis-run.dto';
import {
  cardioVolumeBody,
  cardioVolumeResult,
  CARDIO_VOLUME_MODEL_ID,
  CARDIO_VOLUME_WEIGHTS,
} from './volumetry/cardio-volume.fixtures';
import { decodeGrayPng, encodeRgbaPng } from './volumetry/label-overlay';
import {
  applyCorrection,
  buildVolumetry,
  readVolumetry,
} from './volumetry/volumetry';

// The cine volumetry chain on the backend side: fetch is simulated, everything
// else (scope, consent, storage, response validation, recalculation) is real.

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });

const doctor = {
  sub: 'doctor-a',
  email: 'doctor-a@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  tokenType: 'access' as const,
};

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
};

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('isZipDocument', () => {
  it('knows an archive by its MIME type, or a .zip sent without one', () => {
    const doc = (mimeType: string, originalName: string) => ({
      mimeType,
      originalName,
    });
    expect(isZipDocument(doc('application/zip', 'a.zip'))).toBe(true);
    expect(isZipDocument(doc('application/x-zip-compressed', 'a.zip'))).toBe(
      true,
    );
    expect(isZipDocument(doc('', 'SERIE.ZIP'))).toBe(true);
    expect(isZipDocument(doc('application/dicom', 'a.dcm'))).toBe(false);
    expect(isZipDocument(doc('image/png', 'a.zip'))).toBe(false);
    expect(isZipDocument(doc('', 'a.png'))).toBe(false);
  });
});

describe('AiAnalysisRunsService, cardio-volume-mri (POST /patients/:id/ai-analysis-runs)', () => {
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-volume-'));
  const documents = join(uploadRoot, 'patients', 'patient-a', 'documents');
  const zipPath = join(documents, 'stack.zip');

  const patientFindFirst = jest.fn();
  const consentFindMany = jest.fn();
  const documentFindFirst = jest.fn();
  type RunData = Record<string, unknown>;
  const runCreate = jest.fn<Promise<RunData>, [{ data: RunData }]>();
  const runUpdate = jest.fn<
    Promise<RunData>,
    [{ data: RunData; where: { id: string } }]
  >();
  const log = jest.fn<Promise<void>, [unknown, string, string, unknown?]>();
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const originalFetch = global.fetch;

  const prisma = {
    aiAnalysisRun: { create: runCreate, update: runUpdate },
    patient: { findFirst: patientFindFirst },
    patientConsent: { findMany: consentFindMany },
    patientDocument: { findFirst: documentFindFirst },
  } as unknown as PrismaService;
  const storage = new PatientFileStorageService(
    config({ UPLOAD_ROOT: uploadRoot }),
  );
  const audit = { log } as unknown as PatientAuditService;
  const patients = new PatientsService(
    prisma,
    audit,
    {} as PatientFileValidator,
    storage,
    {
      resolveWorkspaceForUser: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-a',
        workspaceType: WorkspaceType.PRIVATE_PRACTICE,
        membershipRole: WorkspaceMembershipRole.OWNER,
        doctorProfileId: 'doctor-profile-a',
      }),
    } as unknown as WorkspaceContextService,
    passThroughEntitlements(),
  );
  const service = new AiAnalysisRunsService(
    prisma,
    patients,
    storage,
    audit,
    new AiServiceClient(
      config({ AI_SERVICE_TOKEN: 'secret', AI_SERVICE_URL: 'http://ai.test' }),
    ),
    passThroughEntitlements(prisma),
  );

  const zipDocument = {
    documentType: 'DICOM',
    id: 'document-cine',
    localPath: zipPath,
    mimeType: 'application/zip',
    originalName: 'serie-5-cine.zip',
    patientId: 'patient-a',
  };
  const dto = {
    pipeline: 'cardio-volume-mri' as const,
    sourceDocumentId: 'document-cine',
  };

  beforeAll(() => {
    mkdirSync(documents, { recursive: true });
    writeFileSync(zipPath, 'zip-bytes');
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    rmSync(uploadRoot, { force: true, recursive: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    patientFindFirst.mockResolvedValue({ id: 'patient-a' });
    consentFindMany.mockResolvedValue([
      { status: 'SIGNED', type: 'DIAGNOSTIC_AI' },
    ]);
    documentFindFirst.mockResolvedValue(zipDocument);
    runCreate.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: 'run-cine', maskPath: null }),
    );
    runUpdate.mockImplementation(({ data }) =>
      Promise.resolve({
        ...runCreate.mock.calls[0][0].data,
        id: 'run-cine',
        maskPath: null,
        ...data,
      }),
    );
    log.mockResolvedValue(undefined);
  });

  const lastUpdate = () => runUpdate.mock.lastCall?.[0].data;

  it('stores the volumetry, the images of ED and ES, and the model card; answers without every area', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, cardioVolumeBody()));

    const run = await service.create(doctor, 'patient-a', dto);

    const [url, init] = fetchMock.mock.lastCall as [string, RequestInit];
    expect(url).toBe('http://ai.test/analyze/cardio/volume-mri');
    expect((init.body as FormData).get('stack')).toBeInstanceOf(Blob);

    const data = lastUpdate();
    expect(data).toMatchObject({
      segmentationModelId: CARDIO_VOLUME_MODEL_ID,
      segmentationWeightsSha256: CARDIO_VOLUME_WEIGHTS,
      status: AiAnalysisRunStatus.SUCCEEDED,
    });
    expect(data?.predictions).toEqual({ configSha256: 'b'.repeat(64) });
    // Nothing of a classification or of a single slice.
    expect(data).not.toHaveProperty('classificationModelId');
    expect(data).not.toHaveProperty('slicePath');
    expect(data).not.toHaveProperty('overlayPath');

    const stored = readVolumetry(data?.volumetry);
    expect(stored?.areasMm2).toHaveLength(5);
    expect(stored?.auto.measures.lv.efPercent).toBeCloseTo(38, 10);
    expect(stored?.corrected).toBeNull();

    // 6 slices, the class map and the slice, at ED and at ES.
    const folder = data?.maskPath as string;
    expect(existsSync(folder)).toBe(true);
    expect(readdirSync(folder).sort()).toEqual(
      ['label', 'slice']
        .flatMap((kind) =>
          ['ed', 'es'].flatMap((phase) =>
            [0, 1, 2, 3, 4, 5].map((i) => `${kind}-${phase}-00${i}.png`),
          ),
        )
        .sort(),
    );

    expect(run).toMatchObject({
      hasMask: true,
      hasOverlay: false,
      hasSlice: false,
      modelLabel: null,
      pipeline: 'cardio-volume-mri',
    });
    expect(run.volumetry).toMatchObject({
      modified: false,
      phases: 5,
      sliceGapMm: 8,
    });
    expect(run.volumetry).not.toHaveProperty('areasMm2');
    expect(run).not.toHaveProperty('maskPath');
    // The audit names the chain, never a figure.
    expect(JSON.stringify(log.mock.calls)).not.toContain('efPercent');
    expect(JSON.stringify(log.mock.calls)).not.toContain('43.2');
  });

  it('takes a ZIP only, and no magnification', async () => {
    for (const document of [
      { ...zipDocument, mimeType: 'image/png', originalName: 'slice.png' },
      {
        ...zipDocument,
        documentType: 'DICOM',
        mimeType: 'application/dicom',
        originalName: 'slice.dcm',
      },
      { ...zipDocument, mimeType: 'application/pdf', originalName: 'cr.pdf' },
    ]) {
      documentFindFirst.mockResolvedValue(document);
      const error = await errorOf(service.create(doctor, 'patient-a', dto));
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.getResponse()).toMatchObject({
        code: 'AI_UNSUPPORTED_DOCUMENT',
      });
    }
    const magnified = await errorOf(
      service.create(doctor, 'patient-a', { ...dto, magnification: 40 }),
    );
    expect(magnified).toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('refuses without the consent for diagnostic AI, before anything is read or sent', async () => {
    consentFindMany.mockResolvedValue([]);
    const error = await errorOf(service.create(doctor, 'patient-a', dto));
    expect(error.getStatus()).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('counts the run against the plan with its chain: a plan without it is refused there', async () => {
    const withQuota = jest
      .fn<Promise<never>, [string, string, unknown, { pipeline: string }]>()
      .mockRejectedValue(
        new ConflictException({
          code: 'AI_PIPELINE_NOT_IN_PLAN',
          pipeline: 'cardio-volume-mri',
        }),
      );
    const locked = new AiAnalysisRunsService(
      prisma,
      patients,
      storage,
      audit,
      new AiServiceClient(
        config({
          AI_SERVICE_TOKEN: 'secret',
          AI_SERVICE_URL: 'http://ai.test',
        }),
      ),
      { withQuota } as never,
    );

    const error = await errorOf(locked.create(doctor, 'patient-a', dto));

    expect(error.getResponse()).toMatchObject({
      code: 'AI_PIPELINE_NOT_IN_PLAN',
    });
    expect(withQuota.mock.lastCall?.[1]).toBe('aiAnalysesPerMonth');
    expect(withQuota.mock.lastCall?.[3]).toEqual({
      pipeline: 'cardio-volume-mri',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores a refused stack as REJECTED_INPUT and says why', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { code: 'cardio_volume_too_few_slices', found: 4, min: 6 },
      }),
    );
    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_INPUT_REJECTED',
      details: { found: 4, min: 6 },
      reason: 'CARDIO_VOLUME_TOO_FEW_SLICES',
      runId: 'run-cine',
    });
    expect(lastUpdate()).toEqual({
      errorCode: 'CARDIO_VOLUME_TOO_FEW_SLICES',
      status: AiAnalysisRunStatus.REJECTED_INPUT,
    });

    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { code: 'cardio_volume_not_mr', modality: 'CT' },
      }),
    );
    expect(
      (await errorOf(service.create(doctor, 'patient-a', dto))).getResponse(),
    ).toMatchObject({
      details: { modality: 'CT' },
      reason: 'CARDIO_VOLUME_NOT_MR',
    });
  });

  it('is FAILED when the service does not answer in time, a 504 for the caller', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    );
    const error = await errorOf(service.create(doctor, 'patient-a', dto));
    expect(error.getStatus()).toBe(504);
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_TIMEOUT',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('never stores an answer whose measures are not the ones its areas give', async () => {
    const body = cardioVolumeBody();
    (body.measures as { lv: { efPercent: number } }).lv.efPercent = 45;
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(BadGatewayException);
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_ERROR',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('is FAILED, with no folder left, when the images cannot be stored', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, cardioVolumeBody()));
    const spy = jest
      .spyOn(storage, 'storeAiVolumetryImages')
      .mockRejectedValueOnce(new InternalServerErrorException('disk full'));

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_MASK_STORAGE_FAILED',
    });
    expect(lastUpdate()).toEqual({
      errorCode: 'MASK_STORAGE_FAILED',
      status: AiAnalysisRunStatus.FAILED,
    });
    spy.mockRestore();
  });
});

describe('AiAnalysisRunsService, cardio-volume-mri images, corrections and decision', () => {
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-volume-run-'));
  const findFirst = jest.fn<Promise<unknown>, [unknown]>();
  const updateMany = jest.fn<
    Promise<{ count: number }>,
    [{ data: Record<string, unknown>; where: Record<string, unknown> }]
  >();
  const getPatientInScope = jest.fn();
  const log = jest.fn<
    Promise<void>,
    [typeof doctor, string, string, Record<string, unknown>]
  >();
  const storage = new PatientFileStorageService(
    config({ UPLOAD_ROOT: uploadRoot }),
  );
  const service = new AiAnalysisRunsService(
    { aiAnalysisRun: { findFirst, updateMany } } as unknown as PrismaService,
    { getPatientInScope } as unknown as PatientsService,
    storage,
    { log } as unknown as PatientAuditService,
    {} as AiServiceClient,
    passThroughEntitlements(),
  );

  let folder: string;
  const updatedAt = new Date('2026-10-25T08:00:00.000Z');

  const volumeRun = (overrides: Record<string, unknown> = {}) => ({
    createdAt: new Date('2026-10-25T07:50:00.000Z'),
    decidedAt: null,
    decidedBy: null,
    decidedById: null,
    decisionLabel: null,
    decisionLabels: null,
    decisionReason: null,
    decisionStatus: null,
    id: 'run-cine',
    maskPath: folder,
    modelDecision: null,
    overlayPath: null,
    patientId: 'patient-a',
    pipeline: 'cardio-volume-mri',
    predictions: { configSha256: 'b'.repeat(64) },
    slicePath: null,
    status: 'SUCCEEDED',
    updatedAt,
    volumetry: JSON.parse(
      JSON.stringify(buildVolumetry(cardioVolumeResult())),
    ) as unknown,
    ...overrides,
  });

  // Any PNG that is not the class map: the overlay of a run is made from the map only.
  const sliceImage = () => encodeRgbaPng(2, 2, new Uint8Array(16).fill(7));

  beforeAll(async () => {
    const result = cardioVolumeResult();
    const stored = await storage.storeAiVolumetryImages({
      images: (['ed', 'es'] as const).flatMap((phase) =>
        result.slicesPng[phase].flatMap((png, index) => [
          // The slice is a grey-level image of the anatomy: not a class map.
          { name: `slice-${phase}-00${index}.png`, png: sliceImage() },
          {
            name: `label-${phase}-00${index}.png`,
            png: result.labelMapsPng[phase][index],
          },
        ]),
      ),
      patientId: 'patient-a',
      runId: 'run-cine',
    });
    folder = stored.localPath;
  });

  afterAll(() => {
    rmSync(uploadRoot, { force: true, recursive: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getPatientInScope.mockResolvedValue({ id: 'patient-a' });
    log.mockResolvedValue(undefined);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockImplementation(() => Promise.resolve(volumeRun()));
  });

  describe('images', () => {
    it('serves the class map, the slice and the colour overlay of an image, per phase and slice', async () => {
      const mask = await service.getMask(doctor, 'patient-a', 'run-cine', {
        phase: 'ed',
        slice: 2,
      });
      expect(mask.fileName).toBe('masque-run-cine-ed-2.png');
      expect(decodeGrayPng(mask.png).width).toBe(8);

      const slice = await service.getSlice(doctor, 'patient-a', 'run-cine', {
        phase: 'es',
        slice: 0,
      });
      expect(slice.fileName).toBe('coupe-run-cine-es-0.png');
      expect(slice.png.subarray(1, 4).toString()).toBe('PNG');

      const overlay = await service.getOverlay(
        doctor,
        'patient-a',
        'run-cine',
        {
          phase: 'ed',
          slice: 5,
        },
      );
      expect(overlay.fileName).toBe('superposition-run-cine-ed-5.png');
      // Coloured from the class map: RGBA, not the one-channel map.
      expect(overlay.png.readUInt8(25)).toBe(6);
      expect(overlay.png.equals(mask.png)).toBe(false);
      expect(getPatientInScope).toHaveBeenCalledTimes(3);
    });

    it('asks which image, and answers 404 for one that does not exist', async () => {
      const missing = await errorOf(
        service.getMask(doctor, 'patient-a', 'run-cine'),
      );
      expect(missing).toBeInstanceOf(BadRequestException);
      expect(missing.getResponse()).toMatchObject({
        code: 'AI_VOLUMETRY_IMAGE_SELECTOR',
      });
      await expect(
        service.getSlice(doctor, 'patient-a', 'run-cine', { phase: 'ed' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const read = jest.spyOn(storage, 'readAiVolumetryImage');
      await expect(
        service.getSlice(doctor, 'patient-a', 'run-cine', {
          phase: 'ed',
          slice: 6,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Refused before the disk is asked for a file that cannot be there.
      expect(read).not.toHaveBeenCalled();
      read.mockRestore();
      findFirst.mockResolvedValue(volumeRun({ maskPath: null }));
      await expect(
        service.getMask(doctor, 'patient-a', 'run-cine', {
          phase: 'ed',
          slice: 0,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 404 for a run of another patient (looked up by id and patient)', async () => {
      findFirst.mockResolvedValue(null);
      await expect(
        service.getOverlay(doctor, 'patient-b', 'run-cine', {
          phase: 'ed',
          slice: 0,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findFirst.mock.lastCall?.[0]).toMatchObject({
        where: { id: 'run-cine', patientId: 'patient-b' },
      });
    });
  });

  describe('correction (PATCH .../volumetry)', () => {
    const correct = (body: Record<string, unknown>) =>
      service.correctVolumetry(
        doctor,
        'patient-a',
        'run-cine',
        plainToInstance(CorrectVolumetryDto, body),
      );

    it('calculates the measures again, with no new inference, and keeps the proposal', async () => {
      await correct({ esPhase: 1, excludedSlices: [0] });

      const [{ data, where }] = updateMany.mock.calls[0];
      const saved = readVolumetry(data.volumetry);
      expect(saved?.corrected).toMatchObject({
        edPhase: 0,
        esPhase: 1,
        excludedSlices: [0],
      });
      expect(saved?.corrected?.measures.lv.edvMl).toBeCloseTo(31.2, 10);
      expect(saved?.auto.esPhase).toBe(3);
      // Written only while nothing was decided and nothing changed meanwhile.
      expect(where).toEqual({
        decisionStatus: null,
        id: 'run-cine',
        status: AiAnalysisRunStatus.SUCCEEDED,
        updatedAt,
      });
    });

    it('audits the phases and the slices, never a height nor a weight', async () => {
      await correct({
        esPhase: 2,
        heightCm: 171,
        weightKg: 73,
      });

      expect(log).toHaveBeenCalledWith(
        doctor,
        'AI_VOLUMETRY_CORRECTED',
        'run-cine',
        {
          bsaSource: 'manual',
          edPhase: 0,
          esPhase: 2,
          excludedSlices: [],
          patientId: 'patient-a',
        },
      );
      const everything = JSON.stringify([
        log.mock.calls,
        updateMany.mock.calls,
      ]);
      expect(everything).not.toMatch(/height|weight/i);
      expect(everything).not.toMatch(/[:,[](?:171|73)[,}\]]/);
    });

    it('chooses ED and ES again from the slices kept when asked', async () => {
      // A volumetry whose ES moves when the slice that carries it is left out.
      findFirst.mockResolvedValue(
        volumeRun({
          volumetry: JSON.parse(
            JSON.stringify(
              buildVolumetry(
                cardioVolumeResult({ factors: [0.7, 0.62, 0.8, 1, 0.9] }),
              ),
            ),
          ) as unknown,
        }),
      );
      await correct({ automatic: true, excludedSlices: [1] });
      const saved = readVolumetry(updateMany.mock.calls[0][0].data.volumetry);
      expect(saved?.corrected).toMatchObject({
        edPhase: 3,
        esPhase: 1,
        excludedSlices: [1],
      });
    });

    it('refuses what has no meaning for this stack: 400, nothing written', async () => {
      for (const body of [
        {},
        { edPhase: 9 },
        { excludedSlices: [0, 1, 2, 3, 4, 5] },
        { excludedSlices: [7] },
        { heightCm: 171 },
        { automatic: true, esPhase: 1 },
      ]) {
        const error = await errorOf(correct(body));
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse()).toMatchObject({
          code: 'AI_VOLUMETRY_INVALID',
        });
      }
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('is refused once the run is decided, not SUCCEEDED, or not a volumetry', async () => {
      findFirst.mockResolvedValue(volumeRun({ decisionStatus: 'VALIDATED' }));
      expect(
        (await errorOf(correct({ esPhase: 1 }))).getResponse(),
      ).toMatchObject({
        code: 'AI_RUN_ALREADY_DECIDED',
      });

      findFirst.mockResolvedValue(volumeRun({ status: 'FAILED' }));
      expect(
        (await errorOf(correct({ esPhase: 1 }))).getResponse(),
      ).toMatchObject({
        code: 'AI_RUN_NOT_DECIDABLE',
      });

      findFirst.mockResolvedValue(volumeRun({ pipeline: 'brain' }));
      expect(
        (await errorOf(correct({ esPhase: 1 }))).getResponse(),
      ).toMatchObject({
        code: 'AI_VOLUMETRY_NOT_APPLICABLE',
      });

      findFirst.mockResolvedValue(volumeRun({ volumetry: null }));
      expect(await errorOf(correct({ esPhase: 1 }))).toBeInstanceOf(
        ConflictException,
      );
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('tells a decision that landed first, and a correction saved at the same time', async () => {
      updateMany.mockResolvedValue({ count: 0 });
      findFirst
        .mockResolvedValueOnce(volumeRun())
        .mockResolvedValueOnce({ decisionStatus: 'VALIDATED' });
      expect(
        (await errorOf(correct({ esPhase: 1 }))).getResponse(),
      ).toMatchObject({
        code: 'AI_RUN_ALREADY_DECIDED',
      });

      findFirst
        .mockResolvedValueOnce(volumeRun())
        .mockResolvedValueOnce({ decisionStatus: null });
      expect(
        (await errorOf(correct({ esPhase: 1 }))).getResponse(),
      ).toMatchObject({
        code: 'AI_VOLUMETRY_CONFLICT',
      });
      expect(log).not.toHaveBeenCalled();
    });

    it('validates the body: ranges, and nothing unknown', async () => {
      const invalid = async (body: Record<string, unknown>) =>
        (await validate(plainToInstance(CorrectVolumetryDto, body))).map(
          (error) => error.property,
        );
      expect(await invalid({ esPhase: 12, excludedSlices: [1, 2] })).toEqual(
        [],
      );
      expect(await invalid({ edPhase: -1 })).toEqual(['edPhase']);
      expect(await invalid({ esPhase: 1.5 })).toEqual(['esPhase']);
      expect(await invalid({ edPhase: 30 })).toEqual(['edPhase']);
      expect(await invalid({ excludedSlices: [1, 1] })).toEqual([
        'excludedSlices',
      ]);
      expect(await invalid({ excludedSlices: [100] })).toEqual([
        'excludedSlices',
      ]);
      expect(await invalid({ heightCm: 5, weightKg: 73 })).toEqual([
        'heightCm',
      ]);
      expect(await invalid({ heightCm: 171, weightKg: 1000 })).toEqual([
        'weightKg',
      ]);
      expect(await invalid({ automatic: 'yes' })).toEqual(['automatic']);
    });
  });

  describe('decision', () => {
    const decide = (body: Record<string, unknown>) =>
      service.decide(
        doctor,
        'patient-a',
        'run-cine',
        plainToInstance(DecideAiAnalysisRunDto, body),
      );
    const modifiedRun = () =>
      volumeRun({
        volumetry: JSON.parse(
          JSON.stringify(
            applyCorrection(buildVolumetry(cardioVolumeResult()), {
              esPhase: 1,
            }),
          ),
        ) as unknown,
      });

    it('validates the model measures as they stand', async () => {
      await decide({ status: 'VALIDATED' });

      expect(updateMany.mock.lastCall?.[0].data).toMatchObject({
        decisionLabel: null,
        decisionStatus: 'VALIDATED',
      });
      expect(log.mock.lastCall?.[3]).toMatchObject({
        agreesWithModel: true,
        modified: false,
        status: 'VALIDATED',
      });
    });

    it('validates what the physician typed to index with: a height and a weight change no measure', async () => {
      findFirst.mockResolvedValue(
        volumeRun({
          volumetry: JSON.parse(
            JSON.stringify(
              applyCorrection(
                buildVolumetry(cardioVolumeResult({ bsaM2: null })),
                {
                  heightCm: 171,
                  weightKg: 73,
                },
              ),
            ),
          ) as unknown,
        }),
      );
      await decide({ status: 'VALIDATED' });
      expect(updateMany.mock.lastCall?.[0].data).toMatchObject({
        decisionStatus: 'VALIDATED',
      });
    });

    it('is CORRECTED when the physician changed ED, ES or the slices', async () => {
      findFirst.mockResolvedValue(modifiedRun());

      await decide({
        measuresCorrected: true,
        reason: 'Télésystole décalée, coupe basale exclue.',
        status: 'CORRECTED',
      });

      expect(updateMany.mock.lastCall?.[0].data).toMatchObject({
        decisionLabel: null,
        decisionReason: 'Télésystole décalée, coupe basale exclue.',
        decisionStatus: 'CORRECTED',
      });
      expect(log.mock.lastCall?.[3]).toEqual({
        agreesWithModel: false,
        modified: true,
        status: 'CORRECTED',
      });
    });

    it('does not validate measures that were changed, nor correct measures that were not', async () => {
      findFirst.mockResolvedValue(modifiedRun());
      expect(
        (await errorOf(decide({ status: 'VALIDATED' }))).getResponse(),
      ).toMatchObject({
        code: 'AI_VOLUMETRY_MODIFIED',
      });

      findFirst.mockResolvedValue(volumeRun());
      expect(
        (
          await errorOf(
            decide({
              measuresCorrected: true,
              reason: 'Rien à corriger en réalité.',
              status: 'CORRECTED',
            }),
          )
        ).getResponse(),
      ).toMatchObject({ code: 'AI_CORRECTION_MATCHES_MODEL' });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('is rejected with a reason, whether or not the measures were changed', async () => {
      await decide({ reason: 'Série non exploitable.', status: 'REJECTED' });
      expect(log.mock.lastCall?.[3]).toMatchObject({
        agreesWithModel: null,
        status: 'REJECTED',
      });
      findFirst.mockResolvedValue(modifiedRun());
      await decide({ reason: 'Série non exploitable.', status: 'REJECTED' });
      expect(updateMany).toHaveBeenCalledTimes(2);
    });

    it('takes no label, and a corrected-measures flag on a cine volumetry only', async () => {
      expect(
        (
          await errorOf(
            decide({
              correctedLabel: 'other',
              reason: 'Contours faux sur la série.',
              status: 'CORRECTED',
            }),
          )
        ).getResponse(),
      ).toMatchObject({ code: 'AI_CORRECTED_LABEL_UNEXPECTED' });
      expect(
        (
          await errorOf(
            decide({ measuresCorrected: true, status: 'VALIDATED' }),
          )
        ).getResponse(),
      ).toMatchObject({ code: 'AI_MEASURES_CORRECTED_UNEXPECTED' });

      findFirst.mockResolvedValue(volumeRun({ pipeline: 'cardio-seg-mri' }));
      expect(
        (
          await errorOf(
            decide({
              measuresCorrected: true,
              reason: 'Contours faux sur la coupe.',
              status: 'CORRECTED',
            }),
          )
        ).getResponse(),
      ).toMatchObject({ code: 'AI_MEASURES_CORRECTED_NOT_APPLICABLE' });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('is final: a second decision is refused, as is one on a run without measures', async () => {
      findFirst.mockResolvedValue(volumeRun({ decisionStatus: 'VALIDATED' }));
      expect(
        (await errorOf(decide({ status: 'VALIDATED' }))).getResponse(),
      ).toMatchObject({
        code: 'AI_RUN_ALREADY_DECIDED',
      });
      findFirst.mockResolvedValue(volumeRun({ volumetry: null }));
      expect(
        (await errorOf(decide({ status: 'VALIDATED' }))).getResponse(),
      ).toMatchObject({
        code: 'AI_RUN_NOT_DECIDABLE',
      });
    });

    it('validates the body: a correction of measures needs no class, only a reason', async () => {
      const invalid = async (body: Record<string, unknown>) =>
        (await validate(plainToInstance(DecideAiAnalysisRunDto, body))).map(
          (error) => error.property,
        );
      expect(
        await invalid({
          measuresCorrected: true,
          reason: 'Télésystole décalée.',
          status: 'CORRECTED',
        }),
      ).toEqual([]);
      // Without the flag, a correction still needs a class (the other chains).
      expect(
        await invalid({ reason: 'Télésystole décalée.', status: 'CORRECTED' }),
      ).toEqual(['correctedLabel']);
      expect(
        await invalid({ measuresCorrected: true, status: 'CORRECTED' }),
      ).toEqual(['reason']);
      expect(
        await invalid({ measuresCorrected: 'oui', status: 'VALIDATED' }),
      ).toEqual(['measuresCorrected']);
    });
  });

  describe('a run still RUNNING', () => {
    const running = (pipeline: string, ageMs: number) => ({
      createdAt: new Date(Date.now() - ageMs),
      id: 'run-cine',
      magnification: null,
      pipeline,
      status: AiAnalysisRunStatus.RUNNING,
    });

    it('is interrupted after 4 minutes for a cine, 2 for the other chains', async () => {
      const stale = jest.fn().mockResolvedValue({ count: 1 });
      findFirst.mockResolvedValue({ id: 'run-cine', status: 'FAILED' });
      const expiring = new AiAnalysisRunsService(
        {
          aiAnalysisRun: { findFirst, updateMany: stale },
        } as unknown as PrismaService,
        {} as PatientsService,
        storage,
        { log } as unknown as PatientAuditService,
        {} as AiServiceClient,
        passThroughEntitlements(),
      );
      const minutes = (count: number) => count * 60_000;

      // 3 minutes: a cine is still waiting for the service (up to 3 minutes + 1).
      await expiring.expireIfStale(
        doctor,
        running('cardio-volume-mri', minutes(3.5)) as never,
      );
      expect(stale).not.toHaveBeenCalled();
      await expiring.expireIfStale(
        doctor,
        running('brain', minutes(2.5)) as never,
      );
      expect(stale).toHaveBeenCalledTimes(1);
      await expiring.expireIfStale(
        doctor,
        running('cardio-volume-mri', minutes(4.5)) as never,
      );
      expect(stale).toHaveBeenCalledTimes(2);
      expect(staleRunAfterMs('cardio-volume-mri')).toBe(minutes(4));
    });
  });
});
