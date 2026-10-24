import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AiAnalysisRunsModule } from '../ai-analysis-runs/ai-analysis-runs.module';
import { AiAnalysisReportsService } from '../ai-analysis-runs/report/ai-analysis-reports.service';
import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import {
  assertTestDatabaseName,
  FakePdfRenderer,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { PrismaService } from '../prisma/prisma.service';
import {
  aiReportCategory,
  aiReportTitle,
  buildAiClinicalReport,
} from './ai-clinical-report';

// The report of an AI analysis and its row in the clinical reports center are
// stored together, and the migration that created the center filled it for
// the reports that existed: both on a migrated database (TEST_DATABASE_URL,
// a name ending in "_test"; skipped without it).
jest.mock('./ai-clinical-report', () => {
  const actual = jest.requireActual<typeof import('./ai-clinical-report')>(
    './ai-clinical-report',
  );
  return {
    ...actual,
    buildAiClinicalReport: jest.fn(actual.buildAiClinicalReport),
  };
});

const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const mockedBuild = jest.mocked(buildAiClinicalReport);

// 2 x 2 grey PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);

const predictions = [
  { label: 'meningioma', probability: 0.95 },
  { label: 'glioma', probability: 0.03 },
  { label: 'notumor', probability: 0.01 },
  { label: 'pituitary', probability: 0.01 },
];

// The statement of the migration that fills the center, read from the file:
// what is tested is the SQL that was shipped.
function readBackfill(): string {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20261023152459_clinical_reports',
      'migration.sql',
    ),
    'utf8',
  );
  const start = sql.indexOf('INSERT INTO `clinical_reports`');
  if (start < 0) throw new Error('The backfill is not in the migration.');
  const statement = sql.slice(start).trim();
  // One statement, to the end of the file.
  expect(statement.endsWith(';')).toBe(true);
  expect(statement.slice(0, -1)).not.toContain(';');
  return statement;
}

describeWithDatabase('the report of an AI analysis against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reports: AiAnalysisReportsService;
  let fixtures: IntegrationFixtures;
  let actor: AuthenticatedUserPayload;
  let doctorId = '';
  let doctorProfileId = '';
  let workspaceId = '';
  let patientId = '';
  let sourceDocumentId = '';
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-ai-link-'));
  // A year that no real report uses, for the rows written by hand.
  const HAND_MADE = 'CR-IA-2098-';

  const decidedRun = (
    pipeline: string,
    forPatient = patientId,
    document = sourceDocumentId,
  ) =>
    prisma.aiAnalysisRun.create({
      data: {
        decidedAt: new Date(),
        decidedById: doctorId,
        decisionLabel: pipeline === 'brain' ? 'meningioma' : null,
        decisionStatus: 'VALIDATED',
        durationMs: 1200,
        patientId: forPatient,
        pipeline,
        predictions: pipeline === 'brain' ? predictions : undefined,
        requestedById: doctorId,
        sourceDocumentId: document,
        status: 'SUCCEEDED',
      },
    });

  const reportOf = (runId: string, reportNumber: string) =>
    prisma.aiAnalysisReport.create({
      data: {
        contentSha256: 'c'.repeat(64),
        filePath: join(uploadRoot, `${reportNumber}.pdf`),
        generatedById: doctorId,
        reportNumber,
        runId,
        sha256: 'd'.repeat(64),
        sizeBytes: 1_000,
      },
    });

  const storedPdfs = () =>
    readdirSync(uploadRoot, { recursive: true })
      .map(String)
      .filter((name) => /CR-IA-\d{4}-\d{6}.*\.pdf$/.test(name));

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    process.env.UPLOAD_ROOT = uploadRoot;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AiAnalysisRunsModule,
      ],
    })
      .overrideProvider(AiReportRenderer)
      .useValue(new FakePdfRenderer())
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    reports = moduleRef.get(AiAnalysisReportsService, { strict: false });
    fixtures = new IntegrationFixtures(prisma, 'airep');

    const doctor = await fixtures.independentDoctor();
    actor = doctor.actor;
    doctorId = doctor.user.id;
    doctorProfileId = doctor.profile.id;
    workspaceId = doctor.workspace.id;
    patientId = (await fixtures.patient(workspaceId, doctorProfileId)).id;

    const imagePath = join(uploadRoot, 'irm.png');
    writeFileSync(imagePath, PNG);
    sourceDocumentId = (
      await prisma.patientDocument.create({
        data: {
          documentType: 'MEDICAL_IMAGE',
          localPath: imagePath,
          mimeType: 'image/png',
          originalName: 'irm.png',
          patientId,
          size: PNG.length,
          storedName: 'irm.png',
          uploadedById: doctorId,
        },
      })
    ).id;
    await prisma.aiAnalysisReport.deleteMany({
      where: { reportNumber: { startsWith: HAND_MADE } },
    });
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.aiAnalysisReport.deleteMany({
        where: { reportNumber: { startsWith: HAND_MADE } },
      });
      await fixtures?.cleanup();
    }
    await moduleRef?.close();
    rmSync(uploadRoot, { force: true, recursive: true });
  }, 60_000);

  afterEach(() => {
    mockedBuild.mockClear();
  });

  describe('when the report is generated', () => {
    it('stores the clinical report with it, FINAL, of the category of the pipeline', async () => {
      const run = await decidedRun('brain');

      const served = await reports.getReport(actor, patientId, run.id);

      expect(served.reportNumber).toMatch(/^CR-IA-\d{4}-\d{6}$/);
      const aiReport = await prisma.aiAnalysisReport.findUniqueOrThrow({
        where: { runId: run.id },
      });
      expect(aiReport.reportNumber).toBe(served.reportNumber);
      const clinical = await prisma.clinicalReport.findMany({
        where: { aiAnalysisReportId: aiReport.id },
      });
      expect(clinical).toHaveLength(1);
      expect(clinical[0]).toMatchObject({
        authorId: doctorId,
        category: 'AI_BRAIN',
        contentFingerprint: aiReport.contentSha256,
        number: aiReport.reportNumber,
        patientId,
        sourceType: 'AI_ANALYSIS',
        status: 'FINAL',
        version: 1,
        workspaceId,
      });
    });

    it('serves the same report again without storing a second row', async () => {
      const run = await decidedRun('brain');
      const first = await reports.getReport(actor, patientId, run.id);
      const second = await reports.getReport(actor, patientId, run.id);

      expect(second.reportNumber).toBe(first.reportNumber);
      expect(
        await prisma.clinicalReport.count({
          where: { aiAnalysisReport: { runId: run.id } },
        }),
      ).toBe(1);
    });

    it('stores neither of the two when the second insert fails, and the PDF file goes too', async () => {
      const run = await decidedRun('brain');
      const clinicalBefore = await prisma.clinicalReport.count({
        where: { patientId },
      });
      const pdfsBefore = storedPdfs().length;
      // The clinical report points at a workspace that does not exist: the
      // database refuses it after the AI report was inserted.
      mockedBuild.mockImplementationOnce((input) => {
        const real = jest
          .requireActual<
            typeof import('./ai-clinical-report')
          >('./ai-clinical-report')
          .buildAiClinicalReport(input);
        return {
          ...(real as object),
          workspaceId: 'no-such-workspace',
        } as never;
      });

      await expect(
        reports.getReport(actor, patientId, run.id),
      ).rejects.toMatchObject({ code: 'P2003' });

      expect(mockedBuild).toHaveBeenCalledTimes(1);
      expect(
        await prisma.aiAnalysisReport.count({ where: { runId: run.id } }),
      ).toBe(0);
      expect(await prisma.clinicalReport.count({ where: { patientId } })).toBe(
        clinicalBefore,
      );
      expect(storedPdfs()).toHaveLength(pdfsBefore);

      // Nothing was left half done: the next request makes both.
      const served = await reports.getReport(actor, patientId, run.id);
      expect(
        await prisma.clinicalReport.count({
          where: { aiAnalysisReport: { runId: run.id } },
        }),
      ).toBe(1);
      expect(served.reportNumber).toMatch(/^CR-IA-\d{4}-\d{6}$/);
      expect(storedPdfs()).toHaveLength(pdfsBefore + 1);
    });
  });

  describe('the backfill of the migration', () => {
    const PIPELINES = [
      'brain',
      'cardio-ecg',
      'cardio-seg-mri',
      'pathology-breast',
      'pathology-nuclei',
    ];
    const created: Array<{ id: string; pipeline: string }> = [];
    let legacyReportId = '';

    beforeAll(async () => {
      // Reports with no clinical row, as they were before the migration.
      for (const [index, pipeline] of PIPELINES.entries()) {
        const run = await decidedRun(pipeline);
        const report = await reportOf(
          run.id,
          `${HAND_MADE}${String(index + 1).padStart(6, '0')}`,
        );
        created.push({ id: report.id, pipeline });
      }
      // A patient of the first versions has no workspace: no row for it.
      const legacy = await prisma.patient.create({
        data: {
          address: 'Alger',
          birthDate: new Date('1970-01-01T00:00:00Z'),
          commune: 'Alger',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '0550000000',
          firstName: 'Ancien',
          firstNameAr: 'قديم',
          gender: 'MALE',
          insurance: 'CNAS',
          lastName: 'Patient',
          lastNameAr: 'مريض',
          nationalId: `NID-legacy-${fixtures.suffix}`,
          phone: '0550000000',
          sector: 'PUBLIC',
          wilaya: 'Alger',
          workspaceId: null,
        },
      });
      fixtures.created.patients.push(legacy.id);
      const legacyDocument = await prisma.patientDocument.create({
        data: {
          documentType: 'MEDICAL_IMAGE',
          localPath: join(uploadRoot, 'irm.png'),
          mimeType: 'image/png',
          originalName: 'irm.png',
          patientId: legacy.id,
          size: PNG.length,
          storedName: 'irm.png',
          uploadedById: doctorId,
        },
      });
      const legacyRun = await decidedRun('brain', legacy.id, legacyDocument.id);
      legacyReportId = (
        await reportOf(
          legacyRun.id,
          `${HAND_MADE}${String(99).padStart(6, '0')}`,
        )
      ).id;
    });

    const rowsOf = (ids: string[]) =>
      prisma.clinicalReport.findMany({
        orderBy: { number: 'asc' },
        where: { aiAnalysisReportId: { in: ids } },
      });

    it('gives each report its row, the same as the service gives', async () => {
      const ids = created.map((report) => report.id);
      expect(await rowsOf(ids)).toHaveLength(0);

      await prisma.$executeRawUnsafe(readBackfill());

      const rows = await rowsOf(ids);
      expect(rows).toHaveLength(PIPELINES.length);
      for (const [index, pipeline] of PIPELINES.entries()) {
        const row = rows[index];
        const aiReport = await prisma.aiAnalysisReport.findUniqueOrThrow({
          include: { run: true },
          where: { id: created[index].id },
        });
        expect(row).toMatchObject({
          aiAnalysisReportId: aiReport.id,
          authorId: doctorId,
          contentFingerprint: aiReport.contentSha256,
          finalizedById: doctorId,
          number: aiReport.reportNumber,
          patientId,
          sourceType: 'AI_ANALYSIS',
          status: 'FINAL',
          version: 1,
          workspaceId,
        });
        expect(row.effectiveAt).toEqual(aiReport.run.createdAt);
        expect(row.patientSnapshot).toMatchObject({ gender: 'FEMALE' });
        // The SQL and the code that fills the center afterwards agree.
        expect(row.category).toBe(aiReportCategory(pipeline));
        expect(row.title).toBe(aiReportTitle(pipeline));
        const rebuilt = buildAiClinicalReport({
          aiReport,
          run: {
            ...aiReport.run,
            decidedBy: {
              doctorProfile: { speciality: 'Médecine interne' },
              fullName: (
                await prisma.user.findUniqueOrThrow({ where: { id: doctorId } })
              ).fullName,
              id: doctorId,
            },
            patient: await prisma.patient.findUniqueOrThrow({
              where: { id: patientId },
            }),
          },
        });
        expect(rebuilt).toMatchObject({
          category: row.category,
          status: row.status,
          title: row.title,
        });
      }
    });

    it('leaves out the report of a patient with no workspace', async () => {
      expect(await rowsOf([legacyReportId])).toHaveLength(0);
    });

    it('can run again without changing anything', async () => {
      const ids = created.map((report) => report.id);
      const before = await rowsOf(ids);

      await prisma.$executeRawUnsafe(readBackfill());
      await prisma.$executeRawUnsafe(readBackfill());

      const after = await rowsOf(ids);
      expect(after).toHaveLength(PIPELINES.length);
      expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
      expect(
        await prisma.clinicalReport.count({
          where: { aiAnalysisReportId: { in: [...ids, legacyReportId] } },
        }),
      ).toBe(PIPELINES.length);
    });
  });
});
