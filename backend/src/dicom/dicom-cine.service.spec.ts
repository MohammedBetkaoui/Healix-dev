import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { DicomZip } from './dicom-zip';
import { type DicomStudiesService } from './dicom-studies.service';
import {
  OrthancError,
  type OrthancClient,
  type OrthancInstance,
  type OrthancSeries,
} from './orthanc.client';

const user: AuthenticatedUserPayload = {
  email: 'dr@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'user-1',
  tokenType: 'access',
};

const STUDY_ID = 'aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa';
const CINE_ID = 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb';
const LOCALIZER_ID = 'cccccccc-cccccccc-cccccccc-cccccccc-cccccccc';
const OTHER_ID = 'dddddddd-dddddddd-dddddddd-dddddddd-dddddddd';

const study = {
  id: 'study-1',
  orthancStudyId: STUDY_ID,
  patientId: 'patient-1',
  workspaceId: 'workspace-1',
};

const SLICES = 8;
const PHASES = 5;

// A cine: for each of the 8 slice positions, 5 phases.
function cineInstances(
  seriesId: string,
  options: { frames?: number; slices?: number } = {},
): OrthancInstance[] {
  const slices = options.slices ?? SLICES;
  const instances: OrthancInstance[] = [];
  for (let phase = 0; phase < PHASES; phase += 1) {
    for (let slice = 0; slice < slices; slice += 1) {
      instances.push({
        fileSize: 1000,
        id: `${seriesId}/p${phase}s${slice}`,
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        imagePositionPatient: [0, 0, slice * 8],
        instanceNumber: phase * slices + slice + 1,
        numberOfFrames: options.frames ?? 1,
        parentSeries: seriesId,
        parentStudy: STUDY_ID,
        sopInstanceUid: `1.2.${phase}.${slice}`,
      });
    }
  }
  return instances;
}

const series: OrthancSeries[] = [
  {
    description: 'SA cine',
    id: CINE_ID,
    instanceIds: [],
    modality: 'MR',
    number: 5,
    seriesInstanceUid: '1.2.3.5',
  },
  {
    description: 'localizer',
    id: LOCALIZER_ID,
    instanceIds: [],
    modality: 'MR',
    number: 1,
    seriesInstanceUid: '1.2.3.1',
  },
];

const entitlementsOf = (
  quotas: Partial<PlanQuotas> = {},
  usage: Partial<EntitlementUsage> = {},
): Entitlements => ({
  daysLeft: 20,
  expiresAt: null,
  plan: null,
  quotas: {
    aiAnalysesPerMonth: 10,
    aiPipelines: null,
    maxDoctors: null,
    maxPatients: null,
    ...quotas,
  },
  readOnly: false,
  status: 'ACTIVE',
  trial: false,
  usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 1, ...usage },
});

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
};

describe('DicomAnalysisService, cine stacks', () => {
  // The key the modern storage hands back for the document of the suite.
  const STORAGE_KEY = 'hx/medical/ab/' + 'b'.repeat(32) + '.bin';

  const prisma = {
    aiAnalysisRun: { count: jest.fn() },
    patientDocument: { create: jest.fn(), delete: jest.fn() },
  };
  const orthanc = {
    getInstanceFile: jest.fn(),
    getStudyInstances: jest.fn(),
    getStudySeries: jest.fn(),
  };
  const studies = { getStudyInScope: jest.fn() };
  const patients = {
    assertDiagnosticAiConsentSigned: jest.fn(),
    getPatientInScope: jest.fn(),
  };
  const entitlements = { getEntitlements: jest.fn() };
  const files = { deleteFile: jest.fn(), storePatientDocument: jest.fn() };
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

  let instances: OrthancInstance[];
  let stored: Buffer | null;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    instances = [
      ...cineInstances(CINE_ID),
      {
        ...cineInstances(LOCALIZER_ID, { slices: 1 })[0],
        id: 'localizer-1',
      },
    ];
    stored = null;
    studies.getStudyInScope.mockResolvedValue(study);
    orthanc.getStudySeries.mockResolvedValue(series);
    orthanc.getStudyInstances.mockImplementation(() =>
      Promise.resolve(instances),
    );
    orthanc.getInstanceFile.mockImplementation((id: string) =>
      Promise.resolve(Buffer.from(`DICOM:${id}`)),
    );
    patients.getPatientInScope.mockResolvedValue({ id: 'patient-1' });
    patients.assertDiagnosticAiConsentSigned.mockResolvedValue(undefined);
    entitlements.getEntitlements.mockResolvedValue(entitlementsOf());
    files.storePatientDocument.mockImplementation(
      ({ file }: { file: { buffer: Buffer; originalname: string } }) => {
        stored = file.buffer;
        return Promise.resolve({
          checksum: 'c'.repeat(64),
          // What the modern storage answers: an opaque key and the version of
          // the format the file was written with.
          storageKey: STORAGE_KEY,
          encryptionVersion: 1,
          originalName: file.originalname,
          storedName: 'cine',
        });
      },
    );
    prisma.patientDocument.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ id: 'document-1', ...data }),
    );
    audit.log.mockResolvedValue(undefined);
    runs.create.mockResolvedValue({ id: 'run-1', status: 'SUCCEEDED' });
  });

  describe('the cine stacks of a study', () => {
    it('lists the series that hold a cine, without the identifiers of their images', async () => {
      const list = await service.listCineStacks(user, 'study-1');

      expect(list).toEqual([
        {
          bytes: SLICES * PHASES * 1000,
          description: 'SA cine',
          instances: SLICES * PHASES,
          number: 5,
          phases: PHASES,
          refusal: null,
          seriesId: CINE_ID,
          seriesInstanceUid: '1.2.3.5',
          shortAxisLikely: true,
          slices: SLICES,
        },
      ]);
      expect(studies.getStudyInScope).toHaveBeenCalledWith(user, 'study-1');
    });

    it('shows a series the analysis cannot read, with the reason', async () => {
      instances = cineInstances(CINE_ID, { slices: 5 });
      const [stack] = await service.listCineStacks(user, 'study-1');
      expect(stack).toMatchObject({ refusal: 'TOO_FEW_SLICES', slices: 5 });
    });

    it('answers 404 for a study of another workspace', async () => {
      studies.getStudyInScope.mockRejectedValue(new NotFoundException());
      await expect(
        service.listCineStacks(user, 'study-of-someone-else'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orthanc.getStudyInstances).not.toHaveBeenCalled();
    });

    it('answers 502 when the store does not answer', async () => {
      orthanc.getStudyInstances.mockRejectedValue(
        new OrthancError('UNAVAILABLE', 'down'),
      );
      expect(
        await errorOf(service.listCineStacks(user, 'study-1')),
      ).toBeInstanceOf(BadGatewayException);
    });
  });

  describe('"Mesurer le cœur"', () => {
    it('makes a ZIP of the series images in the order of the stack, stores it, and runs the chain on it', async () => {
      const run = await service.analyzeCineStack(user, 'study-1', CINE_ID);

      expect(run).toEqual({ id: 'run-1', status: 'SUCCEEDED' });
      expect(orthanc.getInstanceFile).toHaveBeenCalledTimes(SLICES * PHASES);

      // A document of the record: a DICOM ZIP, naming the series.
      expect(files.storePatientDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: 'DICOM',
          extension: '.zip',
          patientId: 'patient-1',
        }),
      );
      expect(prisma.patientDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dicomSeries: {
            description: 'SA cine',
            instances: SLICES * PHASES,
            phases: PHASES,
            seriesInstanceUid: '1.2.3.5',
            seriesNumber: 5,
            slices: SLICES,
          },
          dicomStudyId: 'study-1',
          documentType: 'DICOM',
          mimeType: 'application/zip',
          originalName: 'serie-5-cine.zip',
          patientId: 'patient-1',
          seriesInstanceUid: '1.2.3.5',
          seriesNumber: 5,
        }) as object,
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

      // The same flow as any run.
      expect(runs.create).toHaveBeenCalledWith(user, 'patient-1', {
        pipeline: 'cardio-volume-mri',
        sourceDocumentId: 'document-1',
      });
    });

    it('writes a ZIP the service can read: every image, by position then phase', async () => {
      await service.analyzeCineStack(user, 'study-1', CINE_ID);

      const directory = mkdtempSync(join(tmpdir(), 'healix-cine-'));
      try {
        const path = join(directory, 'cine.zip');
        writeFileSync(path, stored as Buffer);
        const archive = await DicomZip.open(path);
        const contents: string[] = [];
        for (const member of archive.members) {
          contents.push((await archive.read(member))?.toString() ?? '');
        }
        archive.close();

        expect(contents).toHaveLength(SLICES * PHASES);
        // The first position holds the 5 phases of its image, then the next position.
        expect(contents.slice(0, 3)).toEqual([
          `DICOM:${CINE_ID}/p0s0`,
          `DICOM:${CINE_ID}/p1s0`,
          `DICOM:${CINE_ID}/p2s0`,
        ]);
        expect(contents[PHASES]).toBe(`DICOM:${CINE_ID}/p0s1`);
        expect(archive.members[0].name).toBe('0001.dcm');
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    });

    it('downloads a few images at a time, not all at once', async () => {
      let running = 0;
      let peak = 0;
      orthanc.getInstanceFile.mockImplementation(async (id: string) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running -= 1;
        return Buffer.from(`DICOM:${id}`);
      });

      await service.analyzeCineStack(user, 'study-1', CINE_ID);

      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(6);
    });

    it('answers 404 for a series that is not in the study, or not an identifier', async () => {
      for (const seriesId of [OTHER_ID, LOCALIZER_ID, 'not-an-id', '../x']) {
        const error = await errorOf(
          service.analyzeCineStack(user, 'study-1', seriesId),
        );
        expect(error).toBeInstanceOf(NotFoundException);
      }
      expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
    });

    it('does not ask the store about an identifier that cannot be one of its own', async () => {
      for (const seriesId of ['not-an-id', '../x', '']) {
        expect(
          await errorOf(service.analyzeCineStack(user, 'study-1', seriesId)),
        ).toBeInstanceOf(NotFoundException);
      }
      expect(orthanc.getStudySeries).not.toHaveBeenCalled();
      expect(orthanc.getStudyInstances).not.toHaveBeenCalled();
    });

    it('answers 404 for a study of another workspace, before reading the store', async () => {
      studies.getStudyInScope.mockRejectedValue(new NotFoundException());
      await expect(
        service.analyzeCineStack(user, 'study-of-someone-else', CINE_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orthanc.getStudyInstances).not.toHaveBeenCalled();
      expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
    });

    it('refuses a series the analysis cannot read, 422 with the reason, before any download', async () => {
      instances = cineInstances(CINE_ID, { frames: 25 });
      const multiframe = await errorOf(
        service.analyzeCineStack(user, 'study-1', CINE_ID),
      );
      expect(multiframe.getStatus()).toBe(422);
      expect(multiframe.getResponse()).toMatchObject({
        code: 'DICOM_CINE_STACK_INVALID',
        reason: 'MULTIFRAME',
      });

      instances = cineInstances(CINE_ID, { slices: 4 });
      expect(
        (
          await errorOf(service.analyzeCineStack(user, 'study-1', CINE_ID))
        ).getResponse(),
      ).toMatchObject({ reason: 'TOO_FEW_SLICES' });

      expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
      expect(files.storePatientDocument).not.toHaveBeenCalled();
    });

    it('refuses without the consent for diagnostic AI, before any download', async () => {
      patients.assertDiagnosticAiConsentSigned.mockRejectedValue(
        new ForbiddenException(),
      );
      await expect(
        service.analyzeCineStack(user, 'study-1', CINE_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
      expect(files.storePatientDocument).not.toHaveBeenCalled();
    });

    it('refuses a plan without the chain (403 AI_PIPELINE_NOT_IN_PLAN) or without analyses left (403 QUOTA_EXCEEDED), before any download', async () => {
      entitlements.getEntitlements.mockResolvedValue(
        entitlementsOf({ aiPipelines: ['brain', 'cardio-ecg'] }),
      );
      const locked = await errorOf(
        service.analyzeCineStack(user, 'study-1', CINE_ID),
      );
      expect(locked.getStatus()).toBe(403);
      expect(locked.getResponse()).toMatchObject({
        code: 'AI_PIPELINE_NOT_IN_PLAN',
        pipeline: 'cardio-volume-mri',
      });

      entitlements.getEntitlements.mockResolvedValue(
        entitlementsOf({}, { aiAnalysesThisMonth: 10 }),
      );
      const exhausted = await errorOf(
        service.analyzeCineStack(user, 'study-1', CINE_ID),
      );
      expect(exhausted.getStatus()).toBe(403);
      expect(exhausted.getResponse()).toMatchObject({ code: 'QUOTA_EXCEEDED' });

      expect(orthanc.getInstanceFile).not.toHaveBeenCalled();
      expect(files.storePatientDocument).not.toHaveBeenCalled();
    });

    it('stores nothing when the store stops answering mid-way', async () => {
      orthanc.getInstanceFile.mockImplementation((id: string) =>
        id.endsWith('p2s3')
          ? Promise.reject(new OrthancError('TIMEOUT', 'slow'))
          : Promise.resolve(Buffer.from(id)),
      );
      expect(
        await errorOf(service.analyzeCineStack(user, 'study-1', CINE_ID)),
      ).toBeInstanceOf(BadGatewayException);
      expect(files.storePatientDocument).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
    });

    it('drops the document made for a run that was refused before it existed', async () => {
      runs.create.mockRejectedValue(new ForbiddenException('quota'));
      prisma.aiAnalysisRun.count.mockResolvedValue(0);

      await expect(
        service.analyzeCineStack(user, 'study-1', CINE_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.patientDocument.delete).toHaveBeenCalledWith({
        where: { id: 'document-1' },
      });
      expect(files.deleteFile).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('keeps the document of a run that exists and failed: the source belongs to the record', async () => {
      runs.create.mockRejectedValue(new BadGatewayException('service down'));
      prisma.aiAnalysisRun.count.mockResolvedValue(1);

      await expect(
        service.analyzeCineStack(user, 'study-1', CINE_ID),
      ).rejects.toBeInstanceOf(BadGatewayException);

      expect(prisma.patientDocument.delete).not.toHaveBeenCalled();
      expect(files.deleteFile).not.toHaveBeenCalled();
    });

    it('removes the file when the row cannot be written', async () => {
      prisma.patientDocument.create.mockRejectedValue(new Error('database'));
      await expect(
        service.analyzeCineStack(user, 'study-1', CINE_ID),
      ).rejects.toThrow('database');
      expect(files.deleteFile).toHaveBeenCalledWith(STORAGE_KEY);
      expect(runs.create).not.toHaveBeenCalled();
    });
  });
});
