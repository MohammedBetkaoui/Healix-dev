import {
  BadGatewayException,
  BadRequestException,
  HttpException,
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
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import {
  AiAnalysisRunsService,
  isDicomDocument,
} from './ai-analysis-runs.service';
import { AiServiceClient, parseCardioSegAnalysis } from './ai-service.client';
import { DecideAiAnalysisRunDto } from './dto/decide-ai-analysis-run.dto';
import { passThroughEntitlements } from '../subscriptions/testing/entitlements-stub';

// The cardiac MRI chain on the backend side: fetch is simulated, everything
// else (scope, consent, storage, response validation) is real.

const SHA_WEIGHTS =
  '252fb672137d89835c6acc7f10d7c3c8873b8a3925eb1f2061fa51105e23901c';
const SHA_CARD = 'c'.repeat(64);
// 1×1 one-channel PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==';

const segBody = (overrides: Record<string, unknown> = {}) => ({
  configSha256: SHA_CARD,
  durationMs: 310,
  imageHeight: 256,
  imageWidth: 216,
  labelMapPng: PNG_BASE64,
  modelId: 'cardio-seg-acdc-unet-effb4',
  noStructureFound: false,
  overlayPng: PNG_BASE64,
  pixelSpacingMm: null,
  slicePng: PNG_BASE64,
  source: 'image',
  structures: {
    LV: { areaMm2: null, pixels: 1611 },
    MYO: { areaMm2: null, pixels: 881 },
    RV: { areaMm2: null, pixels: 498 },
  },
  weightsSha256: SHA_WEIGHTS,
  ...overrides,
});

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

describe('parseCardioSegAnalysis', () => {
  it('reads a coherent answer, mm² only with a spacing', () => {
    expect(parseCardioSegAnalysis(segBody())).toMatchObject({
      noStructureFound: false,
      pixelSpacingMm: null,
      structures: { LV: { areaMm2: null, pixels: 1611 } },
    });
    const withSpacing = segBody({
      pixelSpacingMm: [1.5, 1.5],
      source: 'dicom',
      structures: {
        LV: { areaMm2: 3624.75, pixels: 1611 },
        MYO: { areaMm2: 1982.25, pixels: 881 },
        RV: { areaMm2: 1120.5, pixels: 498 },
      },
    });
    expect(parseCardioSegAnalysis(withSpacing).pixelSpacingMm).toEqual([
      1.5, 1.5,
    ]);
  });

  it('never stores an incoherent answer', () => {
    for (const body of [
      segBody({ noStructureFound: true }),
      segBody({ pixelSpacingMm: [1.5, 1.5] }), // no mm² with a spacing
      segBody({ structures: { LV: { areaMm2: null, pixels: 1 } } }),
      segBody({ slicePng: Buffer.from('not a png').toString('base64') }),
      segBody({ modelId: 'cardio-seg-ct-la-unet-effb4' }),
      segBody({ imageHeight: 2, imageWidth: 2 }), // more pixels than the slice
    ]) {
      expect(() => parseCardioSegAnalysis(body)).toThrow();
    }
  });
});

describe('isDicomDocument', () => {
  it('knows a DICOM by its type, its MIME type, or a .dcm without MIME type', () => {
    const doc = (
      documentType: string,
      mimeType: string,
      originalName: string,
    ) => ({
      documentType,
      mimeType,
      originalName,
    });
    expect(isDicomDocument(doc('DICOM', 'application/dicom', 'a.dcm'))).toBe(
      true,
    );
    expect(isDicomDocument(doc('MEDICAL_IMAGE', '', 'SLICE.DCM'))).toBe(true);
    expect(isDicomDocument(doc('MEDICAL_IMAGE', 'image/png', 'a.png'))).toBe(
      false,
    );
    expect(isDicomDocument(doc('MEDICAL_IMAGE', '', 'a.png'))).toBe(false);
  });
});

describe('AiAnalysisRunsService, cardio-seg-mri (POST /patients/:id/ai-analysis-runs)', () => {
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-mri-'));
  const documents = join(uploadRoot, 'patients', 'patient-a', 'documents');
  const pngPath = join(documents, 'slice.png');
  const dcmPath = join(documents, 'slice.dcm');

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
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;
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

  const pngDocument = {
    documentType: 'MEDICAL_IMAGE',
    id: 'document-mri',
    localPath: pngPath,
    mimeType: 'image/png',
    originalName: 'slice.png',
    patientId: 'patient-a',
  };
  const dto = {
    pipeline: 'cardio-seg-mri' as const,
    sourceDocumentId: 'document-mri',
  };

  beforeAll(() => {
    mkdirSync(documents, { recursive: true });
    writeFileSync(pngPath, 'png-bytes');
    writeFileSync(dcmPath, 'dicom-bytes');
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
    documentFindFirst.mockResolvedValue(pngDocument);
    runCreate.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: 'run-mri', maskPath: null }),
    );
    runUpdate.mockImplementation(({ data }) =>
      Promise.resolve({
        ...runCreate.mock.calls[0][0].data,
        id: 'run-mri',
        maskPath: null,
        ...data,
      }),
    );
    log.mockResolvedValue(undefined);
  });

  const lastUpdate = () => runUpdate.mock.lastCall?.[0].data;
  const sentForm = () => fetchMock.mock.lastCall?.[1]?.body as FormData;

  it('stores the class map, the overlay and the slice, and the areas in predictions', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, segBody()));

    const run = await service.create(doctor, 'patient-a', dto);

    expect(fetchMock.mock.lastCall?.[0]).toBe(
      'http://ai.test/analyze/cardio/segmentation-mri',
    );
    expect(sentForm().get('image')).toBeInstanceOf(Blob);
    const data = lastUpdate();
    expect(data).toMatchObject({
      maskAreaPx: 2990,
      segmentationModelId: 'cardio-seg-acdc-unet-effb4',
      segmentationWeightsSha256: SHA_WEIGHTS,
      status: AiAnalysisRunStatus.SUCCEEDED,
    });
    expect(data?.maskAreaRatio).toBeCloseTo(2990 / (216 * 256));
    expect(data?.predictions).toEqual({
      configSha256: SHA_CARD,
      noStructureFound: false,
      pixelSpacingMm: null,
      source: 'image',
      structures: segBody().structures,
    });
    for (const path of ['maskPath', 'overlayPath', 'slicePath']) {
      expect(existsSync(data?.[path] as string)).toBe(true);
    }
    expect(run).toMatchObject({
      hasMask: true,
      hasOverlay: true,
      hasSlice: true,
      modelLabel: null,
      pipeline: 'cardio-seg-mri',
    });
    expect(run).not.toHaveProperty('slicePath');
    // The audit names the chain, never a result.
    expect(JSON.stringify(log.mock.calls)).not.toContain('1611');
  });

  it('sends a .dcm stored without MIME type as application/dicom', async () => {
    documentFindFirst.mockResolvedValue({
      ...pngDocument,
      documentType: 'DICOM',
      localPath: dcmPath,
      mimeType: '',
      originalName: 'slice.dcm',
    });
    fetchMock.mockResolvedValue(
      jsonResponse(
        200,
        segBody({
          pixelSpacingMm: [1.5, 1.5],
          source: 'dicom',
          structures: {
            LV: { areaMm2: 3624.75, pixels: 1611 },
            MYO: { areaMm2: 1982.25, pixels: 881 },
            RV: { areaMm2: 1120.5, pixels: 498 },
          },
        }),
      ),
    );

    await service.create(doctor, 'patient-a', dto);

    expect((sentForm().get('image') as Blob).type).toBe('application/dicom');
    expect(lastUpdate()?.predictions).toMatchObject({
      pixelSpacingMm: [1.5, 1.5],
      source: 'dicom',
    });
  });

  it('accepts PNG, JPEG and DICOM only, and no magnification', async () => {
    for (const document of [
      {
        ...pngDocument,
        documentType: 'ECG_SIGNAL',
        mimeType: 'text/csv',
        originalName: 'ecg.csv',
      },
      {
        ...pngDocument,
        documentType: 'MEDICAL_REPORT',
        mimeType: 'application/pdf',
        originalName: 'cr.pdf',
      },
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
  });

  it('stores a refused slice as REJECTED_INPUT and says why', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { channelSpread: 64.2, code: 'cardio_seg_not_grayscale' },
      }),
    );
    const colour = await errorOf(service.create(doctor, 'patient-a', dto));
    expect(colour).toBeInstanceOf(UnprocessableEntityException);
    expect(colour.getResponse()).toMatchObject({
      code: 'AI_INPUT_REJECTED',
      details: { channelSpread: 64.2 },
      reason: 'CARDIO_SEG_NOT_GRAYSCALE',
      runId: 'run-mri',
    });
    expect(lastUpdate()).toEqual({
      errorCode: 'CARDIO_SEG_NOT_GRAYSCALE',
      status: AiAnalysisRunStatus.REJECTED_INPUT,
    });

    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { code: 'cardio_seg_multiframe', frames: 30 },
      }),
    );
    expect(
      (await errorOf(service.create(doctor, 'patient-a', dto))).getResponse(),
    ).toMatchObject({
      reason: 'CARDIO_SEG_MULTIFRAME',
    });

    fetchMock.mockResolvedValue(
      jsonResponse(422, { detail: { code: 'image_too_small', minSide: 64 } }),
    );
    expect(
      (await errorOf(service.create(doctor, 'patient-a', dto))).getResponse(),
    ).toMatchObject({
      details: { minSide: 64 },
      reason: 'IMAGE_TOO_SMALL',
    });
  });

  it('never stores an incoherent answer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, segBody({ noStructureFound: true })),
    );
    const error = await errorOf(service.create(doctor, 'patient-a', dto));
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_ERROR',
      status: AiAnalysisRunStatus.FAILED,
    });
  });
});

describe('AiAnalysisRunsService, cardio-seg-mri images and decision', () => {
  const findFirst = jest.fn();
  const updateMany = jest.fn<
    Promise<{ count: number }>,
    [
      {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
      },
    ]
  >();
  const getPatientInScope = jest.fn();
  const readStoredFile = jest.fn();
  const log = jest.fn<
    Promise<void>,
    [typeof doctor, string, string, Record<string, unknown>]
  >();
  const service = new AiAnalysisRunsService(
    { aiAnalysisRun: { findFirst, updateMany } } as unknown as PrismaService,
    { getPatientInScope } as unknown as PatientsService,
    { readStoredFile } as unknown as PatientFileStorageService,
    { log } as unknown as PatientAuditService,
    {} as AiServiceClient,
    passThroughEntitlements(),
  );

  const mriRun = (overrides: Record<string, unknown> = {}) => ({
    createdAt: new Date('2026-10-19T10:00:00.000Z'),
    decidedAt: null,
    decidedBy: null,
    decidedById: null,
    decisionLabel: null,
    decisionLabels: null,
    decisionReason: null,
    decisionStatus: null,
    id: 'run-mri',
    maskPath: '/uploads/patients/patient-a/ai-masks/run-mri.png',
    modelDecision: null,
    overlayPath: '/uploads/patients/patient-a/ai-masks/run-mri-overlay.png',
    patientId: 'patient-a',
    pipeline: 'cardio-seg-mri',
    predictions: { noStructureFound: false },
    slicePath: '/uploads/patients/patient-a/ai-masks/run-mri-slice.png',
    status: 'SUCCEEDED',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getPatientInScope.mockResolvedValue({ id: 'patient-a' });
    log.mockResolvedValue(undefined);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue(mriRun());
    readStoredFile.mockResolvedValue(Buffer.from('png'));
  });

  const decide = (body: Record<string, unknown>) =>
    service.decide(
      doctor,
      'patient-a',
      'run-mri',
      plainToInstance(DecideAiAnalysisRunDto, body),
    );

  it('serves the class map, the overlay and the slice of a run in scope only', async () => {
    await expect(
      service.getMask(doctor, 'patient-a', 'run-mri'),
    ).resolves.toMatchObject({ fileName: 'masque-run-mri.png' });
    await expect(
      service.getOverlay(doctor, 'patient-a', 'run-mri'),
    ).resolves.toMatchObject({ fileName: 'superposition-run-mri.png' });
    await expect(
      service.getSlice(doctor, 'patient-a', 'run-mri'),
    ).resolves.toMatchObject({ fileName: 'coupe-run-mri.png' });
    expect(getPatientInScope).toHaveBeenCalledTimes(3);

    // A run of another patient is looked up by (id, patientId): 404.
    findFirst.mockResolvedValue(null);
    await expect(
      service.getSlice(doctor, 'patient-b', 'run-mri'),
    ).rejects.toBeInstanceOf(NotFoundException);
    findFirst.mockResolvedValue(mriRun({ slicePath: null }));
    await expect(
      service.getSlice(doctor, 'patient-a', 'run-mri'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is validated or rejected, never corrected', async () => {
    const corrected = await errorOf(
      decide({
        correctedLabel: 'other',
        reason: 'Contour du VD débordant.',
        status: 'CORRECTED',
      }),
    );
    expect(corrected.getResponse()).toMatchObject({
      code: 'AI_CORRECTION_NOT_APPLICABLE',
    });

    await decide({ status: 'VALIDATED' });
    expect(updateMany.mock.lastCall?.[0].data).toMatchObject({
      decisionLabel: null,
      decisionStatus: 'VALIDATED',
    });
    expect(log.mock.lastCall?.[3]).toMatchObject({
      agreesWithModel: null,
      decisionLabel: null,
    });
  });

  it('takes a reason to reject', async () => {
    const invalid = plainToInstance(DecideAiAnalysisRunDto, {
      status: 'REJECTED',
    });
    expect((await validate(invalid)).map((error) => error.property)).toEqual([
      'reason',
    ]);
    await decide({
      reason: 'Coupe en petit axe trop basale.',
      status: 'REJECTED',
    });
    expect(updateMany.mock.lastCall?.[0].data).toMatchObject({
      decisionStatus: 'REJECTED',
    });
  });
});
