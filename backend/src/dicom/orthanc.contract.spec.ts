import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { type PatientAuditService } from '../patients/patient-audit.service';
import { type PatientsService } from '../patients/patients.service';
import { type PrismaService } from '../prisma/prisma.service';
import { DicomStudiesService } from './dicom-studies.service';
import { OrthancClient } from './orthanc.client';
import { type OrthancSettings } from './orthanc.config';

// The client against what Orthanc really answers. The fixtures are the answers
// of Orthanc 1.13.0 recorded on a real MRI study (orthanc-fixtures/1.13.0),
// not a shape written from the documentation: a first version of the client
// expected the study of an instance in GET /instances/{id}, which Orthanc does
// not give (it names the series), and every unit test passed.
const FIXTURES = join(__dirname, 'orthanc-fixtures', '1.13.0');
const fixture = <T = Record<string, unknown>>(name: string): T =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as T;

const SETTINGS: OrthancSettings = {
  password: 'secret',
  streamTimeoutMs: 3000,
  timeoutMs: 1000,
  uploadTimeoutMs: 2000,
  url: 'http://orthanc:8042',
  username: 'healixdz',
};

const instanceRecord = fixture<{
  ID: string;
  MainDicomTags: { InstanceNumber: string; SOPInstanceUID: string };
  ParentSeries: string;
}>('instance');
const seriesRecord = fixture<{ ID: string; ParentStudy: string }>('series');
const studyRecord = fixture<{ ID: string }>('study');

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

// What Orthanc answers, by path (the query string is not part of the key).
const answers: Record<string, unknown> = {
  [`/instances/${instanceRecord.ID}`]: fixture('instance'),
  [`/series/${seriesRecord.ID}`]: fixture('series'),
  [`/studies/${studyRecord.ID}`]: fixture('study'),
  [`/studies/${studyRecord.ID}/instances`]: fixture('instances-expand'),
  [`/studies/${studyRecord.ID}/series`]: fixture('series-expand'),
  [`/studies/${studyRecord.ID}/statistics`]: fixture('statistics'),
  '/instances': fixture('post-instances-already-stored'),
};

describe('OrthancClient against the recorded answers of Orthanc 1.13.0', () => {
  const requested: string[] = [];
  const client = new OrthancClient(SETTINGS);

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    requested.length = 0;
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const { pathname } = new URL(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      );
      requested.push(pathname);
      return Promise.resolve(
        pathname in answers
          ? json(answers[pathname])
          : new Response('{}', { status: 404 }),
      );
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('records what the premise of the fix says: an instance names its series, not its study', () => {
    expect(instanceRecord).not.toHaveProperty('ParentStudy');
    expect(instanceRecord.ParentSeries).toBe(seriesRecord.ID);
    expect(fixture('series')).toHaveProperty('ParentStudy', studyRecord.ID);
    // The answer to a POST /instances is the one that carries the study.
    expect(fixture('post-instances-already-stored')).toHaveProperty(
      'ParentStudy',
      studyRecord.ID,
    );
  });

  it('finds the study of an instance through its series', async () => {
    const instance = await client.getInstance(instanceRecord.ID);

    expect(instance).toMatchObject({
      id: instanceRecord.ID,
      instanceNumber: Number(instanceRecord.MainDicomTags.InstanceNumber),
      numberOfFrames: 1,
      parentSeries: seriesRecord.ID,
      parentStudy: studyRecord.ID,
      sopInstanceUid: instanceRecord.MainDicomTags.SOPInstanceUID,
    });
    expect(instance.imageOrientationPatient).toHaveLength(6);
    expect(instance.imagePositionPatient).toHaveLength(3);
    expect(requested).toEqual([
      `/instances/${instanceRecord.ID}`,
      `/series/${seriesRecord.ID}`,
    ]);
  });

  it('reads the instances of a study, which name no study either', async () => {
    const instances = await client.getStudyInstances(studyRecord.ID);

    expect(instances).toHaveLength(3);
    for (const instance of instances) {
      expect(instance.parentSeries).toBe(seriesRecord.ID);
      expect(instance.parentStudy).toBeNull();
      expect(instance.numberOfFrames).toBe(1);
      expect(instance.instanceNumber).toEqual(expect.any(Number));
      expect(instance.sopInstanceUid).not.toBe('');
    }
  });

  it('reads the series of a study: number, modality, description, UID', async () => {
    const [series] = await client.getStudySeries(studyRecord.ID);

    expect(series).toMatchObject({
      description: 'sT2W/FLAIR',
      id: seriesRecord.ID,
      modality: 'MR',
      number: 401,
    });
    expect(series.seriesInstanceUid).not.toBe('');
    expect(series.instanceIds).toHaveLength(3);
  });

  it('reads the study: identity, date, description', async () => {
    const study = await client.getStudy(studyRecord.ID);

    expect(study).toMatchObject({
      patientBirthDate: '19490301',
      patientName: 'DOE^JANE',
      studyDate: '20061201',
      studyDescription: 'IRM cérébrale, neuro-crâne',
      studyInstanceUid: '2.16.840.1.113669.632.20.1211.10000357775',
    });
    expect(study.seriesIds).toHaveLength(1);
  });

  it('reads the statistics of a study', async () => {
    const statistics = await client.getStudyStatistics(studyRecord.ID);

    expect(statistics).toMatchObject({ countInstances: 14, countSeries: 1 });
    expect(statistics.diskSize).toBeGreaterThan(2_000_000);
  });

  it('reads the study an instance landed in from the answer to its storage', async () => {
    const stored = await client.uploadInstance(Buffer.from('dicom'));

    expect(stored).toMatchObject({
      parentStudy: studyRecord.ID,
      status: 'AlreadyStored',
    });
  });

  describe('the scope of an instance, with the real client', () => {
    const user: AuthenticatedUserPayload = {
      email: 'dr@healix.dz',
      role: UserRole.INDEPENDENT_DOCTOR,
      sub: 'user-1',
      tokenType: 'access',
    };
    const findFirst = jest.fn();
    const service = new DicomStudiesService(
      { dicomStudy: { findFirst } } as unknown as PrismaService,
      client,
      {
        getPatientScope: jest
          .fn()
          .mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as unknown as PatientsService,
      {} as PatientAuditService,
    );

    it('is the study row of the workspace that holds the instance’s study', async () => {
      findFirst.mockResolvedValue({
        id: 'row-1',
        orthancStudyId: studyRecord.ID,
      });

      const { instance, study } = await service.getInstanceInScope(
        user,
        instanceRecord.ID,
      );

      expect(findFirst).toHaveBeenCalledWith({
        where: { orthancStudyId: studyRecord.ID, workspaceId: 'workspace-1' },
      });
      expect(study.id).toBe('row-1');
      expect(instance.id).toBe(instanceRecord.ID);
    });

    it('is a 404 when the workspace holds no row for that study', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.getInstanceInScope(user, instanceRecord.ID),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
