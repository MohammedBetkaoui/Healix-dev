import { Logger, NotFoundException } from '@nestjs/common';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { type PatientAuditService } from '../patients/patient-audit.service';
import { type PatientsService } from '../patients/patients.service';
import { type PrismaService } from '../prisma/prisma.service';
import { DicomStudiesService } from './dicom-studies.service';
import {
  OrthancError,
  type OrthancClient,
  type OrthancInstance,
} from './orthanc.client';

const ORTHANC_STUDY = 'aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa';
const SERIES_1 = 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb';
const SERIES_2 = 'cccccccc-cccccccc-cccccccc-cccccccc-cccccccc';
const INSTANCE = 'dddddddd-dddddddd-dddddddd-dddddddd-dddddddd';

const user: AuthenticatedUserPayload = {
  email: 'dr@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'user-1',
  tokenType: 'access',
};

const row = {
  createdAt: new Date('2026-10-24T10:00:00Z'),
  id: 'study-1',
  identityWarnings: [],
  instancesCount: 3,
  modalities: ['MR'],
  orthancStudyId: ORTHANC_STUDY,
  patientId: 'patient-1',
  seriesCount: 2,
  sizeBytes: BigInt(1234),
  studyDate: new Date('2026-03-12T00:00:00Z'),
  studyDescription: 'CARDIAC MR',
  studyInstanceUid: '1.2.3',
  uploadedById: 'user-1',
  workspaceId: 'workspace-1',
};

const instance = (
  id: string,
  series: string,
  z: number,
  number: number,
  frames = 1,
): OrthancInstance => ({
  fileSize: 100,
  id,
  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
  imagePositionPatient: [0, 0, z],
  instanceNumber: number,
  numberOfFrames: frames,
  parentSeries: series,
  parentStudy: ORTHANC_STUDY,
  sopInstanceUid: `1.2.3.${number}`,
});

describe('DicomStudiesService', () => {
  const prismaStudy = {
    count: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  const orthanc = {
    deleteStudy: jest.fn(),
    getInstance: jest.fn(),
    getInstanceRendered: jest.fn(),
    getStudyInstances: jest.fn(),
    getStudySeries: jest.fn(),
  };
  const patients = {
    getPatientInScope: jest.fn(),
    getPatientScope: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const service = new DicomStudiesService(
    { dicomStudy: prismaStudy } as unknown as PrismaService,
    orthanc as unknown as OrthancClient,
    patients as unknown as PatientsService,
    audit as unknown as PatientAuditService,
  );

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    patients.getPatientInScope.mockResolvedValue({ id: 'patient-1' });
    patients.getPatientScope.mockResolvedValue({ workspaceId: 'workspace-1' });
    prismaStudy.findFirst.mockResolvedValue(row);
    prismaStudy.findMany.mockResolvedValue([row]);
    prismaStudy.count.mockResolvedValue(0);
    prismaStudy.delete.mockResolvedValue(row);
    orthanc.deleteStudy.mockResolvedValue(undefined);
    audit.log.mockResolvedValue(undefined);
  });

  describe('the studies of a patient', () => {
    it('lists them for the patient and the workspace, in the shapes a browser reads', async () => {
      const [study] = await service.listForPatient(user, 'patient-1');

      expect(prismaStudy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: 'patient-1', workspaceId: 'workspace-1' },
        }),
      );
      expect(study).toMatchObject({
        modalities: ['MR'],
        sizeBytes: 1234,
        studyDate: '2026-03-12',
      });
      expect(study).not.toHaveProperty('orthancStudyId');
      expect(study).not.toHaveProperty('workspaceId');
    });

    it('answers 404, and reads nothing, for a patient of another workspace', async () => {
      patients.getPatientInScope.mockRejectedValue(new NotFoundException());

      await expect(
        service.listForPatient(user, 'someone-else'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaStudy.findMany).not.toHaveBeenCalled();
    });
  });

  describe('one study', () => {
    it('answers 404 for a study of another workspace, without asking Orthanc', async () => {
      prismaStudy.findFirst.mockResolvedValue(null);

      await expect(service.findOne(user, 'study-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaStudy.findFirst).toHaveBeenCalledWith({
        where: { id: 'study-1', workspaceId: 'workspace-1' },
      });
      expect(orthanc.getStudySeries).not.toHaveBeenCalled();
    });

    it('gives its series, with the instances in the order of the stack and the multi-frame ones marked', async () => {
      orthanc.getStudySeries.mockResolvedValue([
        {
          description: 'cine',
          id: SERIES_2,
          instanceIds: [],
          modality: 'MR',
          number: 2,
          seriesInstanceUid: '1.2.3.200',
        },
        {
          description: 'short axis',
          id: SERIES_1,
          instanceIds: [],
          modality: 'MR',
          number: 1,
          seriesInstanceUid: '1.2.3.100',
        },
      ]);
      orthanc.getStudyInstances.mockResolvedValue([
        instance('top', SERIES_1, 30, 1),
        instance('bottom', SERIES_1, -10, 3),
        instance('middle', SERIES_1, 10, 2),
        instance('movie', SERIES_2, 0, 1, 25),
      ]);

      const detail = await service.findOne(user, 'study-1');

      expect(detail.series.map((series) => series.description)).toEqual([
        'short axis',
        'cine',
      ]);
      expect(detail.series[0].instances.map((item) => item.id)).toEqual([
        'bottom',
        'middle',
        'top',
      ]);
      expect(detail.series[0]).toMatchObject({
        instancesCount: 3,
        modality: 'MR',
        seriesInstanceUid: '1.2.3.100',
      });
      expect(detail.series[1].instances[0]).toMatchObject({
        frames: 25,
        id: 'movie',
        multiFrame: true,
      });
      expect(detail.series[0].instances[0].multiFrame).toBe(false);
    });

    it('answers 502 when Orthanc does not answer', async () => {
      orthanc.getStudySeries.mockRejectedValue(
        new OrthancError('UNAVAILABLE', 'down'),
      );
      orthanc.getStudyInstances.mockResolvedValue([]);

      await expect(service.findOne(user, 'study-1')).rejects.toMatchObject({
        response: { code: 'DICOM_STORE_UNAVAILABLE' },
        status: 502,
      });
    });
  });

  describe('deleting a study', () => {
    it('deletes the study in Orthanc when no other row refers to it, then the row', async () => {
      await service.remove(user, 'study-1');

      expect(prismaStudy.count).toHaveBeenCalledWith({
        where: { id: { not: 'study-1' }, orthancStudyId: ORTHANC_STUDY },
      });
      expect(orthanc.deleteStudy).toHaveBeenCalledWith(ORTHANC_STUDY);
      expect(prismaStudy.delete).toHaveBeenCalledWith({
        where: { id: 'study-1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        user,
        'DICOM_STUDY_DELETED',
        'study-1',
        {
          orthancDeleted: true,
          patientId: 'patient-1',
        },
      );
    });

    it('does not touch Orthanc when the study is shared with another workspace', async () => {
      prismaStudy.count.mockResolvedValue(1);

      await service.remove(user, 'study-1');

      expect(orthanc.deleteStudy).not.toHaveBeenCalled();
      expect(prismaStudy.delete).toHaveBeenCalledWith({
        where: { id: 'study-1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        user,
        'DICOM_STUDY_DELETED',
        'study-1',
        expect.objectContaining({ orthancDeleted: false }),
      );
    });

    it('keeps the row, so that the call can be repeated, when Orthanc does not answer', async () => {
      orthanc.deleteStudy.mockRejectedValue(
        new OrthancError('UNAVAILABLE', 'down'),
      );

      await expect(service.remove(user, 'study-1')).rejects.toMatchObject({
        status: 502,
      });
      expect(prismaStudy.delete).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('answers 404 for a study of another workspace, and deletes nothing', async () => {
      prismaStudy.findFirst.mockResolvedValue(null);

      await expect(service.remove(user, 'study-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(orthanc.deleteStudy).not.toHaveBeenCalled();
      expect(prismaStudy.delete).not.toHaveBeenCalled();
    });
  });

  describe('the preview of a slice', () => {
    beforeEach(() => {
      orthanc.getInstance.mockResolvedValue(instance(INSTANCE, SERIES_1, 0, 1));
      orthanc.getInstanceRendered.mockResolvedValue(Buffer.from('png'));
    });

    it('renders a slice of a study of the workspace', async () => {
      await expect(
        service.renderInstance(user, INSTANCE, {
          windowCenter: 40,
          windowWidth: 400,
        }),
      ).resolves.toEqual(Buffer.from('png'));

      expect(prismaStudy.findFirst).toHaveBeenCalledWith({
        where: { orthancStudyId: ORTHANC_STUDY, workspaceId: 'workspace-1' },
      });
      expect(orthanc.getInstanceRendered).toHaveBeenCalledWith(INSTANCE, {
        windowCenter: 40,
        windowWidth: 400,
      });
    });

    it('answers 404, and renders nothing, for a slice of a study of another workspace', async () => {
      prismaStudy.findFirst.mockResolvedValue(null);

      await expect(
        service.renderInstance(user, INSTANCE),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orthanc.getInstanceRendered).not.toHaveBeenCalled();
    });

    it('answers 404 for an identifier that is not one, without asking Orthanc', async () => {
      await expect(
        service.renderInstance(user, '../system'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orthanc.getInstance).not.toHaveBeenCalled();
    });

    it('answers 404 for an instance Orthanc does not know', async () => {
      orthanc.getInstance.mockRejectedValue(
        new OrthancError('NOT_FOUND', 'no', 404),
      );

      await expect(
        service.renderInstance(user, INSTANCE),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
