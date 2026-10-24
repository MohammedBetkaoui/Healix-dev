import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { chromium } from 'playwright';

import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentsService } from '../appointments/appointments.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import {
  assertTestDatabaseName,
  FakePdfRenderer,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { numberingYear } from '../common/utils/clinical-document-number';
import { PatientsModule } from '../patients/patients.module';
import { PatientsService } from '../patients/patients.service';
import { type CreatePrescriptionDto } from '../prescriptions/dto/create-prescription.dto';
import { ListPrescriptionsQueryDto } from '../prescriptions/dto/list-prescriptions-query.dto';
import { type UpdatePrescriptionDto } from '../prescriptions/dto/update-prescription.dto';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { type CreateReportDto } from '../reports/dto/create-report.dto';
import { ListReportsQueryDto } from '../reports/dto/list-reports-query.dto';
import { ReportsModule } from '../reports/reports.module';
import { ReportsService } from '../reports/reports.service';
import { ConsultationsModule } from './consultations.module';
import { ConsultationsService } from './consultations.service';
import { ListConsultationsQueryDto } from './dto/list-consultations-query.dto';

// The day of the defense, on a migrated database: an appointment is finished,
// its consultation recorded, then a prescription is written and validated,
// and a report is written, finalized and amended, with the real services,
// the real queries and the real constraints. Another workspace sees none of
// it, and what is validated cannot be changed. TEST_DATABASE_URL names a
// database ending in "_test"; the spec is skipped without it. The PDFs go
// through Chromium where it is installed, and are simulated elsewhere.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const chromiumInstalled = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code?: string }).code;

const items = (names: string[]) =>
  names.map((dci) => ({
    dci,
    dosePerIntake: '1 comprimé',
    durationDays: 5,
    frequency: '2 fois par jour',
    pharmaceuticalForm: 'TABLET',
    quantity: '10 comprimés',
    regulatoryCategory: 'STANDARD',
    route: 'ORAL',
    strength: '500 mg',
  }));

describeWithDatabase('the clinical flow against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let patients: PatientsService;
  let appointments: AppointmentsService;
  let consultations: ConsultationsService;
  let prescriptions: PrescriptionsService;
  let reports: ReportsService;
  let fixtures: IntegrationFixtures;
  const fakePdf = new FakePdfRenderer();
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-flow-'));

  let doctorA: AuthenticatedUserPayload;
  let doctorB: AuthenticatedUserPayload;
  let patientA = '';
  let patientB = '';
  let appointmentId = '';
  let consultationId = '';
  let prescriptionId = '';
  let reportV1 = '';
  let reportV2 = '';
  let consultationOfB = '';
  const year = numberingYear(new Date());

  const page = <T extends object>(dto: new () => T) => plainToInstance(dto, {});

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    process.env.UPLOAD_ROOT = uploadRoot;
    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PatientsModule,
        AppointmentsModule,
        ConsultationsModule,
        PrescriptionsModule,
        ReportsModule,
      ],
    });
    moduleRef = await (
      chromiumInstalled
        ? builder
        : builder.overrideProvider(AiReportRenderer).useValue(fakePdf)
    ).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    patients = moduleRef.get(PatientsService);
    appointments = moduleRef.get(AppointmentsService);
    consultations = moduleRef.get(ConsultationsService);
    prescriptions = moduleRef.get(PrescriptionsService);
    reports = moduleRef.get(ReportsService);
    fixtures = new IntegrationFixtures(prisma, 'flow');

    // Two private practices: two workspaces that must not see each other.
    const a = await fixtures.independentDoctor();
    const b = await fixtures.independentDoctor();
    doctorA = a.actor;
    doctorB = b.actor;
    patientA = (await fixtures.patient(a.workspace.id, a.profile.id)).id;
    patientB = (await fixtures.patient(b.workspace.id, b.profile.id)).id;
    appointmentId = (
      await fixtures.appointment(
        patientA,
        a.profile.id,
        a.user.id,
        new Date(Date.now() - 3_600_000),
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await moduleRef?.close();
    rmSync(uploadRoot, { force: true, recursive: true });
  }, 60_000);

  it('records the consultation of a finished appointment, and lists it with its appointment', async () => {
    const finished = await appointments.update(doctorA, appointmentId, {
      status: 'COMPLETED',
    });
    expect(finished.status).toBe('COMPLETED');

    const consultation = await patients.createConsultation(doctorA, patientA, {
      appointmentId,
      date: new Date().toISOString(),
      diagnosis: 'Angor stable',
      reason: 'Douleur thoracique à l’effort',
      treatment: 'Bêtabloquant',
    });
    consultationId = consultation.id;
    expect(consultation.appointmentId).toBe(appointmentId);

    const list = await consultations.list(
      doctorA,
      page(ListConsultationsQueryDto),
    );
    expect(list.data.map((row) => row.id)).toEqual([consultationId]);
    expect(list.meta.total).toBe(1);
    expect(list.data[0].appointmentId).toBe(appointmentId);

    const detail = await consultations.findOne(doctorA, consultationId);
    expect(detail.appointment).toMatchObject({
      id: appointmentId,
      status: 'COMPLETED',
    });
    expect(detail.prescriptions).toEqual([]);
    expect(detail.reports).toEqual([]);
  });

  it('refuses a second consultation for the same appointment', async () => {
    const error = await errorOf(
      patients.createConsultation(doctorA, patientA, {
        appointmentId,
        date: new Date().toISOString(),
        diagnosis: 'Autre',
        reason: 'Autre',
        treatment: 'Autre',
      }),
    );
    expect(error.getStatus()).toBe(409);
  });

  it('writes, submits and validates a prescription of two medications from the consultation', async () => {
    const draft = await prescriptions.create(doctorA, {
      encounterId: consultationId,
      items: items(['Paracétamol', 'Amoxicilline']),
      patientId: patientA,
    } as unknown as CreatePrescriptionDto);
    prescriptionId = draft.id;
    expect(draft.status).toBe('DRAFT');
    expect(draft.items).toHaveLength(2);
    expect(draft.number).toBeNull();

    const submitted = await prescriptions.submit(doctorA, prescriptionId);
    expect(submitted.status).toBe('PENDING_VALIDATION');

    const validated = await prescriptions.validate(doctorA, prescriptionId);
    expect(validated.status).toBe('VALIDATED');
    expect(validated.number).toMatch(new RegExp(`^ORD-${year}-\\d{6}$`));
    expect(validated.items.map((item) => item.medication.dci)).toEqual([
      'Paracétamol',
      'Amoxicilline',
    ]);

    // What was frozen: the snapshots, the fingerprint of the content, the
    // PDF, and its copy in the record of the patient.
    const row = await prisma.prescription.findUniqueOrThrow({
      include: { document: true },
      where: { id: prescriptionId },
    });
    expect(row.encounterId).toBe(consultationId);
    expect(row.contentFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(row.document?.contentFingerprint).toBe(row.contentFingerprint);
    expect(row.patientSnapshot).toMatchObject({ gender: 'FEMALE' });
    expect(row.prescriberSnapshot).toMatchObject({
      regionalCouncil: "Conseil régional d'Alger",
    });
    const recordCopies = await prisma.patientDocument.findMany({
      where: { prescriptionId },
    });
    expect(recordCopies).toHaveLength(1);
    expect(recordCopies[0]).toMatchObject({
      checksum: row.document?.checksum,
      documentType: 'PRESCRIPTION',
      patientId: patientA,
    });

    const pdf = await prescriptions.getPdf(doctorA, prescriptionId);
    expect(pdf.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    if (chromiumInstalled) expect(pdf.pdf.length).toBeGreaterThan(5_000);
  }, 60_000);

  it('keeps the frozen data when the patient is renamed afterwards', async () => {
    const before = await prisma.prescription.findUniqueOrThrow({
      where: { id: prescriptionId },
    });
    await prisma.patient.update({
      data: { lastName: 'Renommée' },
      where: { id: patientA },
    });

    const shown = await prescriptions.findOne(doctorA, prescriptionId);
    const after = await prisma.prescription.findUniqueOrThrow({
      where: { id: prescriptionId },
    });

    expect(shown.patient.lastName).toBe(
      (before.patientSnapshot as { lastName: string }).lastName,
    );
    expect(shown.patient.lastName).not.toBe('Renommée');
    expect(after.patientSnapshot).toEqual(before.patientSnapshot);
    expect(after.contentFingerprint).toBe(before.contentFingerprint);
  });

  it('writes a report from the consultation, finalizes it, then amends it into a version 2', async () => {
    const draft = await reports.create(doctorA, {
      category: 'CONSULTATION_NOTE',
      encounterId: consultationId,
      patientId: patientA,
      sections: [
        { body: 'Douleur à l’effort depuis deux semaines.', id: 'reason' },
        { body: 'ECG sans particularité.', id: 'findings' },
      ],
      title: 'Compte rendu de consultation',
    } as unknown as CreateReportDto);
    reportV1 = draft.id;
    expect(draft).toMatchObject({
      category: 'CONSULTATION_NOTE',
      status: 'DRAFT',
      version: 1,
    });

    const final = await reports.finalize(doctorA, reportV1);
    expect(final.status).toBe('FINAL');
    expect(final.number).toMatch(new RegExp(`^CR-${year}-\\d{6}$`));

    const amendment = await reports.amend(doctorA, reportV1);
    reportV2 = amendment.id;
    expect(amendment).toMatchObject({ status: 'DRAFT', version: 2 });
    await reports.update(doctorA, reportV2, {
      conclusion: 'Angor stable, traitement poursuivi.',
    });
    const amended = await reports.finalize(doctorA, reportV2);

    expect(amended.status).toBe('AMENDED');
    expect(amended.version).toBe(2);
    expect(amended.number).toMatch(new RegExp(`^CR-${year}-\\d{6}$`));
    expect(amended.number).not.toBe(final.number);

    const [v1, v2] = await Promise.all([
      prisma.clinicalReport.findUniqueOrThrow({ where: { id: reportV1 } }),
      prisma.clinicalReport.findUniqueOrThrow({ where: { id: reportV2 } }),
    ]);
    expect(v1.supersededAt).toBeInstanceOf(Date);
    expect(v1.status).toBe('FINAL');
    expect(v2.supersededAt).toBeNull();
    expect(v2.replacesId).toBe(reportV1);
    expect(v2.encounterId).toBe(consultationId);

    // The list shows the current version only; the report knows both.
    const list = await reports.list(doctorA, page(ListReportsQueryDto));
    expect(list.data.map((row) => row.id)).toEqual([reportV2]);
    const { versions } = await reports.findOne(doctorA, reportV2);
    expect(versions.map((row) => [row.id, row.version, row.isCurrent])).toEqual(
      [
        [reportV1, 1, false],
        [reportV2, 2, true],
      ],
    );
    const events = (await reports.history(doctorA, reportV2)).map(
      (event) => event.action,
    );
    expect(events).toEqual(
      expect.arrayContaining([
        'REPORT_AMENDMENT_STARTED',
        'REPORT_PDF_GENERATED',
        'REPORT_FINALIZED',
      ]),
    );
  }, 60_000);

  it('shows the validated prescription and the current report in the consultation', async () => {
    const detail = await consultations.findOne(doctorA, consultationId);

    expect(detail.prescriptions.map((row) => row.id)).toEqual([prescriptionId]);
    expect(detail.prescriptions[0]).toMatchObject({
      effectiveStatus: 'VALIDATED',
      itemCount: 2,
    });
    // Version 2 only: version 1 is superseded.
    expect(detail.reports.map((row) => row.id)).toEqual([reportV2]);
    expect(detail.reports[0]).toMatchObject({
      status: 'AMENDED',
      version: 2,
    });
    expect(detail.appointment?.id).toBe(appointmentId);

    const list = await consultations.list(
      doctorA,
      page(ListConsultationsQueryDto),
    );
    expect(list.data[0]).toMatchObject({
      prescriptionCount: 1,
      reportCount: 1,
    });
  });

  it('shows nothing of it to a doctor of another workspace', async () => {
    consultationOfB = (
      await patients.createConsultation(doctorB, patientB, {
        date: new Date().toISOString(),
        diagnosis: 'Grippe',
        reason: 'Fièvre',
        treatment: 'Repos',
      })
    ).id;

    for (const attempt of [
      consultations.findOne(doctorB, consultationId),
      prescriptions.findOne(doctorB, prescriptionId),
      reports.findOne(doctorB, reportV2),
      reports.findOne(doctorB, reportV1),
    ]) {
      const error = await errorOf(attempt);
      expect(error.getStatus()).toBe(404);
    }

    // Their lists hold their own consultation only.
    const consultationList = await consultations.list(
      doctorB,
      page(ListConsultationsQueryDto),
    );
    expect(consultationList.data.map((row) => row.id)).toEqual([
      consultationOfB,
    ]);
    const prescriptionList = await prescriptions.list(
      doctorB,
      page(ListPrescriptionsQueryDto),
    );
    expect(prescriptionList.data).toEqual([]);
    const reportList = await reports.list(doctorB, page(ListReportsQueryDto));
    expect(reportList.data).toEqual([]);

    // Nor can they write about a patient of the other workspace.
    const error = await errorOf(
      prescriptions.create(doctorB, {
        items: items(['Paracétamol']),
        patientId: patientA,
      } as unknown as CreatePrescriptionDto),
    );
    expect(error.getStatus()).toBeGreaterThanOrEqual(403);
    expect(error.getStatus()).toBeLessThanOrEqual(404);
  });

  it('refuses to change a validated prescription or a finalized report, and changes nothing', async () => {
    const prescriptionBefore = await prisma.prescription.findUniqueOrThrow({
      include: { items: { orderBy: { position: 'asc' } } },
      where: { id: prescriptionId },
    });
    const reportBefore = await prisma.clinicalReport.findUniqueOrThrow({
      where: { id: reportV2 },
    });

    const attempts: Array<[Promise<unknown>, string]> = [
      [
        prescriptions.update(doctorA, prescriptionId, {
          items: items(['Ibuprofène']),
        } as unknown as UpdatePrescriptionDto),
        'PRESCRIPTION_NOT_EDITABLE',
      ],
      [
        prescriptions.remove(doctorA, prescriptionId),
        'PRESCRIPTION_NOT_EDITABLE',
      ],
      [
        prescriptions.submit(doctorA, prescriptionId),
        'PRESCRIPTION_NOT_EDITABLE',
      ],
      [
        reports.update(doctorA, reportV2, {
          title: 'Titre modifié',
        }),
        'REPORT_NOT_EDITABLE',
      ],
      [reports.remove(doctorA, reportV2), 'REPORT_NOT_EDITABLE'],
    ];
    for (const [attempt, code] of attempts) {
      const error = await errorOf(attempt);
      expect(error.getStatus()).toBe(409);
      expect(codeOf(error)).toBe(code);
    }

    expect(
      await prisma.prescription.findUniqueOrThrow({
        include: { items: { orderBy: { position: 'asc' } } },
        where: { id: prescriptionId },
      }),
    ).toEqual(prescriptionBefore);
    expect(
      await prisma.clinicalReport.findUniqueOrThrow({
        where: { id: reportV2 },
      }),
    ).toEqual(reportBefore);
  });

  it('renders the documents through the renderer', () => {
    if (chromiumInstalled) return;
    // Without Chromium: one PDF for the prescription, one for each version
    // of the report.
    expect(fakePdf.rendered).toBe(3);
  });
});
