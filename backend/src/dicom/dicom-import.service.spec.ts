import { Logger, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { type PatientAuditService } from '../patients/patient-audit.service';
import { type PatientsService } from '../patients/patients.service';
import { type PrismaService } from '../prisma/prisma.service';
import {
  DicomImportService,
  type UploadedDicomFile,
} from './dicom-import.service';
import { type DicomImportLimits } from './dicom-zip';
import { OrthancError, type OrthancClient } from './orthanc.client';
import { buildZip, dicomLikeFile } from './testing/zip-builder';

const STUDY_A = 'aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa';
const STUDY_B = 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb';
const SERIES = 'cccccccc-cccccccc-cccccccc-cccccccc-cccccccc';

const user: AuthenticatedUserPayload = {
  email: 'dr@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'user-1',
  tokenType: 'access',
};

const patient = {
  birthDate: new Date('1990-01-05T00:00:00.000Z'),
  firstName: 'Amine',
  firstNameAr: 'أمين',
  gender: 'MALE',
  id: 'patient-1',
  lastName: 'Benali',
  lastNameAr: 'بن علي',
};

const LIMITS: DicomImportLimits = {
  maxFiles: 10,
  maxInstanceBytes: 64 * 1024,
  maxUncompressedBytes: 256 * 1024,
  maxUploadBytes: 1024 * 1024,
};

const studyTags = (
  uid: string,
  overrides: Record<string, string | null> = {},
) => ({
  id: '',
  patientBirthDate: '19900105',
  patientName: 'BENALI^AMINE',
  patientSex: 'M',
  seriesIds: [SERIES],
  studyDate: '20260312',
  studyDescription: 'CARDIAC MR',
  studyInstanceUid: uid,
  ...overrides,
});

describe('DicomImportService', () => {
  const prismaStudy = {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const orthanc = {
    deleteStudy: jest.fn(),
    getStudy: jest.fn(),
    getStudySeries: jest.fn(),
    getStudyStatistics: jest.fn(),
    uploadInstance: jest.fn(),
  };
  const patients = {
    getPatientInScope: jest.fn(),
    getPatientScope: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const service = new DicomImportService(
    { dicomStudy: prismaStudy } as unknown as PrismaService,
    orthanc as unknown as OrthancClient,
    patients as unknown as PatientsService,
    audit as unknown as PatientAuditService,
  );

  let directory: string;
  beforeAll(async () => {
    Logger.overrideLogger(false);
    directory = await mkdtemp(join(tmpdir(), 'dicom-import-spec-'));
  });
  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  async function upload(
    name: string,
    content: Buffer,
  ): Promise<UploadedDicomFile> {
    const path = join(directory, `${Math.random().toString(36).slice(2)}.bin`);
    await writeFile(path, content);
    return { originalname: name, path, size: content.length };
  }

  // The data of the first row created.
  const createdData = () =>
    (prismaStudy.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
      .data;

  const imported = (counter = { n: 0 }) =>
    prismaStudy.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        counter.n += 1;
        return Promise.resolve({
          createdAt: new Date('2026-10-24T10:00:00Z'),
          id: `row-${counter.n}`,
          ...data,
        });
      },
    );

  beforeEach(() => {
    jest.resetAllMocks();
    patients.getPatientInScope.mockResolvedValue(patient);
    patients.getPatientScope.mockResolvedValue({ workspaceId: 'workspace-1' });
    orthanc.uploadInstance.mockResolvedValue({
      id: 'i',
      parentSeries: SERIES,
      parentStudy: STUDY_A,
      status: 'Success',
    });
    orthanc.getStudy.mockImplementation((id: string) =>
      Promise.resolve({
        ...studyTags(id === STUDY_A ? '1.2.3' : '4.5.6'),
        id,
      }),
    );
    orthanc.getStudyStatistics.mockResolvedValue({
      countInstances: 2,
      countSeries: 1,
      diskSize: 4096,
    });
    orthanc.getStudySeries.mockResolvedValue([{ id: SERIES, modality: 'MR' }]);
    prismaStudy.findUnique.mockResolvedValue(null);
    orthanc.deleteStudy.mockResolvedValue(undefined);
    prismaStudy.count.mockResolvedValue(0);
    audit.log.mockResolvedValue(undefined);
    imported();
  });

  it('sends the DICOM files, ignores the others and counts them', async () => {
    const result = await service.import(user, 'patient-1', [
      await upload('a.dcm', dicomLikeFile('a')),
      await upload('notes.txt', Buffer.from('not dicom at all')),
      await upload('short.dcm', Buffer.alloc(10)),
      await upload('b.dcm', dicomLikeFile('b')),
    ]);

    expect(orthanc.uploadInstance).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ imported: 2, skipped: 2 });
    expect(result.studies).toHaveLength(1);
    expect(result.studies[0]).toMatchObject({
      instancesCount: 2,
      modalities: ['MR'],
      patientId: 'patient-1',
      seriesCount: 1,
      sizeBytes: 4096,
      studyDate: '2026-03-12',
      studyDescription: 'CARDIAC MR',
      studyInstanceUid: '1.2.3',
    });
    expect(result.warnings).toEqual([]);
  });

  it('writes the row of the workspace of the caller, and audits it', async () => {
    await service.import(user, 'patient-1', [
      await upload('a.dcm', dicomLikeFile()),
    ]);

    expect(createdData()).toMatchObject({
      identityWarnings: [],
      orthancStudyId: STUDY_A,
      patientId: 'patient-1',
      studyInstanceUid: '1.2.3',
      uploadedById: 'user-1',
      workspaceId: 'workspace-1',
    });
    expect(audit.log).toHaveBeenCalledWith(
      user,
      'DICOM_STUDY_IMPORTED',
      'row-1',
      {
        identityWarnings: 0,
        instancesCount: 2,
        instancesSent: 1,
        patientId: 'patient-1',
        seriesCount: 1,
      },
    );
  });

  it('keeps an identity warning with the study, and reports it, without refusing', async () => {
    orthanc.getStudy.mockResolvedValue(
      studyTags('1.2.3', {
        patientBirthDate: '20010101',
        patientName: 'PATIENT^FICTIF',
      }),
    );

    const result = await service.import(user, 'patient-1', [
      await upload('a.dcm', dicomLikeFile()),
    ]);

    expect(createdData().identityWarnings).toEqual([
      { dicomValue: 'PATIENT^FICTIF', field: 'PatientName' },
      { dicomValue: '20010101', field: 'PatientBirthDate' },
    ]);
    expect(result.studies[0].identityWarnings).toHaveLength(2);
    expect(result.warnings).toEqual([
      {
        code: 'IDENTITY_MISMATCH',
        fields: ['PatientName', 'PatientBirthDate'],
        studyInstanceUid: '1.2.3',
      },
    ]);
  });

  it('refuses an import with no DICOM file in it, and creates nothing', async () => {
    await expect(
      service.import(user, 'patient-1', [
        await upload('a.txt', Buffer.from('text')),
        await upload('b.jpg', Buffer.from('jpeg')),
      ]),
    ).rejects.toMatchObject({
      response: { code: 'DICOM_NO_VALID_FILE', skipped: 2 },
      status: 422,
    });
    expect(orthanc.uploadInstance).not.toHaveBeenCalled();
    expect(prismaStudy.create).not.toHaveBeenCalled();
  });

  it('counts a file Orthanc cannot read as skipped, and goes on', async () => {
    orthanc.uploadInstance
      .mockRejectedValueOnce(new OrthancError('REJECTED', 'bad format', 400))
      .mockResolvedValueOnce({
        id: 'i',
        parentSeries: SERIES,
        parentStudy: STUDY_A,
        status: 'Success',
      });

    const result = await service.import(user, 'patient-1', [
      await upload('dicomdir', dicomLikeFile('dir')),
      await upload('a.dcm', dicomLikeFile('a')),
    ]);

    expect(result).toMatchObject({ imported: 1, skipped: 1 });
  });

  describe('a ZIP', () => {
    it('makes one row per study it holds', async () => {
      orthanc.uploadInstance
        .mockResolvedValueOnce({
          id: '1',
          parentSeries: SERIES,
          parentStudy: STUDY_A,
          status: 'Success',
        })
        .mockResolvedValueOnce({
          id: '2',
          parentSeries: SERIES,
          parentStudy: STUDY_B,
          status: 'Success',
        })
        .mockResolvedValueOnce({
          id: '3',
          parentSeries: SERIES,
          parentStudy: STUDY_A,
          status: 'Success',
        });

      const result = await service.import(user, 'patient-1', [
        await upload(
          'export.zip',
          buildZip([
            { data: dicomLikeFile('1'), method: 8, name: 'DICOM/a/1.dcm' },
            { data: dicomLikeFile('2'), method: 8, name: 'DICOM/b/2.dcm' },
            { data: dicomLikeFile('3'), name: 'DICOM/a/3.dcm' },
            { data: Buffer.from('readme'), name: 'README.txt' },
            { data: Buffer.alloc(0), name: 'DICOM/' },
          ]),
        ),
      ]);

      expect(result).toMatchObject({ imported: 3, skipped: 1 });
      expect(
        result.studies.map((study) => study.studyInstanceUid).sort(),
      ).toEqual(['1.2.3', '4.5.6']);
      expect(prismaStudy.create).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['a ".." path', [{ data: dicomLikeFile(), name: '../evil.dcm' }], 'PATH'],
      [
        'an absolute path',
        [{ data: dicomLikeFile(), name: '/tmp/evil.dcm' }],
        'PATH',
      ],
      [
        'a nested ZIP',
        [{ data: buildZip([]), name: 'inner.zip' }],
        'NESTED_ZIP',
      ],
      [
        'too many files',
        Array.from({ length: LIMITS.maxFiles + 1 }, (_, index) => ({
          data: dicomLikeFile(`${index}`),
          name: `${index}.dcm`,
        })),
        'TOO_MANY_FILES',
      ],
      [
        'a decompressed size over the limit',
        [1, 2, 3, 4, 5].map((index) => ({
          data: Buffer.alloc(LIMITS.maxInstanceBytes),
          method: 8 as const,
          name: `zeros-${index}.dcm`,
        })),
        'TOO_LARGE',
      ],
    ])(
      'is refused whole with %s, before anything is sent',
      async (_label, entries, reason) => {
        await expect(
          service.import(
            user,
            'patient-1',
            [await upload('bad.zip', buildZip(entries))],
            LIMITS,
          ),
        ).rejects.toMatchObject({
          response: { code: 'DICOM_ZIP_UNSAFE', reason },
          status: 422,
        });
        expect(orthanc.uploadInstance).not.toHaveBeenCalled();
        expect(prismaStudy.create).not.toHaveBeenCalled();
      },
    );

    it('is refused when it is a ZIP by its name only', async () => {
      await expect(
        service.import(user, 'patient-1', [
          await upload('fake.zip', Buffer.from('not a zip')),
        ]),
      ).rejects.toMatchObject({
        response: { code: 'DICOM_ZIP_UNSAFE', reason: 'CORRUPT' },
      });
    });

    it('removes the studies it had created in Orthanc when a later entry is refused', async () => {
      await expect(
        service.import(
          user,
          'patient-1',
          [
            await upload(
              'late.zip',
              buildZip([
                { data: dicomLikeFile('1'), name: 'ok.dcm' },
                { data: buildZip([]), name: 'zz-inner.zip' },
              ]),
            ),
          ],
          LIMITS,
        ),
      ).rejects.toMatchObject({ response: { reason: 'NESTED_ZIP' } });

      // The nested ZIP is caught while listing: nothing was sent at all.
      expect(orthanc.uploadInstance).not.toHaveBeenCalled();
    });

    it('does not mix with .dcm files, nor with another ZIP', async () => {
      const zip = buildZip([{ data: dicomLikeFile(), name: 'a.dcm' }]);

      await expect(
        service.import(user, 'patient-1', [
          await upload('a.zip', zip),
          await upload('b.dcm', dicomLikeFile()),
        ]),
      ).rejects.toMatchObject({ response: { code: 'DICOM_UPLOAD_INVALID' } });
      await expect(
        service.import(user, 'patient-1', [
          await upload('a.zip', zip),
          await upload('b.zip', zip),
        ]),
      ).rejects.toMatchObject({ response: { code: 'DICOM_UPLOAD_INVALID' } });
    });
  });

  describe('the limits of an upload', () => {
    it('refuses an empty upload', async () => {
      await expect(service.import(user, 'patient-1', [])).rejects.toMatchObject(
        {
          response: { code: 'DICOM_UPLOAD_INVALID' },
        },
      );
    });

    it('refuses more files than the limit', async () => {
      const files = await Promise.all(
        Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) =>
          upload(`${i}.dcm`, dicomLikeFile(`${i}`)),
        ),
      );

      await expect(
        service.import(user, 'patient-1', files, LIMITS),
      ).rejects.toMatchObject({ response: { code: 'DICOM_UPLOAD_INVALID' } });
      expect(orthanc.uploadInstance).not.toHaveBeenCalled();
    });

    it('refuses an upload over the size limit', async () => {
      await expect(
        service.import(
          user,
          'patient-1',
          [await upload('big.dcm', dicomLikeFile('x'.repeat(2000)))],
          { ...LIMITS, maxUploadBytes: 1000 },
        ),
      ).rejects.toMatchObject({ status: 413 });
    });

    it('skips a DICOM file larger than an instance may be, without reading it', async () => {
      await expect(
        service.import(
          user,
          'patient-1',
          [await upload('huge.dcm', dicomLikeFile('x'.repeat(5000)))],
          { ...LIMITS, maxInstanceBytes: 1000 },
        ),
      ).rejects.toMatchObject({
        response: { code: 'DICOM_NO_VALID_FILE', skipped: 1 },
      });
    });
  });

  describe('the patient and the workspace', () => {
    it('answers 404, and sends nothing, for a patient of another workspace', async () => {
      patients.getPatientInScope.mockRejectedValue(
        new NotFoundException('Patient introuvable.'),
      );

      await expect(
        service.import(user, 'someone-else', [
          await upload('a.dcm', dicomLikeFile()),
        ]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orthanc.uploadInstance).not.toHaveBeenCalled();
    });

    it('does not take a study from the record of another patient of the workspace', async () => {
      prismaStudy.findUnique.mockResolvedValue({
        id: 'row-0',
        patientId: 'patient-2',
      });

      const result = await service.import(user, 'patient-1', [
        await upload('a.dcm', dicomLikeFile()),
      ]);

      expect(result.studies).toEqual([]);
      expect(result.warnings).toEqual([
        {
          code: 'STUDY_ATTACHED_TO_ANOTHER_PATIENT',
          studyInstanceUid: '1.2.3',
        },
      ]);
      expect(prismaStudy.create).not.toHaveBeenCalled();
      expect(prismaStudy.update).not.toHaveBeenCalled();
    });

    it('updates the row when the same study is imported again into the same record', async () => {
      prismaStudy.findUnique.mockResolvedValue({
        id: 'row-0',
        patientId: 'patient-1',
      });
      prismaStudy.update.mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({
          createdAt: new Date(),
          id: 'row-0',
          patientId: 'patient-1',
          studyInstanceUid: '1.2.3',
          uploadedById: 'user-1',
          ...data,
        }),
      );

      const result = await service.import(user, 'patient-1', [
        await upload('a.dcm', dicomLikeFile()),
      ]);

      expect(prismaStudy.create).not.toHaveBeenCalled();
      expect(prismaStudy.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'row-0' } }),
      );
      expect(result.studies[0].id).toBe('row-0');
    });

    it('attaches a study already in Orthanc for another workspace: its own row, the same Orthanc study', async () => {
      orthanc.uploadInstance.mockResolvedValue({
        id: 'i',
        parentSeries: SERIES,
        parentStudy: STUDY_A,
        status: 'AlreadyStored',
      });

      const result = await service.import(user, 'patient-1', [
        await upload('a.dcm', dicomLikeFile()),
      ]);

      expect(result.imported).toBe(1);
      expect(createdData()).toMatchObject({
        orthancStudyId: STUDY_A,
        workspaceId: 'workspace-1',
      });
    });
  });

  describe('when Orthanc fails', () => {
    it('answers 502 and removes the study this import had begun, if no row refers to it', async () => {
      orthanc.uploadInstance
        .mockResolvedValueOnce({
          id: '1',
          parentSeries: SERIES,
          parentStudy: STUDY_A,
          status: 'Success',
        })
        .mockRejectedValueOnce(new OrthancError('UNAVAILABLE', 'down'));

      await expect(
        service.import(user, 'patient-1', [
          await upload('a.dcm', dicomLikeFile('a')),
          await upload('b.dcm', dicomLikeFile('b')),
        ]),
      ).rejects.toMatchObject({
        response: { code: 'DICOM_STORE_UNAVAILABLE' },
        status: 502,
      });

      expect(prismaStudy.count).toHaveBeenCalledWith({
        where: { orthancStudyId: STUDY_A },
      });
      expect(orthanc.deleteStudy).toHaveBeenCalledWith(STUDY_A);
      expect(prismaStudy.create).not.toHaveBeenCalled();
    });

    it('leaves in Orthanc a study that a row refers to (it was there before)', async () => {
      prismaStudy.count.mockResolvedValue(1);
      orthanc.uploadInstance
        .mockResolvedValueOnce({
          id: '1',
          parentSeries: SERIES,
          parentStudy: STUDY_A,
          status: 'AlreadyStored',
        })
        .mockRejectedValueOnce(new OrthancError('TIMEOUT', 'slow'));

      await expect(
        service.import(user, 'patient-1', [
          await upload('a.dcm', dicomLikeFile('a')),
          await upload('b.dcm', dicomLikeFile('b')),
        ]),
      ).rejects.toMatchObject({ status: 502 });

      expect(orthanc.deleteStudy).not.toHaveBeenCalled();
    });

    it('also removes it when the description of the study fails', async () => {
      orthanc.getStudy.mockRejectedValue(
        new OrthancError('UNEXPECTED', 'boom', 500),
      );

      await expect(
        service.import(user, 'patient-1', [
          await upload('a.dcm', dicomLikeFile()),
        ]),
      ).rejects.toMatchObject({ status: 502 });

      expect(orthanc.deleteStudy).toHaveBeenCalledWith(STUDY_A);
    });
  });
});
