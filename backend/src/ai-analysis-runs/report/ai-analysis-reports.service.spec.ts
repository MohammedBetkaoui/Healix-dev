import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { join } from 'node:path';

import { UserRole } from '../../common/enums/user-role.enum';
import { createSha256Checksum } from '../../common/utils/checksum.util';
import { type PatientFileStorageService } from '../../patients/documents/patient-file-storage.service';
import { type PatientAuditService } from '../../patients/patient-audit.service';
import { type PatientsService } from '../../patients/patients.service';
import { type PrismaService } from '../../prisma/prisma.service';
import {
  AiAnalysisReportsService,
  getReportUnavailableReason,
  nextReportNumber,
  reportYear,
} from './ai-analysis-reports.service';
import { type AiReportRenderer } from './ai-report-renderer';

const doctor = {
  email: 'doctor-a@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'doctor-a',
  tokenType: 'access' as const,
};

const EVALUATION_PATH = join(
  __dirname,
  '../../../../ai-service/evaluation/brain-latest.json',
);
const MEASURED_SHA =
  '311d2cbb171266721871f46f7f841b1dffef0c0fec40853745f55be9939ae654';
const NATIONAL_ID = '123456789098765432';
const PATIENT_PHONE = '0555123456';

// A tiny PNG header: enough for the image size reader.
const IMAGE = (() => {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(291, 16);
  header.writeUInt32BE(340, 20);
  return header;
})();

const person = (
  fullName: string,
  role: UserRole,
  speciality: string | null,
) => ({
  doctorProfile: speciality ? { speciality } : null,
  fullName,
  role,
});

// As Prisma would answer, including fields the report must never print (a
// careless mapping would leak them).
const run = (overrides: Record<string, unknown> = {}) => ({
  classificationModelId: 'brain-efficientnetb4-tumor-classification',
  classificationWeightsSha256: MEASURED_SHA,
  clinicianImpression: 'Lésion extra-axiale.',
  createdAt: new Date('2026-10-09T15:04:24Z'),
  decidedAt: new Date('2026-10-09T15:20:00Z'),
  decidedBy: person('Amel Benaïssa', UserRole.INDEPENDENT_DOCTOR, 'Radiologie'),
  decidedById: 'doctor-a',
  decisionLabel: 'meningioma',
  decisionReason: null,
  decisionStatus: 'VALIDATED',
  durationMs: 313,
  id: 'run-1',
  maskAreaPx: null,
  maskAreaRatio: null,
  maskPath: null,
  patient: {
    birthDate: new Date('1984-03-27T00:00:00Z'),
    doctorProfile: null,
    establishment: null,
    firstName: 'Karim',
    gender: 'MALE',
    hospitalRecordNumber: null,
    id: 'patient-a',
    lastName: 'Haddad',
    nationalId: NATIONAL_ID,
    phone: PATIENT_PHONE,
    workspace: {
      establishment: null,
      ownerDoctorProfile: {
        professionalAddress: '3 rue Didouche',
        speciality: 'Neurochirurgie',
        user: { fullName: 'Samir Kaci' },
        wilaya: 'Oran',
      },
      type: 'PRIVATE_PRACTICE',
    },
  },
  patientId: 'patient-a',
  predictions: [
    { label: 'meningioma', probability: 0.887 },
    { label: 'glioma', probability: 0.113 },
  ],
  requestedBy: person(
    'Amel Benaïssa',
    UserRole.INDEPENDENT_DOCTOR,
    'Radiologie',
  ),
  segmentationModelId: null,
  segmentationSkippedReason: 'model_not_loaded',
  segmentationWeightsSha256: null,
  sourceDocument: {
    checksum: 'c'.repeat(64),
    createdAt: new Date('2026-10-08T09:12:00Z'),
    localPath: '/uploads/patients/patient-a/documents/image.png',
    mimeType: 'image/png',
    originalName: 'irm.png',
  },
  status: 'SUCCEEDED',
  ...overrides,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    clientVersion: 'test',
    code: 'P2002',
  });

describe('AiAnalysisReportsService (GET .../ai-analysis-runs/:runId/report)', () => {
  const runFindFirst = jest.fn();
  const reportFindUnique = jest.fn();
  const reportFindFirst = jest.fn();
  const reportCreate = jest.fn();
  const getPatientInScope = jest.fn();
  const readStoredFile = jest.fn();
  const storeAiReport = jest.fn();
  const deleteLocalFile = jest.fn();
  const log = jest.fn();
  const render = jest.fn();

  const service = new AiAnalysisReportsService(
    {
      aiAnalysisReport: {
        create: reportCreate,
        findFirst: reportFindFirst,
        findUnique: reportFindUnique,
      },
      aiAnalysisRun: { findFirst: runFindFirst },
    } as unknown as PrismaService,
    { getPatientInScope } as unknown as PatientsService,
    {
      deleteLocalFile,
      readStoredFile,
      storeAiReport,
    } as unknown as PatientFileStorageService,
    { log } as unknown as PatientAuditService,
    { render } as unknown as AiReportRenderer,
    {
      get: (key: string) =>
        key === 'AI_EVALUATION_REPORT_PATH' ? EVALUATION_PATH : undefined,
    } as unknown as ConfigService,
  );

  // The stored files, by path.
  let disk: Map<string, Buffer>;
  let stored = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    disk = new Map([
      ['/uploads/patients/patient-a/documents/image.png', IMAGE],
    ]);
    stored = 0;
    getPatientInScope.mockResolvedValue({ id: 'patient-a' });
    log.mockResolvedValue(undefined);
    reportFindFirst.mockResolvedValue(null);
    reportFindUnique.mockResolvedValue(null);
    render.mockImplementation(({ html }: { html: string }) =>
      Promise.resolve(
        Buffer.from(`%PDF-1.7 ${createSha256Checksum(Buffer.from(html))}`),
      ),
    );
    readStoredFile.mockImplementation((path: string) => {
      const file = disk.get(path);
      return file
        ? Promise.resolve(file)
        : Promise.reject(new NotFoundException('Document introuvable.'));
    });
    storeAiReport.mockImplementation(
      ({ pdf, reportNumber }: { pdf: Buffer; reportNumber: string }) => {
        stored += 1;
        const localPath = `/uploads/patients/patient-a/ai-reports/${reportNumber}-${stored}.pdf`;
        disk.set(localPath, pdf);
        return Promise.resolve({
          checksum: createSha256Checksum(pdf),
          localPath,
        });
      },
    );
    deleteLocalFile.mockImplementation((path: string) => {
      disk.delete(path);
      return Promise.resolve();
    });
    reportCreate.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          createdAt: new Date(),
          id: `report-${String(data.reportNumber)}`,
          ...data,
        }),
    );
  });

  const renderedHtml = () =>
    (
      render.mock.lastCall as [
        { html: string; headerTemplate: string; footerTemplate: string },
      ]
    )[0];
  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as HttpException;
    }
    throw new Error('expected an error');
  };

  describe('availability', () => {
    it.each([
      ['VALIDATED', 'SUCCEEDED'],
      ['CORRECTED', 'SUCCEEDED'],
    ])('is available for a %s, %s run', async (decisionStatus, status) => {
      runFindFirst.mockResolvedValue(
        run({ decisionLabel: 'meningioma', decisionStatus, status }),
      );

      const report = await service.getReport(doctor, 'patient-a', 'run-1');

      expect(report.pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(report.fileName).toBe(`${report.reportNumber}.pdf`);
    });

    it.each([
      [{ decisionStatus: 'REJECTED', decisionLabel: null }, 'REJECTED'],
      [{ decisionStatus: null, decisionLabel: null }, 'NOT_DECIDED'],
      [{ status: 'FAILED', decisionStatus: null }, 'RUN_NOT_SUCCEEDED'],
      [{ status: 'RUNNING', decisionStatus: null }, 'RUN_NOT_SUCCEEDED'],
    ])(
      'answers 409 AI_REPORT_NOT_AVAILABLE for %o (%s)',
      async (overrides, reason) => {
        runFindFirst.mockResolvedValue(run(overrides));

        const error = await errorOf(
          service.getReport(doctor, 'patient-a', 'run-1'),
        );

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toEqual(
          expect.objectContaining({ code: 'AI_REPORT_NOT_AVAILABLE', reason }),
        );
        expect(render).not.toHaveBeenCalled();
        expect(storeAiReport).not.toHaveBeenCalled();
      },
    );

    it('gives the reason of a missing report', () => {
      expect(
        getReportUnavailableReason({
          decisionStatus: 'CORRECTED',
          status: 'SUCCEEDED',
        }),
      ).toBeNull();
      expect(
        getReportUnavailableReason({
          decisionStatus: 'VALIDATED',
          status: 'FAILED',
        }),
      ).toBe('RUN_NOT_SUCCEEDED');
    });
  });

  it('generates once, then serves the very same stored file', async () => {
    runFindFirst.mockResolvedValue(run());

    const first = await service.getReport(doctor, 'patient-a', 'run-1');
    const created = (
      reportCreate.mock.lastCall as [{ data: Record<string, unknown> }]
    )[0].data;
    reportFindUnique.mockResolvedValue({
      createdAt: new Date(),
      id: 'report-1',
      ...created,
    });
    const second = await service.getReport(doctor, 'patient-a', 'run-1');

    expect(render).toHaveBeenCalledTimes(1);
    expect(storeAiReport).toHaveBeenCalledTimes(1);
    expect(second.reportNumber).toBe(first.reportNumber);
    expect(createSha256Checksum(second.pdf)).toBe(
      createSha256Checksum(first.pdf),
    );
    expect(created).toEqual(
      expect.objectContaining({
        generatedById: 'doctor-a',
        runId: 'run-1',
        sha256: createSha256Checksum(first.pdf),
        sizeBytes: first.pdf.length,
      }),
    );
    expect(log.mock.calls.map((call: unknown[]) => call[1])).toEqual([
      'AI_ANALYSIS_REPORT_GENERATED',
      'AI_ANALYSIS_REPORT_DOWNLOADED',
    ]);
  });

  it('refuses a stored file that no longer matches its SHA-256', async () => {
    runFindFirst.mockResolvedValue(run());
    disk.set('/tampered.pdf', Buffer.from('%PDF changed'));
    reportFindUnique.mockResolvedValue({
      filePath: '/tampered.pdf',
      id: 'r',
      reportNumber: 'CR-IA-2026-000001',
      runId: 'run-1',
      sha256: 'f'.repeat(64),
    });

    const error = await errorOf(
      service.getReport(doctor, 'patient-a', 'run-1'),
    );

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_REPORT_INTEGRITY_FAILED' }),
    );
  });

  describe('numbering, sequential within the year', () => {
    it('follows the last number of the year', async () => {
      runFindFirst.mockResolvedValue(run());
      const year = reportYear(new Date());
      reportFindFirst.mockResolvedValue({
        reportNumber: `CR-IA-${year}-000041`,
      });

      const report = await service.getReport(doctor, 'patient-a', 'run-1');

      expect(report.reportNumber).toBe(`CR-IA-${year}-000042`);
      expect(reportFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { reportNumber: 'desc' },
          where: { reportNumber: { startsWith: `CR-IA-${year}-` } },
        }),
      );
    });

    it('starts again at 000001 each year', () => {
      expect(nextReportNumber('2027', null)).toBe('CR-IA-2027-000001');
      expect(nextReportNumber('2027', 'CR-IA-2026-000917')).toBe(
        'CR-IA-2027-000001',
      );
      expect(nextReportNumber('2026', 'CR-IA-2026-000917')).toBe(
        'CR-IA-2026-000918',
      );
      // The year follows Algeria's time: 31 December 23:30 UTC is already 2027 there.
      expect(reportYear(new Date('2026-12-31T23:30:00Z'))).toBe('2027');
    });

    it('takes the next number when another run took this one meanwhile', async () => {
      runFindFirst.mockResolvedValue(run());
      const year = reportYear(new Date());
      reportFindFirst
        .mockResolvedValueOnce({ reportNumber: `CR-IA-${year}-000004` })
        .mockResolvedValueOnce({ reportNumber: `CR-IA-${year}-000005` });
      reportCreate.mockRejectedValueOnce(uniqueViolation());

      const report = await service.getReport(doctor, 'patient-a', 'run-1');

      expect(report.reportNumber).toBe(`CR-IA-${year}-000006`);
      expect(render).toHaveBeenCalledTimes(2); // the number is printed: rendered again
      expect(deleteLocalFile).toHaveBeenCalledTimes(1);
      expect(
        disk.has(
          `/uploads/patients/patient-a/ai-reports/CR-IA-${year}-000005-1.pdf`,
        ),
      ).toBe(false);
    });
  });

  it('makes two simultaneous first requests share one report', async () => {
    runFindFirst.mockResolvedValue(run());
    const winnerPdf = Buffer.from('%PDF winner');
    disk.set('/winner.pdf', winnerPdf);
    const winner = {
      filePath: '/winner.pdf',
      id: 'report-winner',
      reportNumber: 'CR-IA-2026-000003',
      runId: 'run-1',
      sha256: createSha256Checksum(winnerPdf),
    };
    // The other request stored its row between our check and our insert.
    reportFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    reportCreate.mockRejectedValueOnce(uniqueViolation());

    const report = await service.getReport(doctor, 'patient-a', 'run-1');

    expect(report.reportNumber).toBe('CR-IA-2026-000003');
    expect(report.pdf).toEqual(winnerPdf);
    expect(reportCreate).toHaveBeenCalledTimes(1);
    expect(deleteLocalFile).toHaveBeenCalledTimes(1); // our own file is removed
    expect(
      [...disk.keys()].filter((path) => path.includes('ai-reports')),
    ).toEqual([]);
    expect(log).toHaveBeenLastCalledWith(
      doctor,
      'AI_ANALYSIS_REPORT_DOWNLOADED',
      'report-winner',
      expect.anything(),
    );
  });

  it('answers 404 for a run of another patient', async () => {
    runFindFirst.mockResolvedValue(null);

    await expect(
      service.getReport(doctor, 'patient-a', 'run-of-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-of-b', patientId: 'patient-a' },
      }),
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('prints no figure for weights the evaluation report did not measure', async () => {
    runFindFirst.mockResolvedValue(
      run({ classificationWeightsSha256: 'a'.repeat(64) }),
    );

    await service.getReport(doctor, 'patient-a', 'run-1');

    const { html } = renderedHtml();
    expect(html).toContain(
      'Performances non mesurées pour cette version des modèles.',
    );
    expect(html).not.toContain('Exactitude :');
    expect(html).not.toContain('Résultat incertain');
  });

  it('prints the measured figures for the measured weights', async () => {
    runFindFirst.mockResolvedValue(run());

    await service.getReport(doctor, 'patient-a', 'run-1');

    expect(renderedHtml().html).toContain('Exactitude : 95,5');
  });

  it('never prints the national identity number nor the phone, nor any urgency, delay or suggested specialist', async () => {
    runFindFirst.mockResolvedValue(run());

    await service.getReport(doctor, 'patient-a', 'run-1');

    const { html, headerTemplate, footerTemplate } = renderedHtml();
    const text = `${html}${headerTemplate}${footerTemplate}`;
    expect(text).not.toContain(NATIONAL_ID);
    expect(text).not.toContain(PATIENT_PHONE);
    expect(text.toLowerCase()).not.toContain('urgence');
    expect(text.toLowerCase()).not.toContain('délai');
    expect(text.toLowerCase()).not.toContain('spécialiste suggéré');
    // The private practice heads every page.
    expect(headerTemplate).toContain('Dr Samir Kaci');
  });

  it('stores nothing when the PDF cannot be rendered (500 AI_REPORT_RENDER_FAILED)', async () => {
    runFindFirst.mockResolvedValue(run());
    render.mockRejectedValueOnce(new Error('Executable does not exist'));

    const error = await errorOf(
      service.getReport(doctor, 'patient-a', 'run-1'),
    );

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'AI_REPORT_RENDER_FAILED' }),
    );
    expect(storeAiReport).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
