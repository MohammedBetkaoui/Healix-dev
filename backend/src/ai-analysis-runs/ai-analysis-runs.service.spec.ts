import {
  BadGatewayException,
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
