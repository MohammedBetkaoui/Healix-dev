import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyStorageTestEnv,
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { PatientsModule } from '../patients/patients.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { DicomImportService } from './dicom-import.service';
import { DicomStudiesService } from './dicom-studies.service';
import { DicomModule } from './dicom.module';
import { OrthancClient } from './orthanc.client';
import { dicomLikeFile } from './testing/zip-builder';

// The studies against a migrated database: a row per workspace for one Orthanc
// study, the isolation between workspaces (404), and the deletion that leaves
// Orthanc alone while another workspace still holds the study.
// TEST_DATABASE_URL names a database ending in "_test"; skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const ORTHANC_STUDY = 'aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa';
const SERIES = 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb';
const INSTANCE = 'cccccccc-cccccccc-cccccccc-cccccccc-cccccccc';

describeWithDatabase('the DICOM studies against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let importService: DicomImportService;
  let studies: DicomStudiesService;
  let directory: string;
  const cleanupStorage = applyStorageTestEnv();
  const orthanc = {
    deleteStudy: jest.fn(),
    getInstance: jest.fn(),
    getInstanceRendered: jest.fn(),
    getStudy: jest.fn(),
    getStudyInstances: jest.fn(),
    getStudySeries: jest.fn(),
    getStudyStatistics: jest.fn(),
    uploadInstance: jest.fn(),
  };

  async function doctorWithPatient() {
    const doctor = await fixtures.independentDoctor();
    const patient = await fixtures.patient(
      doctor.workspace.id,
      doctor.profile.id,
    );
    return { actor: doctor.actor, patient, workspace: doctor.workspace };
  }

  type Owner = Awaited<ReturnType<typeof doctorWithPatient>>;
  let owner: Owner;
  let other: Owner;

  async function importInto(who: Owner) {
    const path = join(directory, `${Math.random().toString(36).slice(2)}.dcm`);
    const content = dicomLikeFile();
    await writeFile(path, content);
    return importService.import(who.actor, who.patient.id, [
      { originalname: 'a.dcm', path, size: content.length },
    ]);
  }

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    directory = await mkdtemp(join(tmpdir(), 'dicom-integration-'));
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        StorageModule,
        PatientsModule,
        DicomModule,
      ],
    })
      .overrideProvider(OrthancClient)
      .useValue(orthanc)
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    importService = moduleRef.get(DicomImportService);
    studies = moduleRef.get(DicomStudiesService);
    fixtures = new IntegrationFixtures(prisma, 'dcm');

    owner = await doctorWithPatient();
    other = await doctorWithPatient();
  });

  afterAll(async () => {
    // The suite owns its Orthanc study id: everything it ever left behind
    // (from a previous run too) goes.
    await prisma.dicomStudy.deleteMany({
      where: { orthancStudyId: ORTHANC_STUDY },
    });
    await fixtures.cleanup();
    await moduleRef.close();
    await rm(directory, { force: true, recursive: true });
    cleanupStorage();
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    await prisma.dicomStudy.deleteMany({
      where: { orthancStudyId: ORTHANC_STUDY },
    });
    orthanc.uploadInstance.mockResolvedValue({
      id: INSTANCE,
      parentSeries: SERIES,
      parentStudy: ORTHANC_STUDY,
      status: 'Success',
    });
    orthanc.getStudy.mockResolvedValue({
      id: ORTHANC_STUDY,
      patientBirthDate: '19000101',
      patientName: 'PATIENT^FICTIF',
      patientSex: 'O',
      seriesIds: [SERIES],
      studyDate: '20260312',
      studyDescription: 'CARDIAC MR',
      studyInstanceUid: '1.2.826.0.1.3680043.8.498.1',
    });
    orthanc.getStudyStatistics.mockResolvedValue({
      countInstances: 10,
      countSeries: 1,
      diskSize: 3_000_000_000,
    });
    orthanc.getStudySeries.mockResolvedValue([{ id: SERIES, modality: 'MR' }]);
    orthanc.getStudyInstances.mockResolvedValue([]);
    orthanc.getInstance.mockResolvedValue({
      id: INSTANCE,
      parentStudy: ORTHANC_STUDY,
    });
    orthanc.getInstanceRendered.mockResolvedValue(Buffer.from('png'));
    orthanc.deleteStudy.mockResolvedValue(undefined);
  });

  it('stores a study in the workspace of the importer, with a size over 2 GiB and its warnings', async () => {
    const result = await importInto(owner);

    expect(result.studies).toHaveLength(1);
    const row = await prisma.dicomStudy.findUniqueOrThrow({
      where: { id: result.studies[0].id },
    });
    expect(row).toMatchObject({
      instancesCount: 10,
      orthancStudyId: ORTHANC_STUDY,
      patientId: owner.patient.id,
      seriesCount: 1,
      sizeBytes: BigInt(3_000_000_000),
      studyDescription: 'CARDIAC MR',
      uploadedById: owner.actor.sub,
      workspaceId: owner.workspace.id,
    });
    expect(row.modalities).toEqual(['MR']);
    expect(row.studyDate?.toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(
      (row.identityWarnings as { field: string }[]).map((w) => w.field),
    ).toEqual(['PatientName', 'PatientBirthDate', 'PatientSex']);
    expect(result.studies[0].sizeBytes).toBe(3_000_000_000);
  });

  it('lists the studies of the patient, for the owner only', async () => {
    await importInto(owner);

    await expect(
      studies.listForPatient(owner.actor, owner.patient.id),
    ).resolves.toHaveLength(1);
    await expect(
      studies.listForPatient(other.actor, owner.patient.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 to another workspace for the study and for a slice of it', async () => {
    const [study] = (await importInto(owner)).studies;

    await expect(studies.findOne(other.actor, study.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      studies.renderInstance(other.actor, INSTANCE),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(studies.remove(other.actor, study.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      studies.renderInstance(owner.actor, INSTANCE),
    ).resolves.toEqual(Buffer.from('png'));
    expect(orthanc.deleteStudy).not.toHaveBeenCalled();
    await expect(
      prisma.dicomStudy.count({ where: { id: study.id } }),
    ).resolves.toBe(1);
  });

  it('keeps one row per workspace for the same study, and deletes it from Orthanc with the last one', async () => {
    const first = (await importInto(owner)).studies[0];
    const second = (await importInto(other)).studies[0];

    expect(second.id).not.toBe(first.id);
    const rows = await prisma.dicomStudy.findMany({
      where: { orthancStudyId: ORTHANC_STUDY },
    });
    expect(rows.map((row) => row.workspaceId).sort()).toEqual(
      [owner.workspace.id, other.workspace.id].sort(),
    );

    // The other workspace still holds it: Orthanc is left alone.
    await studies.remove(owner.actor, first.id);
    expect(orthanc.deleteStudy).not.toHaveBeenCalled();
    await expect(
      studies.findOne(other.actor, second.id).then((study) => study.id),
    ).resolves.toBe(second.id);

    await studies.remove(other.actor, second.id);
    expect(orthanc.deleteStudy).toHaveBeenCalledTimes(1);
    expect(orthanc.deleteStudy).toHaveBeenCalledWith(ORTHANC_STUDY);
    await expect(
      prisma.dicomStudy.count({ where: { orthancStudyId: ORTHANC_STUDY } }),
    ).resolves.toBe(0);
  });

  it('refuses a second row for the same study in the same workspace', async () => {
    const [study] = (await importInto(owner)).studies;

    await expect(
      prisma.dicomStudy.create({
        data: {
          identityWarnings: [],
          instancesCount: 1,
          modalities: [],
          orthancStudyId: ORTHANC_STUDY,
          patientId: owner.patient.id,
          seriesCount: 1,
          sizeBytes: BigInt(1),
          studyInstanceUid: study.studyInstanceUid,
          uploadedById: owner.actor.sub,
          workspaceId: owner.workspace.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('updates the row when the same study is imported again, instead of adding one', async () => {
    const first = (await importInto(owner)).studies[0];
    orthanc.getStudyStatistics.mockResolvedValue({
      countInstances: 12,
      countSeries: 1,
      diskSize: 5000,
    });

    const again = (await importInto(owner)).studies[0];

    expect(again.id).toBe(first.id);
    expect(again.instancesCount).toBe(12);
    await expect(
      prisma.dicomStudy.count({ where: { workspaceId: owner.workspace.id } }),
    ).resolves.toBe(1);
  });

  it('does not attach a study of the workspace to a second patient of the same workspace', async () => {
    const colleague = await fixtures.patient(
      owner.workspace.id,
      (
        await prisma.workspace.findUniqueOrThrow({
          where: { id: owner.workspace.id },
        })
      ).ownerDoctorProfileId!,
    );
    await importInto(owner);
    const path = join(directory, 'second.dcm');
    await writeFile(path, dicomLikeFile());

    const result = await importService.import(owner.actor, colleague.id, [
      { originalname: 'a.dcm', path, size: 140 },
    ]);

    expect(result.studies).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: 'STUDY_ATTACHED_TO_ANOTHER_PATIENT',
        studyInstanceUid: '1.2.826.0.1.3680043.8.498.1',
      },
    ]);
    await expect(
      prisma.dicomStudy.count({ where: { patientId: colleague.id } }),
    ).resolves.toBe(0);
  });
});
