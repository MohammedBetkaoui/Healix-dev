import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';

import { type AiAnalysisRunsService } from '../ai-analysis-runs/ai-analysis-runs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { type PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { type PatientAuditService } from '../patients/patient-audit.service';
import { type PatientsService } from '../patients/patients.service';
import { type PrismaService } from '../prisma/prisma.service';
import {
  type Entitlements,
  type EntitlementUsage,
} from '../subscriptions/entitlements';
import { type EntitlementsService } from '../subscriptions/entitlements.service';
import { type PlanQuotas } from '../subscriptions/plans/plan-quotas';
import { DicomAnalysisService } from './dicom-analysis.service';
import { type DicomStudiesService } from './dicom-studies.service';
import {
  OrthancError,
  type OrthancClient,
  type OrthancInstance,
} from './orthanc.client';

const user: AuthenticatedUserPayload = {
  email: 'dr@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'user-1',
  tokenType: 'access',
};

const INSTANCE_ID = 'dddddddd-dddddddd-dddddddd-dddddddd-dddddddd';
const SERIES_ID = 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb';

const study = {
  id: 'study-1',
  orthancStudyId: 'aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa',
  patientId: 'patient-1',
  workspaceId: 'workspace-1',
};

const instance = (
  overrides: Partial<OrthancInstance> = {},
): OrthancInstance => ({
  fileSize: 100,
  id: INSTANCE_ID,
  imageOrientationPatient: null,
  imagePositionPatient: null,
  instanceNumber: 12,
  numberOfFrames: 1,
  parentSeries: SERIES_ID,
  parentStudy: study.orthancStudyId,
  sopInstanceUid: '1.2.3.4.5',
  ...overrides,
});

const everyPipeline: PlanQuotas = {
  aiAnalysesPerMonth: 10,
  aiPipelines: null,
  maxDoctors: null,
  maxPatients: null,
};

const entitlementsOf = (
  quotas: Partial<PlanQuotas> = {},
  usage: Partial<EntitlementUsage> = {},
  readOnly = false,
): Entitlements => ({
  daysLeft: 20,
  expiresAt: null,
  plan: null,
  quotas: { ...everyPipeline, ...quotas },
  readOnly,
  status: readOnly ? 'EXPIRED' : 'ACTIVE',
  trial: false,
  usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 1, ...usage },
});

describe('DicomAnalysisService', () => {
  const prisma = {
    aiAnalysisRun: { count: jest.fn() },
    patientDocument: { create: jest.fn(), delete: jest.fn() },
  };
  const orthanc = {
    getInstanceFile: jest.fn(),
    getInstanceRendered: jest.fn(),
    getStudySeries: jest.fn(),
  };
  const studies = { getInstanceInScope: jest.fn() };
  const patients = {
    assertDiagnosticAiConsentSigned: jest.fn(),
    getPatientInScope: jest.fn(),
  };
  const entitlements = { getEntitlements: jest.fn() };
  const files = { deleteLocalFile: jest.fn(), storePatientDocument: jest.fn() };
  const audit = { log: jest.fn() };
  const runs = { create: jest.fn() };
  const service = new DicomAnalysisService(
    prisma as unknown as PrismaService,
    orthanc as unknown as OrthancClient,
    studies as unknown as DicomStudiesService,
    patients as unknown as PatientsService,
    entitlements as unknown as EntitlementsService,
    files as unknown as PatientFileStorageService,
    audit as unknown as PatientAuditService,
    runs as unknown as AiAnalysisRunsService,
  );

  // The data of the first document row written.
  const createdDocument = () =>
    (
      prisma.patientDocument.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ]
    )[0].data;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    studies.getInstanceInScope.mockResolvedValue({
      instance: instance(),
      study,
    });
    orthanc.getStudySeries.mockResolvedValue([
      { id: 'other', modality: 'CT', number: 9, seriesInstanceUid: '9.9' },
      {
        id: SERIES_ID,
        modality: 'MR',
        number: 3,
        seriesInstanceUid: '1.2.3.100',
      },
    ]);
    orthanc.getInstanceFile.mockResolvedValue(Buffer.from('DICOM-BYTES'));
    orthanc.getInstanceRendered.mockResolvedValue(Buffer.from('PNG-BYTES'));
    patients.getPatientInScope.mockResolvedValue({ id: 'patient-1' });
    patients.assertDiagnosticAiConsentSigned.mockResolvedValue(undefined);
    entitlements.getEntitlements.mockResolvedValue(entitlementsOf());
    files.storePatientDocument.mockImplementation(
      ({ file }: { file: { originalname: string } }) =>
        Promise.resolve({
          checksum: 'c'.repeat(64),
          localPath: '/uploads/patients/patient-1/documents/slice',
          originalName: file.originalname,
          storedName: 'slice',
        }),
    );
    prisma.patientDocument.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ id: 'document-1', localPath: '/uploads/x', ...data }),
    );
    audit.log.mockResolvedValue(undefined);
    runs.create.mockResolvedValue({ id: 'run-1', status: 'SUCCEEDED' });
  });

  describe('the cardiac MRI chain', () => {
    it('is given the DICOM file of the slice, stored as a DICOM document', async () => {
      const run = await service.analyze(user, INSTANCE_ID, 'cardio-seg-mri');

      expect(run).toEqual({ id: 'run-1', status: 'SUCCEEDED' });
      expect(orthanc.getInstanceFile).toHaveBeenCalledWith(INSTANCE_ID);
      expect(orthanc.getInstanceRendered).not.toHaveBeenCalled();
      expect(files.storePatientDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: 'DICOM',
          extension: '.dcm',
          patientId: 'patient-1',
        }),
      );
      const [stored] = files.storePatientDocument.mock.calls[0] as [
        { file: { buffer: Buffer; mimetype: string; originalname: string } },
      ];
      expect(stored.file.buffer).toEqual(Buffer.from('DICOM-BYTES'));
      expect(stored.file.mimetype).toBe('application/dicom');
      expect(stored.file.originalname).toBe('serie-3-coupe-12.dcm');
    });
  });

  describe('the brain chain', () => {
    it("is given Orthanc's PNG rendering of the slice, stored as an image document", async () => {
      await service.analyze(user, INSTANCE_ID, 'brain');

      expect(orthanc.getInstanceRendered).toHaveBeenCalledWith(INSTANCE_ID);
      expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
      expect(files.storePatientDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: 'MEDICAL_IMAGE',
          extension: '.png',
        }),
      );
      expect(createdDocument()).toMatchObject({
        mimeType: 'image/png',
        originalName: 'serie-3-coupe-12.png',
        size: Buffer.byteLength('PNG-BYTES'),
      });
    });
  });

  it('saves where the document comes from: study, series, instance and their numbers', async () => {
    await service.analyze(user, INSTANCE_ID, 'cardio-seg-mri');

    expect(createdDocument()).toEqual({
      checksum: 'c'.repeat(64),
      dicomStudyId: 'study-1',
      documentType: 'DICOM',
      instanceNumber: 12,
      localPath: '/uploads/patients/patient-1/documents/slice',
      mimeType: 'application/dicom',
      originalName: 'serie-3-coupe-12.dcm',
      patientId: 'patient-1',
      seriesInstanceUid: '1.2.3.100',
      seriesNumber: 3,
      size: Buffer.byteLength('DICOM-BYTES'),
      sopInstanceUid: '1.2.3.4.5',
      storedName: 'slice',
      uploadedById: 'user-1',
    });
    expect(audit.log).toHaveBeenCalledWith(
      user,
      'PATIENT_DOCUMENT_UPLOADED',
      'document-1',
      {
        dicomStudyId: 'study-1',
        documentType: 'DICOM',
        source: 'DICOM_STUDY',
      },
    );
  });

  it('goes through the creation flow of a run, with the document it made, and nothing else of it', async () => {
    await service.analyze(user, INSTANCE_ID, 'brain');

    expect(runs.create).toHaveBeenCalledTimes(1);
    expect(runs.create).toHaveBeenCalledWith(user, 'patient-1', {
      pipeline: 'brain',
      sourceDocumentId: 'document-1',
    });
  });

  describe('what it refuses', () => {
    it.each(['pathology-breast', 'pathology-nuclei', 'cardio-ecg'] as const)(
      'a chain that reads no slice (%s): 422 DICOM_PIPELINE_NOT_SUPPORTED, before anything is read',
      async (pipeline) => {
        await expect(
          service.analyze(user, INSTANCE_ID, pipeline),
        ).rejects.toMatchObject({
          response: {
            code: 'DICOM_PIPELINE_NOT_SUPPORTED',
            reason: 'PIPELINE',
          },
          status: 422,
        });
        expect(studies.getInstanceInScope).not.toHaveBeenCalled();
        expect(files.storePatientDocument).not.toHaveBeenCalled();
        expect(runs.create).not.toHaveBeenCalled();
      },
    );

    it.each(['brain', 'cardio-seg-mri'] as const)(
      'a slice that is not an MRI (%s on a CT): 422 DICOM_PIPELINE_NOT_SUPPORTED',
      async (pipeline) => {
        orthanc.getStudySeries.mockResolvedValue([
          {
            id: SERIES_ID,
            modality: 'CT',
            number: 3,
            seriesInstanceUid: '1.2.3.100',
          },
        ]);

        await expect(
          service.analyze(user, INSTANCE_ID, pipeline),
        ).rejects.toMatchObject({
          response: {
            code: 'DICOM_PIPELINE_NOT_SUPPORTED',
            modality: 'CT',
            reason: 'MODALITY',
          },
          status: 422,
        });
        expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
        expect(orthanc.getInstanceRendered).not.toHaveBeenCalled();
        expect(runs.create).not.toHaveBeenCalled();
      },
    );

    it('a series with no modality is not an MRI either', async () => {
      orthanc.getStudySeries.mockResolvedValue([
        {
          id: SERIES_ID,
          modality: null,
          number: 3,
          seriesInstanceUid: '1.2.3.100',
        },
      ]);

      await expect(
        service.analyze(user, INSTANCE_ID, 'brain'),
      ).rejects.toMatchObject({
        response: { code: 'DICOM_PIPELINE_NOT_SUPPORTED', reason: 'MODALITY' },
      });
    });

    it.each(['brain', 'cardio-seg-mri'] as const)(
      'a multi-frame instance (%s): 422 DICOM_MULTIFRAME_NOT_SUPPORTED, nothing read nor stored',
      async (pipeline) => {
        studies.getInstanceInScope.mockResolvedValue({
          instance: instance({ numberOfFrames: 25 }),
          study,
        });

        await expect(
          service.analyze(user, INSTANCE_ID, pipeline),
        ).rejects.toMatchObject({
          response: { code: 'DICOM_MULTIFRAME_NOT_SUPPORTED', frames: 25 },
          status: 422,
        });
        expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
        expect(files.storePatientDocument).not.toHaveBeenCalled();
        expect(runs.create).not.toHaveBeenCalled();
      },
    );

    it('a slice of a study of another workspace: 404, nothing read', async () => {
      studies.getInstanceInScope.mockRejectedValue(new NotFoundException());

      await expect(
        service.analyze(user, INSTANCE_ID, 'brain'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orthanc.getStudySeries).not.toHaveBeenCalled();
      expect(files.storePatientDocument).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
    });

    it('a patient without the DIAGNOSTIC_AI consent: nothing is stored', async () => {
      patients.assertDiagnosticAiConsentSigned.mockRejectedValue(
        new ForbiddenException('Consentement DIAGNOSTIC_AI requis'),
      );

      await expect(
        service.analyze(user, INSTANCE_ID, 'brain'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(orthanc.getInstanceRendered).not.toHaveBeenCalled();
      expect(files.storePatientDocument).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
    });

    it('a quota that is used up: 403 QUOTA_EXCEEDED, nothing is stored', async () => {
      entitlements.getEntitlements.mockResolvedValue(
        entitlementsOf({ aiAnalysesPerMonth: 10 }, { aiAnalysesThisMonth: 10 }),
      );

      await expect(
        service.analyze(user, INSTANCE_ID, 'brain'),
      ).rejects.toMatchObject({
        response: { code: 'QUOTA_EXCEEDED', limit: 10, used: 10 },
        status: 403,
      });
      expect(entitlements.getEntitlements).toHaveBeenCalledWith('workspace-1');
      expect(files.storePatientDocument).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
    });

    it('a chain outside the plan: 403 AI_PIPELINE_NOT_IN_PLAN, nothing is stored', async () => {
      entitlements.getEntitlements.mockResolvedValue(
        entitlementsOf({ aiPipelines: ['brain'] }),
      );

      await expect(
        service.analyze(user, INSTANCE_ID, 'cardio-seg-mri'),
      ).rejects.toMatchObject({
        response: {
          code: 'AI_PIPELINE_NOT_IN_PLAN',
          pipeline: 'cardio-seg-mri',
        },
        status: 403,
      });
      expect(files.storePatientDocument).not.toHaveBeenCalled();
    });

    it('a subscription that is not live: 403 SUBSCRIPTION_INACTIVE, nothing is stored', async () => {
      entitlements.getEntitlements.mockResolvedValue(
        entitlementsOf({}, {}, true),
      );

      await expect(
        service.analyze(user, INSTANCE_ID, 'brain'),
      ).rejects.toMatchObject({
        response: { code: 'SUBSCRIPTION_INACTIVE' },
        status: 403,
      });
      expect(files.storePatientDocument).not.toHaveBeenCalled();
    });

    it('answers 502 when Orthanc cannot give the slice, and stores nothing', async () => {
      orthanc.getInstanceRendered.mockRejectedValue(
        new OrthancError('UNAVAILABLE', 'down'),
      );

      await expect(
        service.analyze(user, INSTANCE_ID, 'brain'),
      ).rejects.toMatchObject({
        response: { code: 'DICOM_STORE_UNAVAILABLE' },
        status: 502,
      });
      expect(files.storePatientDocument).not.toHaveBeenCalled();
    });
  });

  describe('when the run is refused after the document exists', () => {
    it('removes the document, and its file, if no run was made (quota used up in a race)', async () => {
      runs.create.mockRejectedValue(
        new ForbiddenException({ code: 'QUOTA_EXCEEDED' }),
      );
      prisma.aiAnalysisRun.count.mockResolvedValue(0);

      await expect(
        service.analyze(user, INSTANCE_ID, 'brain'),
      ).rejects.toMatchObject({
        status: 403,
      });

      expect(prisma.aiAnalysisRun.count).toHaveBeenCalledWith({
        where: { sourceDocumentId: 'document-1' },
      });
      expect(prisma.patientDocument.delete).toHaveBeenCalledWith({
        where: { id: 'document-1' },
      });
      expect(files.deleteLocalFile).toHaveBeenCalledWith(
        '/uploads/patients/patient-1/documents/slice',
      );
    });

    it('keeps the document when a run refers to it (the analysis ran and failed)', async () => {
      runs.create.mockRejectedValue(new Error('AI service down'));
      prisma.aiAnalysisRun.count.mockResolvedValue(1);

      await expect(service.analyze(user, INSTANCE_ID, 'brain')).rejects.toThrow(
        'AI service down',
      );

      expect(prisma.patientDocument.delete).not.toHaveBeenCalled();
      expect(files.deleteLocalFile).not.toHaveBeenCalled();
    });

    it('removes the file when the document row cannot be written', async () => {
      prisma.patientDocument.create.mockRejectedValue(
        new Error('database down'),
      );

      await expect(service.analyze(user, INSTANCE_ID, 'brain')).rejects.toThrow(
        'database down',
      );

      expect(files.deleteLocalFile).toHaveBeenCalledWith(
        '/uploads/patients/patient-1/documents/slice',
      );
      expect(runs.create).not.toHaveBeenCalled();
    });
  });
});
