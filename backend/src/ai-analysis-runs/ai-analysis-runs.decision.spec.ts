import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UserRole } from '../common/enums/user-role.enum';
import { PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';
import { DecideAiAnalysisRunDto } from './dto/decide-ai-analysis-run.dto';

const doctor = {
  sub: 'doctor-a',
  email: 'doctor-a@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  tokenType: 'access' as const,
};

// Stored by the run: meningioma is the model's top class.
const predictions = [
  { label: 'meningioma', probability: 0.86 },
  { label: 'glioma', probability: 0.06 },
  { label: 'pituitary', probability: 0.05 },
  { label: 'notumor', probability: 0.03 },
];

const succeededRun = (overrides: Record<string, unknown> = {}) => ({
  classificationModelId: 'brain-efficientnetb4-tumor-classification',
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  decidedAt: null,
  decidedBy: null,
  decidedById: null,
  decisionLabel: null,
  decisionReason: null,
  decisionStatus: null,
  id: 'run-1',
  maskPath: null,
  patientId: 'patient-a',
  predictions,
  status: 'SUCCEEDED',
  ...overrides,
});

describe('AiAnalysisRunsService.decide (POST .../ai-analysis-runs/:runId/decision)', () => {
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const getPatientInScope = jest.fn();
  const log = jest.fn();
  const service = new AiAnalysisRunsService(
    { aiAnalysisRun: { findFirst, updateMany } } as unknown as PrismaService,
    { getPatientInScope } as unknown as PatientsService,
    {} as PatientFileStorageService,
    { log } as unknown as PatientAuditService,
    {} as AiServiceClient,
  );

  // The run as read again after the decision.
  const decidedRun = (data: Record<string, unknown>) =>
    succeededRun({
      ...data,
      decidedBy: { fullName: 'Dr Amel Benaïssa' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    getPatientInScope.mockResolvedValue({ id: 'patient-a' });
    log.mockResolvedValue(undefined);
    updateMany.mockResolvedValue({ count: 1 });
  });

  const lastWrite = () =>
    (updateMany.mock.lastCall as [{ data: Record<string, unknown> }])[0];
  const auditMetadata = () =>
    (
      log.mock.lastCall as [unknown, string, string, Record<string, unknown>]
    )[3];
  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as HttpException;
    }
    throw new Error('expected an error');
  };

  it('VALIDATED keeps the model top class and audits the agreement', async () => {
    findFirst.mockResolvedValueOnce(succeededRun()).mockResolvedValueOnce(
      decidedRun({
        decisionLabel: 'meningioma',
        decisionStatus: 'VALIDATED',
      }),
    );

    const response = await service.decide(doctor, 'patient-a', 'run-1', {
      status: 'VALIDATED',
    });

    expect(lastWrite()).toEqual({
      data: {
        decidedAt: expect.any(Date) as Date,
        decidedById: 'doctor-a',
        decisionLabel: 'meningioma',
        decisionReason: null,
        decisionStatus: 'VALIDATED',
      },
      // Conditional write: a second submission matches nothing.
      where: { decisionStatus: null, id: 'run-1', status: 'SUCCEEDED' },
    });
    expect(log).toHaveBeenCalledWith(
      doctor,
      'AI_ANALYSIS_RUN_DECIDED',
      'run-1',
      {
        agreesWithModel: true,
        decisionLabel: 'meningioma',
        modelLabel: 'meningioma',
        status: 'VALIDATED',
      },
    );
    expect(response).toEqual(
      expect.objectContaining({
        decidedByName: 'Dr Amel Benaïssa',
        decisionLabel: 'meningioma',
        decisionStatus: 'VALIDATED',
      }),
    );
  });

  it('CORRECTED keeps the physician label and reason, audited without the reason', async () => {
    findFirst
      .mockResolvedValueOnce(succeededRun())
      .mockResolvedValueOnce(
        decidedRun({ decisionLabel: 'glioma', decisionStatus: 'CORRECTED' }),
      );

    await service.decide(doctor, 'patient-a', 'run-1', {
      correctedLabel: 'glioma',
      reason: 'Prise de contraste en anneau, aspect infiltrant.',
      status: 'CORRECTED',
    });

    expect(lastWrite().data).toEqual(
      expect.objectContaining({
        decisionLabel: 'glioma',
        decisionReason: 'Prise de contraste en anneau, aspect infiltrant.',
        decisionStatus: 'CORRECTED',
      }),
    );
    expect(auditMetadata()).toEqual({
      agreesWithModel: false,
      decisionLabel: 'glioma',
      modelLabel: 'meningioma',
      status: 'CORRECTED',
    });
    expect(JSON.stringify(auditMetadata())).not.toContain('anneau');
  });

  it('CORRECTED may name a class the model does not know ("other")', async () => {
    findFirst
      .mockResolvedValueOnce(succeededRun())
      .mockResolvedValueOnce(decidedRun({ decisionStatus: 'CORRECTED' }));

    await service.decide(doctor, 'patient-a', 'run-1', {
      correctedLabel: 'other',
      reason: 'Métastase, hors des classes du modèle.',
      status: 'CORRECTED',
    });

    expect(lastWrite().data.decisionLabel).toBe('other');
  });

  it('REJECTED keeps no label and records the reason', async () => {
    findFirst
      .mockResolvedValueOnce(succeededRun())
      .mockResolvedValueOnce(decidedRun({ decisionStatus: 'REJECTED' }));

    await service.decide(doctor, 'patient-a', 'run-1', {
      reason: 'Coupe floue, artefacts de mouvement.',
      status: 'REJECTED',
    });

    expect(lastWrite().data).toEqual(
      expect.objectContaining({
        decisionLabel: null,
        decisionReason: 'Coupe floue, artefacts de mouvement.',
        decisionStatus: 'REJECTED',
      }),
    );
    expect(auditMetadata()).toEqual(
      expect.objectContaining({ agreesWithModel: null, status: 'REJECTED' }),
    );
  });

  it('refuses a correction equal to the model top class (400)', async () => {
    findFirst.mockResolvedValueOnce(succeededRun());

    const error = await errorOf(
      service.decide(doctor, 'patient-a', 'run-1', {
        correctedLabel: 'meningioma',
        reason: 'Même classe que le modèle.',
        status: 'CORRECTED',
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_CORRECTION_MATCHES_MODEL' }),
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses a corrected label outside a correction (400)', async () => {
    findFirst.mockResolvedValueOnce(succeededRun());

    const error = await errorOf(
      service.decide(doctor, 'patient-a', 'run-1', {
        correctedLabel: 'glioma',
        status: 'VALIDATED',
      }),
    );

    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_CORRECTED_LABEL_UNEXPECTED' }),
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses a second decision: a decision is final (409)', async () => {
    findFirst.mockResolvedValueOnce(
      succeededRun({
        decisionLabel: 'meningioma',
        decisionStatus: 'VALIDATED',
      }),
    );

    const error = await errorOf(
      service.decide(doctor, 'patient-a', 'run-1', {
        reason: 'Finalement non.',
        status: 'REJECTED',
      }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_RUN_ALREADY_DECIDED' }),
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('lets only one of two concurrent submissions through (409 for the other)', async () => {
    findFirst.mockResolvedValueOnce(succeededRun());
    // The other submission wrote first: the conditional update matches nothing.
    updateMany.mockResolvedValue({ count: 0 });

    const error = await errorOf(
      service.decide(doctor, 'patient-a', 'run-1', { status: 'VALIDATED' }),
    );

    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_RUN_ALREADY_DECIDED' }),
    );
    expect(log).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'REJECTED_INPUT', 'RUNNING'])(
    'refuses a %s run (409 AI_RUN_NOT_DECIDABLE)',
    async (status) => {
      // With predictions: the status alone must refuse the decision.
      findFirst.mockResolvedValueOnce(succeededRun({ status }));

      const error = await errorOf(
        service.decide(doctor, 'patient-a', 'run-1', { status: 'VALIDATED' }),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'AI_RUN_NOT_DECIDABLE' }),
      );
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for a run of another patient', async () => {
    findFirst.mockResolvedValueOnce(null);

    await expect(
      service.decide(doctor, 'patient-a', 'run-of-b', { status: 'VALIDATED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-of-b', patientId: 'patient-a' },
      }),
    );
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('DecideAiAnalysisRunDto', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(DecideAiAnalysisRunDto, body))).map(
      (error) => error.property,
    );

  it('accepts a validation without reason', async () => {
    expect(await errorsFor({ status: 'VALIDATED' })).toEqual([]);
  });

  it.each(['CORRECTED', 'REJECTED'])(
    'requires a reason for %s',
    async (status) => {
      expect(await errorsFor({ correctedLabel: 'glioma', status })).toContain(
        'reason',
      );
    },
  );

  it('requires 5 to 500 characters of reason, as stored (whitespace collapsed)', async () => {
    expect(await errorsFor({ reason: '  ok  ', status: 'REJECTED' })).toEqual([
      'reason',
    ]);
    // 7 characters typed, "a b c" (5) once collapsed: still accepted.
    expect(
      await errorsFor({ reason: 'a  b\n\nc', status: 'REJECTED' }),
    ).toEqual([]);
    // 7 characters typed, "a b" (3) once collapsed: refused.
    expect(
      await errorsFor({ reason: 'a \n\n\n b', status: 'REJECTED' }),
    ).toEqual(['reason']);
    expect(
      await errorsFor({ reason: 'x'.repeat(501), status: 'REJECTED' }),
    ).toEqual(['reason']);
    expect(
      await errorsFor({ reason: 'Image floue.', status: 'REJECTED' }),
    ).toEqual([]);
  });

  it('requires a known corrected label for CORRECTED', async () => {
    const reason = 'Aspect de gliome.';
    expect(await errorsFor({ reason, status: 'CORRECTED' })).toEqual([
      'correctedLabel',
    ]);
    expect(
      await errorsFor({ correctedLabel: 'tumor', reason, status: 'CORRECTED' }),
    ).toEqual(['correctedLabel']);
    expect(
      await errorsFor({ correctedLabel: 'other', reason, status: 'CORRECTED' }),
    ).toEqual([]);
  });

  it('refuses an unknown status', async () => {
    expect(await errorsFor({ status: 'APPROVED' })).toContain('status');
  });
});
