import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
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
import { testStorageService } from '../common/testing/storage-testing';
import { PatientFileValidator } from '../patients/documents/patient-file-validator';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient, ECG_LEADS } from './ai-service.client';
import { CreateAiAnalysisRunDto } from './dto/create-ai-analysis-run.dto';
import { DecideAiAnalysisRunDto } from './dto/decide-ai-analysis-run.dto';
import { passThroughEntitlements } from '../subscriptions/testing/entitlements-stub';

// The cardiology chain end to end on the backend side: fetch is simulated,
// everything else (scope, consent, storage, response validation) is real.

const SHA_WEIGHTS =
  '258e4e4de3c5b876b71bf172d335666ee75b3f5f0cae9806b1a71096e5a7b55a';
const SHA_CARD = 'd'.repeat(64);
const THRESHOLDS = {
  CD: 0.8064,
  HYP: 0.8121,
  MI: 0.5788,
  NORM: 0.6408,
  STTC: 0.5285,
};

const trace = () =>
  Object.fromEntries(
    ECG_LEADS.map((lead, index) => [
      lead,
      Array.from({ length: 1000 }, (_, sample) =>
        Number((Math.sin((sample + index) / 8) * 0.8).toFixed(3)),
      ),
    ]),
  );

// MI and STTC above their threshold, MI first (higher probability).
const ecgBody = (overrides: Record<string, unknown> = {}) => ({
  configSha256: SHA_CARD,
  durationMs: 120,
  durationSeconds: 30,
  inputSamplingRate: 500,
  modelId: 'cardio-ecg-resnet1d-ptbxl-superdiagnostic',
  positive: ['MI', 'STTC'],
  probabilities: { CD: 0.1, HYP: 0.05, MI: 0.83, NORM: 0.04, STTC: 0.61 },
  thresholds: THRESHOLDS,
  trace: trace(),
  traceSamplingRate: 100,
  weightsSha256: SHA_WEIGHTS,
  windows: 5,
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

describe('AiAnalysisRunsService, cardio-ecg (POST /patients/:id/ai-analysis-runs)', () => {
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-ecg-'));
  const documents = join(uploadRoot, 'patients', 'patient-a', 'documents');
  const csvPath = join(documents, 'ecg.csv');
  const zipPath = join(documents, 'ecg.zip');

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
    testStorageService(config({ UPLOAD_ROOT: uploadRoot })),
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

  const csvDocument = {
    documentType: 'ECG_SIGNAL',
    id: 'document-ecg',
    localPath: csvPath,
    mimeType: 'text/csv',
    originalName: 'ecg.csv',
    patientId: 'patient-a',
  };
  const dto = {
    pipeline: 'cardio-ecg' as const,
    samplingRate: 500,
    sourceDocumentId: 'document-ecg',
    unit: 'mV' as const,
  };

  beforeAll(() => {
    mkdirSync(documents, { recursive: true });
    writeFileSync(csvPath, 'I,II\n0.1,0.2\n');
    writeFileSync(zipPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]));
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
    documentFindFirst.mockResolvedValue(csvDocument);
    runCreate.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: 'run-ecg', maskPath: null }),
    );
    runUpdate.mockImplementation(({ data }) =>
      Promise.resolve({
        ...runCreate.mock.calls[0][0].data,
        id: 'run-ecg',
        maskPath: null,
        ...data,
      }),
    );
    log.mockResolvedValue(undefined);
  });

  const lastUpdate = () => runUpdate.mock.lastCall?.[0].data;
  const sentForm = () => fetchMock.mock.lastCall?.[1]?.body as FormData;

  it('sends the signal file with its rate and unit, and stores probabilities, thresholds and the trace', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, ecgBody()));

    const run = await service.create(doctor, 'patient-a', dto);

    expect(fetchMock.mock.lastCall?.[0]).toBe(
      'http://ai.test/analyze/cardio/ecg',
    );
    const form = sentForm();
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(form.get('image')).toBeNull();
    expect(form.get('samplingRate')).toBe('500');
    expect(form.get('unit')).toBe('mV');

    const data = lastUpdate();
    expect(data).toMatchObject({
      classificationModelId: 'cardio-ecg-resnet1d-ptbxl-superdiagnostic',
      classificationWeightsSha256: SHA_WEIGHTS,
      status: AiAnalysisRunStatus.SUCCEEDED,
    });
    // Never the signal in the database: the trace is a file.
    expect(data?.predictions).toEqual({
      configSha256: SHA_CARD,
      durationSeconds: 30,
      inputSamplingRate: 500,
      positive: ['MI', 'STTC'],
      probabilities: ecgBody().probabilities,
      thresholds: THRESHOLDS,
      windows: 5,
    });
    const stored = JSON.parse(
      readFileSync(data?.tracePath as string, 'utf8'),
    ) as {
      samplingRate: number;
      unit: string;
      leads: Record<string, number[]>;
    };
    expect(stored.samplingRate).toBe(100);
    expect(stored.unit).toBe('mV');
    expect(Object.keys(stored.leads)).toEqual([...ECG_LEADS]);

    expect(run).toMatchObject({
      hasTrace: true,
      modelLabel: null,
      modelLabels: ['MI', 'STTC'],
      pipeline: 'cardio-ecg',
    });
    expect(run).not.toHaveProperty('tracePath');
    expect(log.mock.calls[0][3]).toMatchObject({
      pipeline: 'cardio-ecg',
      samplingRate: 500,
      unit: 'mV',
    });
  });

  it('sends no rate nor unit for a zipped WFDB record: its header has them', async () => {
    documentFindFirst.mockResolvedValue({
      ...csvDocument,
      localPath: zipPath,
      mimeType: 'application/zip',
      originalName: 'ecg.zip',
    });
    fetchMock.mockResolvedValue(jsonResponse(200, ecgBody()));

    await service.create(doctor, 'patient-a', {
      pipeline: 'cardio-ecg',
      sourceDocumentId: 'document-ecg',
    });

    expect(sentForm().get('samplingRate')).toBeNull();
    expect(sentForm().get('unit')).toBeNull();
  });

  it('requires the sampling rate of a CSV, before anything is created', async () => {
    const error = await errorOf(
      service.create(doctor, 'patient-a', {
        pipeline: 'cardio-ecg',
        sourceDocumentId: 'document-ecg',
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_SAMPLING_RATE_REQUIRED',
    });
    expect(runCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('analyses ECG_SIGNAL documents only, and never sends a signal to an image chain', async () => {
    documentFindFirst.mockResolvedValue({
      ...csvDocument,
      documentType: 'MEDICAL_IMAGE',
      mimeType: 'image/png',
    });
    const notSignal = await errorOf(service.create(doctor, 'patient-a', dto));
    expect(notSignal).toBeInstanceOf(UnprocessableEntityException);
    expect(notSignal.getResponse()).toMatchObject({
      code: 'AI_UNSUPPORTED_DOCUMENT',
    });

    documentFindFirst.mockResolvedValue(csvDocument);
    const notImage = await errorOf(
      service.create(doctor, 'patient-a', {
        pipeline: 'brain',
        sourceDocumentId: 'document-ecg',
      }),
    );
    expect(notImage.getResponse()).toMatchObject({
      code: 'AI_UNSUPPORTED_DOCUMENT',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a rate, a unit or a magnification on the wrong chain', async () => {
    for (const request of [
      { pipeline: 'brain' as const, samplingRate: 500 },
      {
        pipeline: 'pathology-breast' as const,
        magnification: 200 as const,
        unit: 'uV' as const,
      },
      {
        pipeline: 'cardio-ecg' as const,
        magnification: 40 as const,
        samplingRate: 500,
      },
    ]) {
      const error = await errorOf(
        service.create(doctor, 'patient-a', {
          ...request,
          sourceDocumentId: 'document-ecg',
        }),
      );
      expect(error).toBeInstanceOf(BadRequestException);
    }
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('stores a refused signal as REJECTED_INPUT and says why (422 with the missing leads)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { code: 'ecg_missing_leads', missing: ['V5', 'V6'] },
      }),
    );

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toEqual({
      code: 'AI_INPUT_REJECTED',
      details: { missing: ['V5', 'V6'] },
      message: "Le signal ECG a été refusé par le service d'analyse.",
      reason: 'ECG_MISSING_LEADS',
      runId: 'run-ecg',
    });
    expect(lastUpdate()).toEqual({
      errorCode: 'ECG_MISSING_LEADS',
      status: AiAnalysisRunStatus.REJECTED_INPUT,
    });
  });

  it('maps every ecg_* refusal, and an unknown 422 to a service error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { code: 'ecg_too_short', durationSeconds: 5, minSeconds: 10 },
      }),
    );
    const short = await errorOf(service.create(doctor, 'patient-a', dto));
    expect(short.getResponse()).toMatchObject({
      details: { durationSeconds: 5, minSeconds: 10 },
      reason: 'ECG_TOO_SHORT',
    });

    fetchMock.mockResolvedValue(
      jsonResponse(422, { detail: { code: 'something_else' } }),
    );
    const unknown = await errorOf(service.create(doctor, 'patient-a', dto));
    expect(unknown).toBeInstanceOf(BadGatewayException);
    expect(lastUpdate()).toMatchObject({ status: AiAnalysisRunStatus.FAILED });
  });

  it('never stores an incoherent answer (positive classes that do not match the thresholds)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, ecgBody({ positive: ['MI'] })),
    );

    const error = await errorOf(service.create(doctor, 'patient-a', dto));

    expect(error).toBeInstanceOf(BadGatewayException);
    expect(lastUpdate()).toEqual({
      errorCode: 'SERVICE_ERROR',
      status: AiAnalysisRunStatus.FAILED,
    });
  });

  it('accepts a rate of 100 to 1000 Hz and the units mV and uV only', async () => {
    const errors = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(CreateAiAnalysisRunDto, body))).map(
        (error) => error.property,
      );
    const base = { pipeline: 'cardio-ecg', sourceDocumentId: 'document-ecg' };

    await expect(
      errors({ ...base, samplingRate: 250, unit: 'uV' }),
    ).resolves.toEqual([]);
    await expect(errors({ ...base, samplingRate: 99 })).resolves.toEqual([
      'samplingRate',
    ]);
    await expect(errors({ ...base, samplingRate: 1001 })).resolves.toEqual([
      'samplingRate',
    ]);
    await expect(errors({ ...base, samplingRate: 250.5 })).resolves.toEqual([
      'samplingRate',
    ]);
    await expect(errors({ ...base, unit: 'V' })).resolves.toEqual(['unit']);
  });
});

describe('AiAnalysisRunsService, cardio-ecg trace and decision', () => {
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const getPatientInScope = jest.fn();
  const readStoredFile = jest.fn();
  const log = jest.fn();
  const service = new AiAnalysisRunsService(
    { aiAnalysisRun: { findFirst, updateMany } } as unknown as PrismaService,
    { getPatientInScope } as unknown as PatientsService,
    { readStoredFile } as unknown as PatientFileStorageService,
    { log } as unknown as PatientAuditService,
    {} as AiServiceClient,
    passThroughEntitlements(),
  );

  const ecgRun = (overrides: Record<string, unknown> = {}) => ({
    classificationModelId: 'cardio-ecg-resnet1d-ptbxl-superdiagnostic',
    createdAt: new Date('2026-10-18T10:00:00.000Z'),
    decidedAt: null,
    decidedBy: null,
    decidedById: null,
    decisionLabel: null,
    decisionLabels: null,
    decisionReason: null,
    decisionStatus: null,
    id: 'run-ecg',
    maskPath: null,
    overlayPath: null,
    patientId: 'patient-a',
    pipeline: 'cardio-ecg',
    predictions: {
      configSha256: SHA_CARD,
      durationSeconds: 10,
      inputSamplingRate: 100,
      positive: ['STTC', 'MI'],
      probabilities: { CD: 0.1, HYP: 0.05, MI: 0.6, NORM: 0.04, STTC: 0.7 },
      thresholds: THRESHOLDS,
      windows: 1,
    },
    status: 'SUCCEEDED',
    tracePath: '/uploads/patients/patient-a/ai-masks/run-ecg-ecg-trace.json',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getPatientInScope.mockResolvedValue({ id: 'patient-a' });
    log.mockResolvedValue(undefined);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue(ecgRun());
  });

  const decide = (body: Record<string, unknown>) =>
    service.decide(
      doctor,
      'patient-a',
      'run-ecg',
      plainToInstance(DecideAiAnalysisRunDto, body),
    );
  const lastWrite = () =>
    (updateMany.mock.lastCall as [{ data: Record<string, unknown> }])[0].data;
  const auditMetadata = () =>
    (
      log.mock.lastCall as [unknown, string, string, Record<string, unknown>]
    )[3];

  it('serves the stored trace of a run in scope, 404 without one', async () => {
    readStoredFile.mockResolvedValue(Buffer.from('{"leads":{}}'));

    await expect(
      service.getEcgTrace(doctor, 'patient-a', 'run-ecg'),
    ).resolves.toEqual({
      fileName: 'trace-ecg-run-ecg.json',
      json: Buffer.from('{"leads":{}}'),
    });
    expect(getPatientInScope).toHaveBeenCalledWith(doctor, 'patient-a');

    findFirst.mockResolvedValue(ecgRun({ tracePath: null }));
    await expect(
      service.getEcgTrace(doctor, 'patient-a', 'run-ecg'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates the model classes as they are, in class order', async () => {
    await decide({ status: 'VALIDATED' });

    expect(lastWrite()).toMatchObject({
      decisionLabel: null,
      decisionLabels: ['MI', 'STTC'],
      decisionStatus: 'VALIDATED',
    });
    expect(auditMetadata()).toEqual({
      agreesWithModel: true,
      decisionLabels: ['MI', 'STTC'],
      modelLabels: ['MI', 'STTC'],
      status: 'VALIDATED',
    });
  });

  it('validates an ECG with no class above its threshold: nothing kept', async () => {
    findFirst.mockResolvedValue(
      ecgRun({ predictions: { ...ecgRun().predictions, positive: [] } }),
    );

    await decide({ status: 'VALIDATED' });

    expect(lastWrite()).toMatchObject({ decisionLabels: [] });
  });

  it('corrects to another set of classes', async () => {
    await decide({
      correctedLabels: ['HYP', 'MI'],
      reason: 'Hypertrophie ventriculaire gauche sur les critères de voltage.',
      status: 'CORRECTED',
    });

    expect(lastWrite()).toMatchObject({
      decisionLabel: null,
      decisionLabels: ['MI', 'HYP'],
      decisionStatus: 'CORRECTED',
    });
    expect(auditMetadata()).toMatchObject({
      agreesWithModel: false,
      decisionLabels: ['MI', 'HYP'],
    });
  });

  it('keeps NORM exclusive, requires a different non-empty set, refuses a single label', async () => {
    const reason = 'Relecture du tracé complet.';
    const cases: [Record<string, unknown>, string][] = [
      [
        { correctedLabels: ['NORM', 'MI'], reason, status: 'CORRECTED' },
        'AI_CORRECTED_LABELS_INVALID',
      ],
      [
        { correctedLabels: ['STTC', 'MI'], reason, status: 'CORRECTED' },
        'AI_CORRECTION_MATCHES_MODEL',
      ],
      [
        { correctedLabel: 'glioma', reason, status: 'CORRECTED' },
        'AI_CORRECTED_LABEL_UNEXPECTED',
      ],
      [
        { correctedLabels: ['NORM'], status: 'VALIDATED' },
        'AI_CORRECTED_LABEL_UNEXPECTED',
      ],
    ];
    for (const [body, code] of cases) {
      const error = await errorOf(decide(body));
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({ code });
    }

    // NORM alone is a valid correction.
    await decide({ correctedLabels: ['NORM'], reason, status: 'CORRECTED' });
    expect(lastWrite()).toMatchObject({ decisionLabels: ['NORM'] });
  });

  it('requires correctedLabels for a correction (DTO: none, empty, unknown or repeated classes)', async () => {
    const errors = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(DecideAiAnalysisRunDto, body))).map(
        (error) => error.property,
      );
    const reason = 'Relecture du tracé complet.';

    await expect(
      errors({ correctedLabels: ['MI'], reason, status: 'CORRECTED' }),
    ).resolves.toEqual([]);
    await expect(
      errors({ correctedLabels: [], reason, status: 'CORRECTED' }),
    ).resolves.toEqual(['correctedLabels']);
    await expect(
      errors({ correctedLabels: ['AFIB'], reason, status: 'CORRECTED' }),
    ).resolves.toEqual(['correctedLabels']);
    await expect(
      errors({ correctedLabels: ['MI', 'MI'], reason, status: 'CORRECTED' }),
    ).resolves.toEqual(['correctedLabels']);
    // Neither a label nor labels: the single-label rule applies.
    await expect(errors({ reason, status: 'CORRECTED' })).resolves.toEqual([
      'correctedLabel',
    ]);
  });

  it('refuses correctedLabels on the other chains', async () => {
    findFirst.mockResolvedValue(
      ecgRun({
        classificationModelId: 'brain-efficientnetb4-tumor-classification',
        pipeline: 'brain',
        predictions: [
          { label: 'meningioma', probability: 0.86 },
          { label: 'glioma', probability: 0.14 },
        ],
      }),
    );

    const error = await errorOf(
      decide({
        correctedLabels: ['MI'],
        reason: 'Relecture du tracé complet.',
        status: 'CORRECTED',
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'AI_CORRECTED_LABELS_NOT_APPLICABLE',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is final: a decided ECG answers 409', async () => {
    findFirst.mockResolvedValue(ecgRun({ decisionStatus: 'VALIDATED' }));

    await expect(
      decide({ status: 'REJECTED', reason: 'Tracé bruité.' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
