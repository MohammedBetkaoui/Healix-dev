import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiAnalysisRunStatus,
  WorkspaceMembershipRole,
  WorkspaceType,
} from '@prisma/client';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';

// fetch is simulated here only: everything else (scope, consent, storage,
// response validation) is the real code.

const SHA_CLASSIFIER = 'a'.repeat(64);
const SHA_SEGMENTER = 'b'.repeat(64);
// 1×1 one-channel PNG.
const MASK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==';

const predictions = (top: string) =>
  [
    top,
    ...['glioma', 'meningioma', 'notumor', 'pituitary'].filter(
      (label) => label !== top,
    ),
  ].map((label, index) => ({
    label,
    probability: [0.85, 0.08, 0.05, 0.02][index],
  }));

const serviceBody = (
  top: 'glioma' | 'meningioma' | 'notumor' | 'pituitary',
) => ({
  classification: {
    modelId: 'brain-efficientnetb4-tumor-classification',
    weightsSha256: SHA_CLASSIFIER,
    predictions: predictions(top),
  },
  segmentation:
    top === 'meningioma'
      ? {
          modelId: 'brain-unet-meningioma-segmentation',
          weightsSha256: SHA_SEGMENTER,
          maskPng: MASK_PNG_BASE64,
          areaPx: 1200,
          areaRatio: 0.0183,
        }
      : null,
  segmentationSkippedReason:
    top === 'meningioma' ? null : 'not_applicable_for_class',
  imageWidth: 256,
  imageHeight: 256,
  durationMs: 412,
});

// BreakHis answer: the score is the mean of the 4 views.
const breastBody = (score = 0.59, overrides: Record<string, unknown> = {}) => ({
  decision: score >= 0.13 ? 'malignant' : 'benign',
  durationMs: 480,
  magnification: 200,
  malignancyScore: score,
  modelId: 'pathology-breakhis-classification',
  threshold: 0.13,
  views: [score - 0.01, score + 0.01, score - 0.02, score + 0.02],
  weightsSha256: SHA_CLASSIFIER,
  ...overrides,
});

const NUCLEUS_SHARES = {
  connective: 0.2,
  dead: 0,
  epithelial: 0.1,
  inflammatory: 0.2,
  neoplastic: 0.5,
};
const nucleiBody = (overrides: Record<string, unknown> = {}) => ({
  classFractions: { background: 0.9, nucleusTypes: NUCLEUS_SHARES },
  durationMs: 1600,
  imageHeight: 500,
  imageWidth: 600,
  labelMapPng: MASK_PNG_BASE64,
  modelId: 'pathology-unet-pannuke-segmentation',
  overlayPng: MASK_PNG_BASE64,
  tileCount: 9,
  tiled: true,
  weightsSha256: SHA_SEGMENTER,
  ...overrides,
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });

describe('AiAnalysisRunsService (POST /patients/:id/ai-analysis-runs)', () => {
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-runs-'));
  const imagePath = join(
    uploadRoot,
    'patients',
    'patient-a',
    'documents',
    'irm.png',
  );

  const patientFindFirst = jest.fn();
  const consentFindMany = jest.fn();
  const documentFindFirst = jest.fn();
  type RunData = Record<string, unknown>;
  const runCreate = jest.fn<Promise<RunData>, [{ data: RunData }]>();
  const runUpdate = jest.fn<
    Promise<RunData>,
    [{ data: RunData; where: { id: string } }]
  >();
  const runFindFirst = jest.fn();
  const runUpdateMany = jest.fn();
  const log = jest.fn<Promise<void>, [unknown, string, string, unknown?]>();
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const originalFetch = global.fetch;

  const prisma = {
    aiAnalysisRun: {
      create: runCreate,
      findFirst: runFindFirst,
      update: runUpdate,
      updateMany: runUpdateMany,
    },
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
  );
  const makeService = (token = 'service-secret') =>
    new AiAnalysisRunsService(
      prisma,
      patients,
      storage,
      audit,
      new AiServiceClient(
        config({
          AI_SERVICE_TOKEN: token,
          AI_SERVICE_URL: 'http://ai.test:8001/',
        }),
      ),
    );
  const service = makeService();

  const doctor = {
    sub: 'doctor-a',
    email: 'doctor-a@healix.dz',
    role: UserRole.INDEPENDENT_DOCTOR,
    tokenType: 'access' as const,
  };
  const dto = {
    pipeline: 'brain' as const,
    sourceDocumentId: 'document-1',
    clinicianImpression: '  Lésion extra-axiale ?  ',
  };

  beforeAll(() => {
    mkdirSync(join(uploadRoot, 'patients', 'patient-a', 'documents'), {
      recursive: true,
    });
    writeFileSync(imagePath, 'png-bytes');
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
    documentFindFirst.mockResolvedValue({
      id: 'document-1',
      localPath: imagePath,
      mimeType: 'image/png',
      originalName: 'irm.png',
      patientId: 'patient-a',
    });
    runCreate.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: 'run-1', maskPath: null }),
    );
    runUpdate.mockImplementation(({ data }) =>
      Promise.resolve({
        ...runCreate.mock.calls[0][0].data,
        id: 'run-1',
        maskPath: null,
        ...data,
      }),
    );
    log.mockResolvedValue(undefined);
  });

  const auditActions = () => log.mock.calls.map(([, action]) => action);
  const lastUpdate = () => runUpdate.mock.lastCall?.[0].data;
  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as HttpException;
    }
    throw new Error('expected an error');
  };

  it('runs the brain pipeline and stores the meningioma mask', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, serviceBody('meningioma')));

    const run = await service.create(doctor, 'patient-a', dto);

    // The service receives the image only, with the token.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ai.test:8001/analyze/brain');
    expect(init?.headers).toEqual({ 'X-Service-Token': 'service-secret' });
    const image = (init?.body as FormData).get('image') as File;
    expect(await image.text()).toBe('png-bytes');
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    expect(runCreate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        clinicianImpression: 'Lésion extra-axiale ?',
        pipeline: 'brain',
        requestedById: 'doctor-a',
        status: AiAnalysisRunStatus.RUNNING,
      }),
    );
    const maskFile = join(
      uploadRoot,
      'patients',
      'patient-a',
      'ai-masks',
      'run-1.png',
    );
    expect(
      readFileSync(maskFile).equals(Buffer.from(MASK_PNG_BASE64, 'base64')),
    ).toBe(true);
    expect(lastUpdate()).toEqual(
      expect.objectContaining({
        classificationWeightsSha256: SHA_CLASSIFIER,
        maskAreaPx: 1200,
        maskPath: maskFile,
        segmentationModelId: 'brain-unet-meningioma-segmentation',
        segmentationSkippedReason: null,
        status: AiAnalysisRunStatus.SUCCEEDED,
      }),
    );
    expect(auditActions()).toEqual([
      'AI_ANALYSIS_RUN_CREATED',
      'AI_ANALYSIS_RUN_COMPLETED',
    ]);
    // The stored path never reaches the client.
    expect(run).not.toHaveProperty('maskPath');
    expect(run.hasMask).toBe(true);
  });

  it.each(['glioma', 'notumor'] as const)(
    'stores no mask when the top class is %s',
    async (top) => {
      fetchMock.mockResolvedValue(jsonResponse(200, serviceBody(top)));

      const run = await service.create(doctor, 'patient-a', dto);

      expect(lastUpdate()).toEqual(
        expect.objectContaining({
          maskPath: null,
          segmentationModelId: null,
          segmentationSkippedReason: 'not_applicable_for_class',
          status: AiAnalysisRunStatus.SUCCEEDED,
        }),
      );
      expect(run.hasMask).toBe(false);
    },
  );

  it('refuses without a signed DIAGNOSTIC_AI consent, before any run or call', async () => {
    consentFindMany.mockResolvedValue([
      { status: 'NOT_GRANTED', type: 'DIAGNOSTIC_AI' },
    ]);

    await expect(
      service.create(doctor, 'patient-a', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 404 for a document of another patient', async () => {
    documentFindFirst.mockResolvedValue(null);

    await expect(
      service.create(doctor, 'patient-a', {
        ...dto,
        sourceDocumentId: 'document-of-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(documentFindFirst).toHaveBeenCalledWith({
      where: { id: 'document-of-b', patientId: 'patient-a' },
    });
    expect(runCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a document that is not PNG or JPEG (e.g. DICOM) before any run', async () => {
    documentFindFirst.mockResolvedValue({
      id: 'document-1',
      localPath: imagePath,
      mimeType: 'application/dicom',
      originalName: 'serie.dcm',
    });

    await expect(
      service.create(doctor, 'patient-a', dto),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('records REJECTED_INPUT and answers 422 when the service refuses the image', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { code: 'invalid_image', reason: 'undecodable' },
      }),
    );

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_INPUT_REJECTED', runId: 'run-1' }),
    );
    expect(lastUpdate()).toEqual({
      errorCode: 'INVALID_IMAGE',
      status: AiAnalysisRunStatus.REJECTED_INPUT,
    });
    expect(auditActions()).toEqual([
      'AI_ANALYSIS_RUN_CREATED',
      'AI_ANALYSIS_RUN_COMPLETED',
    ]);
  });

  it('records FAILED/SERVICE_TIMEOUT and answers 504 when the service exceeds the delay', async () => {
    fetchMock.mockRejectedValue(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    );

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(GatewayTimeoutException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_SERVICE_TIMEOUT', runId: 'run-1' }),
    );
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_TIMEOUT',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('records FAILED/SERVICE_UNAVAILABLE and answers 503 when the service is down', async () => {
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }),
    );

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        code: 'AI_SERVICE_UNAVAILABLE',
        runId: 'run-1',
      }),
    );
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_UNAVAILABLE',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('records MODEL_NOT_LOADED (503) when the classifier is not loaded in the service', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { detail: { code: 'model_not_loaded' } }),
    );

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error.getStatus()).toBe(503);
    expect(lastUpdate()).toEqual({
      errorCode: 'MODEL_NOT_LOADED',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('never stores a response that breaks the routing (segmentation for a glioma)', async () => {
    const body = serviceBody('glioma');
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ...body,
        segmentation: serviceBody('meningioma').segmentation,
        segmentationSkippedReason: null,
      }),
    );

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(BadGatewayException);
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_ERROR',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('fails without calling the service when no token is configured', async () => {
    const error = await errorOf(
      makeService('').create(doctor, 'patient-a', dto),
    );

    expect(error.getStatus()).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_NOT_CONFIGURED',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('expires a run left RUNNING past the service delay (backend restarted mid-run)', async () => {
    const stale = {
      createdAt: new Date(Date.now() - 125_000),
      id: 'run-stale',
      maskPath: null,
      patientId: 'patient-a',
      status: 'RUNNING',
    };
    runFindFirst.mockResolvedValueOnce(stale).mockResolvedValueOnce({
      ...stale,
      errorCode: 'RUN_INTERRUPTED',
      status: 'FAILED',
    });
    runUpdateMany.mockResolvedValue({ count: 1 });

    const run = await service.findOne(doctor, 'patient-a', 'run-stale');

    expect(runUpdateMany).toHaveBeenCalledWith({
      data: { errorCode: 'RUN_INTERRUPTED', status: 'FAILED' },
      where: { id: 'run-stale', status: 'RUNNING' },
    });
    expect(run).toEqual(
      expect.objectContaining({
        errorCode: 'RUN_INTERRUPTED',
        status: 'FAILED',
      }),
    );
    expect(auditActions()).toEqual(['AI_ANALYSIS_RUN_COMPLETED']);
  });

  it('leaves a recent RUNNING run untouched', async () => {
    runFindFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 30_000),
      id: 'run-live',
      maskPath: null,
      patientId: 'patient-a',
      status: 'RUNNING',
    });

    const run = await service.findOne(doctor, 'patient-a', 'run-live');

    expect(run.status).toBe('RUNNING');
    expect(runUpdateMany).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('answers 404 for a run of another patient', async () => {
    runFindFirst.mockResolvedValue(null);

    await expect(
      service.findOne(doctor, 'patient-a', 'run-of-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-of-b', patientId: 'patient-a' },
      }),
    );
  });

  describe('pathology chains', () => {
    const breastDto = {
      magnification: 200 as const,
      pipeline: 'pathology-breast' as const,
      sourceDocumentId: 'document-1',
    };
    const nucleiDto = {
      magnification: 40 as const,
      pipeline: 'pathology-nuclei' as const,
      sourceDocumentId: 'document-1',
    };
    const masks = join(uploadRoot, 'patients', 'patient-a', 'ai-masks');

    it('runs the breast classification with its magnification, never into predictions', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, breastBody(0.59)));

      const run = await service.create(doctor, 'patient-a', breastDto);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://ai.test:8001/analyze/pathology/breast-classification',
      );
      const form = init?.body as FormData;
      expect(form.get('magnification')).toBe('200');
      expect(await (form.get('image') as File).text()).toBe('png-bytes');

      expect(runCreate.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          magnification: 200,
          pipeline: 'pathology-breast',
        }),
      );
      const stored = lastUpdate();
      expect(stored).toEqual({
        classificationModelId: 'pathology-breakhis-classification',
        classificationWeightsSha256: SHA_CLASSIFIER,
        decisionThreshold: 0.13,
        durationMs: 480,
        magnification: 200,
        malignancyScore: 0.59,
        modelDecision: 'malignant',
        status: AiAnalysisRunStatus.SUCCEEDED,
        // The 4 views as the service sent them.
        ttaScores: [0.59 - 0.01, 0.59 + 0.01, 0.59 - 0.02, 0.59 + 0.02],
      });
      expect(stored).not.toHaveProperty('predictions');
      expect(run).toEqual(
        expect.objectContaining({
          magnification: 200,
          malignancyScore: 0.59,
          modelDecision: 'malignant',
          modelLabel: 'malignant',
          pipeline: 'pathology-breast',
        }),
      );
    });

    it('logs the chain and the magnification, never the score', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, breastBody(0.59)));

      await service.create(doctor, 'patient-a', breastDto);

      const metadata = log.mock.calls.map(([, , , data]) => data);
      expect(metadata).toEqual([
        expect.objectContaining({
          magnification: 200,
          pipeline: 'pathology-breast',
        }),
        expect.objectContaining({
          magnification: 200,
          pipeline: 'pathology-breast',
          status: AiAnalysisRunStatus.SUCCEEDED,
        }),
      ]);
      expect(JSON.stringify(metadata)).not.toMatch(/0\.59|malignant/);
    });

    it('runs the nuclei segmentation and stores the label map and its overlay', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, nucleiBody()));

      const run = await service.create(doctor, 'patient-a', nucleiDto);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://ai.test:8001/analyze/pathology/nuclei-segmentation',
      );
      const png = Buffer.from(MASK_PNG_BASE64, 'base64');
      const maskFile = join(masks, 'run-1.png');
      const overlayFile = join(masks, 'run-1-overlay.png');
      expect(readFileSync(maskFile).equals(png)).toBe(true);
      expect(readFileSync(overlayFile).equals(png)).toBe(true);

      const stored = lastUpdate();
      expect(stored).toEqual(
        expect.objectContaining({
          magnification: 40,
          maskPath: maskFile,
          nucleiFractions: { background: 0.9, nucleusTypes: NUCLEUS_SHARES },
          overlayPath: overlayFile,
          segmentationModelId: 'pathology-unet-pannuke-segmentation',
          segmentationWeightsSha256: SHA_SEGMENTER,
          status: AiAnalysisRunStatus.SUCCEEDED,
          tileCount: 9,
        }),
      );
      // Every nucleus pixel is "segmented": 1 - background of 600 x 500.
      expect(stored?.maskAreaRatio).toBeCloseTo(0.1, 9);
      expect(stored?.maskAreaPx).toBe(30_000);
      expect(stored).not.toHaveProperty('predictions');

      expect(run).not.toHaveProperty('overlayPath');
      expect(run).toEqual(
        expect.objectContaining({
          hasMask: true,
          hasOverlay: true,
          magnification: 40,
          modelLabel: null,
          tileCount: 9,
        }),
      );
    });

    it.each([
      ['brain', { magnification: 40 }, 'AI_MAGNIFICATION_UNEXPECTED'],
      ['pathology-breast', {}, 'AI_MAGNIFICATION_REQUIRED'],
      ['pathology-nuclei', {}, 'AI_MAGNIFICATION_REQUIRED'],
      [
        'pathology-nuclei',
        { magnification: 200 },
        'AI_MAGNIFICATION_NOT_SUPPORTED',
      ],
    ] as const)(
      'refuses %s with %j (%s) before reading anything',
      async (pipeline, extra, code) => {
        const error = await errorOf(
          service.create(doctor, 'patient-a', {
            pipeline,
            sourceDocumentId: 'document-1',
            ...extra,
          }),
        );

        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code }));
        expect(patientFindFirst).not.toHaveBeenCalled();
        expect(runCreate).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['image_too_small', 'IMAGE_TOO_SMALL'],
      ['image_dimensions_too_large', 'IMAGE_DIMENSIONS_TOO_LARGE'],
      ['invalid_image', 'INVALID_IMAGE'],
    ])(
      'records REJECTED_INPUT for a 422 %s of the service',
      async (detail, errorCode) => {
        fetchMock.mockResolvedValue(
          jsonResponse(422, { detail: { code: detail, minSide: 256 } }),
        );

        const error = await errorOf(
          service.create(doctor, 'patient-a', nucleiDto),
        );

        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error.getResponse()).toEqual(
          expect.objectContaining({
            code: 'AI_INPUT_REJECTED',
            reason: errorCode,
          }),
        );
        expect(lastUpdate()).toEqual({
          errorCode,
          status: AiAnalysisRunStatus.REJECTED_INPUT,
        });
      },
    );

    it('treats a refused magnification as a service error (the backend checked it)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(422, { detail: { code: 'invalid_magnification' } }),
      );

      const error = await errorOf(
        service.create(doctor, 'patient-a', breastDto),
      );

      expect(error).toBeInstanceOf(BadGatewayException);
      expect(lastUpdate()).toEqual({
        errorCode: 'SERVICE_ERROR',
        status: AiAnalysisRunStatus.FAILED,
      });
    });

    it('stores nothing from a breast answer with another threshold', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, breastBody(0.59, { threshold: 0.5 })),
      );

      await expect(
        service.create(doctor, 'patient-a', breastDto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(lastUpdate()).toEqual({
        errorCode: 'SERVICE_ERROR',
        status: AiAnalysisRunStatus.FAILED,
      });
    });

    it('fails with MASK_STORAGE_FAILED and keeps no label map when the overlay cannot be stored', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, nucleiBody()));
      runCreate.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'run-2', maskPath: null }),
      );
      const failing = jest
        .spyOn(storage, 'storeAiOverlay')
        .mockRejectedValueOnce(new Error('disk full'));

      const error = await errorOf(
        service.create(doctor, 'patient-a', nucleiDto),
      );

      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'AI_MASK_STORAGE_FAILED' }),
      );
      expect(lastUpdate()).toEqual({
        errorCode: 'MASK_STORAGE_FAILED',
        status: AiAnalysisRunStatus.FAILED,
      });
      expect(existsSync(join(masks, 'run-2.png'))).toBe(false);
      failing.mockRestore();
    });

    it('serves the overlay, and answers 404 for a run without one', async () => {
      const overlayFile = join(masks, 'served-overlay.png');
      mkdirSync(masks, { recursive: true });
      writeFileSync(overlayFile, 'overlay-bytes');
      runFindFirst.mockResolvedValueOnce({
        id: 'run-3',
        overlayPath: overlayFile,
        patientId: 'patient-a',
      });

      const overlay = await service.getOverlay(doctor, 'patient-a', 'run-3');
      expect(overlay.fileName).toBe('superposition-run-3.png');
      expect(overlay.png.toString()).toBe('overlay-bytes');

      runFindFirst.mockResolvedValueOnce({
        id: 'run-4',
        overlayPath: null,
        patientId: 'patient-a',
      });
      await expect(
        service.getOverlay(doctor, 'patient-a', 'run-4'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('AiServiceClient.getStatus (GET /ai-models/status)', () => {
  const originalFetch = global.fetch;
  const client = (token: string) =>
    new AiServiceClient({
      get: (key: string) =>
        ({ AI_SERVICE_TOKEN: token, AI_SERVICE_URL: 'http://ai.test:8001' })[
          key
        ],
    } as unknown as ConfigService);

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('relays the models without the token or the file names', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        models: [
          {
            error: null,
            file: 'fold_5_best.pth',
            loaded: true,
            modelId: 'brain-efficientnetb4-tumor-classification',
            weightsSha256: SHA_CLASSIFIER,
          },
        ],
      }),
    );

    const status = await client('service-secret').getStatus();

    expect(status).toEqual({
      models: [
        {
          error: null,
          loaded: true,
          modelId: 'brain-efficientnetb4-tumor-classification',
          weightsSha256: SHA_CLASSIFIER,
        },
      ],
      service: 'available',
    });
    expect(JSON.stringify(status)).not.toContain('service-secret');
  });

  it('reports an unreachable service, a wrong token and a missing configuration', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(client('service-secret').getStatus()).resolves.toEqual({
      models: [],
      service: 'unavailable',
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { detail: { code: 'invalid_service_token' } }),
      );
    await expect(client('wrong').getStatus()).resolves.toEqual({
      models: [],
      service: 'unauthorized',
    });

    global.fetch = jest.fn();
    await expect(client('').getStatus()).resolves.toEqual({
      models: [],
      service: 'not_configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
