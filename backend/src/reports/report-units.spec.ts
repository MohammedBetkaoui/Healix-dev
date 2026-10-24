import { Prisma } from '@prisma/client';

import { buildAiClinicalReport, aiReportCategory } from './ai-clinical-report';
import { type PrescriptionAuthorizationService } from '../prescriptions/prescription-authorization.service';
import { type WorkspaceContextService } from '../workspaces/workspace-context.service';
import {
  type ReportDetail,
  toReportDetail,
} from './mappers/report-response.mapper';
import { ReportAuthorizationService } from './report-authorization.service';
import { fingerprint } from './report-fingerprint';
import { ReportNumberService } from './report-number.service';
import { normalizeSections } from './reports.service';

describe('ReportNumberService', () => {
  // The counter is an INSERT ... ON DUPLICATE KEY UPDATE, then a read of its
  // value; its behavior on a database is in report-numbering.integration.spec.ts.
  const sequence = (values: number[]) => {
    const increment = jest.fn(() => Promise.resolve(1));
    const read = jest.fn(() =>
      Promise.resolve([{ last_value: values.shift() as number }]),
    );
    return {
      increment,
      transaction: {
        $executeRaw: increment,
        $queryRaw: read,
      } as unknown as Prisma.TransactionClient,
    };
  };
  const incrementedFor = (call: unknown[]) => call.slice(1);

  it('gives CR-<year>-<NNNNNN> from the CLINICAL_REPORT sequence of the year', async () => {
    const { increment, transaction } = sequence([1, 2, 42]);
    const service = new ReportNumberService();
    const at = new Date('2026-10-23T10:00:00Z');

    expect(await service.next(transaction, at)).toBe('CR-2026-000001');
    expect(await service.next(transaction, at)).toBe('CR-2026-000002');
    expect(await service.next(transaction, at)).toBe('CR-2026-000042');
    expect(increment.mock.calls.map(incrementedFor)).toEqual([
      ['CLINICAL_REPORT', 2026],
      ['CLINICAL_REPORT', 2026],
      ['CLINICAL_REPORT', 2026],
    ]);
  });

  it('counts the year in Algiers time: the last minutes of 31 December', async () => {
    const { increment, transaction } = sequence([1, 1]);
    const service = new ReportNumberService();

    // 23:30 UTC on 31 December is already 00:30 on 1 January in Algiers.
    expect(
      await service.next(transaction, new Date('2026-12-31T23:30:00Z')),
    ).toBe('CR-2027-000001');
    expect(
      await service.next(transaction, new Date('2026-12-31T22:30:00Z')),
    ).toBe('CR-2026-000001');
    expect(increment.mock.calls.map(incrementedFor)).toEqual([
      ['CLINICAL_REPORT', 2027],
      ['CLINICAL_REPORT', 2026],
    ]);
  });
});

describe('ReportAuthorizationService.capabilities', () => {
  const service = new ReportAuthorizationService(
    {} as WorkspaceContextService,
    {} as PrescriptionAuthorizationService,
  );

  it('gives a physician every report right but sharing, which has no endpoint', () => {
    for (const role of ['INDEPENDENT_DOCTOR', 'AFFILIATED_DOCTOR']) {
      expect(service.capabilities(role)).toEqual({
        canViewReports: true,
        canCreateReports: true,
        canFinalizeReports: true,
        canAmendReports: true,
        canDownloadReports: true,
        canPrintReports: true,
        canShareReports: false,
        canCancelReports: true,
      });
    }
  });

  it('lets the administration read, draft, import, download and print only', () => {
    expect(service.capabilities('ESTABLISHMENT_ADMIN')).toEqual({
      canViewReports: true,
      canCreateReports: true,
      canFinalizeReports: false,
      canAmendReports: false,
      canDownloadReports: true,
      canPrintReports: true,
      canShareReports: false,
      canCancelReports: false,
    });
  });

  it('gives any other role nothing', () => {
    expect(Object.values(service.capabilities('SUPER_ADMIN'))).not.toContain(
      true,
    );
  });
});

describe('fingerprint', () => {
  it('does not depend on the order of the keys, and changes with any value', () => {
    const base = {
      a: 1,
      b: { c: [1, 2], d: new Date('2026-10-23T10:00:00Z') },
    };
    const shuffled = {
      b: { d: new Date('2026-10-23T10:00:00Z'), c: [1, 2] },
      a: 1,
    };

    expect(fingerprint(base)).toBe(fingerprint(shuffled));
    expect(fingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint({ ...base, a: 2 })).not.toBe(fingerprint(base));
  });
});

describe('normalizeSections', () => {
  it('drops the empty sections, orders the others and gives them their title', () => {
    expect(
      normalizeSections([
        { id: 'recommendations', body: ' Repos ' },
        { id: 'reason', body: 'Fièvre' },
        { id: 'findings', body: '   ' },
      ]),
    ).toEqual([
      { id: 'reason', title: 'Motif', body: 'Fièvre' },
      { id: 'recommendations', title: 'Recommandations', body: 'Repos' },
    ]);
    expect(normalizeSections(undefined)).toEqual([]);
  });
});

describe('buildAiClinicalReport', () => {
  const aiReport = {
    id: 'ai-report-1',
    reportNumber: 'CR-IA-2026-000003',
    contentSha256: 'c'.repeat(64),
    createdAt: new Date('2026-10-09T15:30:00Z'),
    generatedById: 'doctor-requester',
  };
  const run = (overrides: Record<string, unknown> = {}) => ({
    id: 'run-1',
    patientId: 'patient-a',
    pipeline: 'cardio-seg-mri',
    createdAt: new Date('2026-10-09T15:04:00Z'),
    decidedAt: new Date('2026-10-09T15:20:00Z'),
    decidedBy: {
      id: 'doctor-a',
      fullName: 'Amel Benaïssa',
      doctorProfile: { speciality: 'Radiologie' },
    },
    patient: {
      workspaceId: 'ws-a',
      birthDate: new Date('1984-03-27T00:00:00Z'),
      firstName: 'Karim',
      firstNameAr: 'كريم',
      lastName: 'Haddad',
      lastNameAr: 'حداد',
      gender: 'MALE',
      hospitalRecordNumber: null,
    },
    ...overrides,
  });

  it('is FINAL from the start, numbered like its PDF and written by the deciding physician', () => {
    expect(buildAiClinicalReport({ aiReport, run: run() })).toMatchObject({
      number: 'CR-IA-2026-000003',
      category: 'AI_CARDIAC_MRI',
      sourceType: 'AI_ANALYSIS',
      status: 'FINAL',
      authorId: 'doctor-a',
      finalizedById: 'doctor-a',
      finalizedAt: new Date('2026-10-09T15:20:00Z'),
      effectiveAt: new Date('2026-10-09T15:04:00Z'),
      aiAnalysisReportId: 'ai-report-1',
      contentFingerprint: 'c'.repeat(64),
      workspaceId: 'ws-a',
      authorSnapshot: { fullName: 'Amel Benaïssa', speciality: 'Radiologie' },
    });
  });

  it('falls back on the requester when nobody decided, and skips a patient with no workspace', () => {
    const noDecision = buildAiClinicalReport({
      aiReport,
      run: run({ decidedBy: null, decidedAt: null }),
    });
    expect(noDecision).toMatchObject({
      authorId: 'doctor-requester',
      finalizedAt: aiReport.createdAt,
    });
    const orphan = run();
    orphan.patient.workspaceId = null as unknown as string;
    expect(buildAiClinicalReport({ aiReport, run: orphan })).toBeNull();
  });

  it('maps every pipeline to its category, like the SQL backfill', () => {
    expect(
      [
        'brain',
        'cardio-ecg',
        'cardio-seg-mri',
        'pathology-breast',
        'pathology-nuclei',
      ].map(aiReportCategory),
    ).toEqual([
      'AI_BRAIN',
      'AI_ECG',
      'AI_CARDIAC_MRI',
      'AI_PATHOLOGY',
      'AI_PATHOLOGY',
    ]);
  });
});

describe('toReportDetail', () => {
  const base = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'r1',
      number: null,
      workspaceId: 'ws-a',
      patientId: 'patient-a',
      encounterId: null,
      category: 'CONSULTATION_NOTE',
      sourceType: 'CONSULTATION',
      status: 'DRAFT',
      title: 'Note',
      conclusion: null,
      sections: [{ id: 'reason', title: 'Motif', body: 'Fièvre' }, 'bad'],
      effectiveAt: new Date('2026-10-01T00:00:00Z'),
      version: 1,
      replacesId: null,
      supersededAt: null,
      authorId: 'doctor-a',
      finalizedAt: null,
      finalizedById: null,
      canceledAt: null,
      canceledById: null,
      cancellationReason: null,
      patientSnapshot: null,
      authorSnapshot: null,
      organizationSnapshot: null,
      contentFingerprint: null,
      externalSource: null,
      aiAnalysisReportId: null,
      patientDocumentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      patient: {
        id: 'patient-a',
        firstName: 'Amina',
        firstNameAr: 'أمينة',
        lastName: 'Benali',
        lastNameAr: 'بن علي',
        birthDate: new Date('1985-03-12T00:00:00Z'),
        gender: 'FEMALE',
        hospitalRecordNumber: 'DOS-1',
      },
      author: {
        id: 'doctor-a',
        fullName: 'Samir Kaci',
        doctorProfile: { speciality: 'Cardiologie' },
      },
      finalizedBy: null,
      canceledBy: null,
      encounter: null,
      document: null,
      replaces: null,
      replacedBy: null,
      patientDocument: null,
      aiAnalysisReport: null,
      ...overrides,
    }) as unknown as ReportDetail;

  it('shows the live patient on a draft and ignores malformed sections', () => {
    const detail = toReportDetail(base());

    expect(detail.patient).toMatchObject({
      lastName: 'Benali',
      birthDate: '1985-03-12',
    });
    expect(detail.sections).toEqual([
      { id: 'reason', title: 'Motif', body: 'Fièvre' },
    ]);
    expect(detail).toMatchObject({
      validator: null,
      organization: null,
      documentAvailable: false,
      presentedForm: null,
    });
  });

  it('shows the copy taken at finalization: a later change of the record does not show', () => {
    const detail = toReportDetail(
      base({
        status: 'FINAL',
        number: 'CR-2026-000001',
        finalizedAt: new Date('2026-10-02T00:00:00Z'),
        finalizedById: 'doctor-a',
        finalizedBy: { id: 'doctor-a', fullName: 'Samir Kaci' },
        patientSnapshot: {
          firstName: 'Amina',
          lastName: 'Benali',
          birthDate: '1985-03-12',
          hospitalRecordNumber: 'DOS-1',
        },
        authorSnapshot: {
          fullName: 'Samir Kaci',
          speciality: 'Cardiologie',
          registrationNumber: 'CNOM-16-2041',
        },
        organizationSnapshot: { name: 'Cabinet du Dr Kaci', wilaya: 'Alger' },
        document: { id: 'd1', size: 1200, checksum: 'a'.repeat(64) },
        patient: { ...base().patient, lastName: 'RENOMMÉE' },
      }),
    );

    expect(detail.patient.lastName).toBe('Benali');
    expect(detail.validator).toMatchObject({
      registrationNumber: 'CNOM-16-2041',
    });
    expect(detail.organization).toMatchObject({ name: 'Cabinet du Dr Kaci' });
    expect(detail.presentedForm).toMatchObject({
      kind: 'GENERATED',
      fileName: 'CR-2026-000001.pdf',
      sha256: 'a'.repeat(64),
    });
    expect(detail.documentAvailable).toBe(true);
  });

  it('describes the analysis behind an AI report, with its PDF', () => {
    const detail = toReportDetail(
      base({
        sourceType: 'AI_ANALYSIS',
        category: 'AI_BRAIN',
        status: 'FINAL',
        aiAnalysisReportId: 'ai-1',
        aiAnalysisReport: {
          id: 'ai-1',
          reportNumber: 'CR-IA-2026-000001',
          sizeBytes: 5000,
          sha256: 'b'.repeat(64),
          run: {
            id: 'run-1',
            patientId: 'patient-a',
            pipeline: 'brain',
            decisionStatus: 'VALIDATED',
            clinicianImpression: 'Lésion extra-axiale.',
            predictions: [{ label: 'meningioma', probability: 0.9 }],
            classificationModelId: 'brain-model',
            segmentationModelId: null,
            classificationWeightsSha256: 'd'.repeat(64),
            segmentationWeightsSha256: null,
          },
        },
      }),
    );

    expect(detail.ai).toMatchObject({
      runId: 'run-1',
      pipeline: 'brain',
      decisionStatus: 'VALIDATED',
      weightsSha256: 'd'.repeat(64),
    });
    expect(detail.presentedForm).toMatchObject({
      kind: 'AI_REPORT',
      fileName: 'CR-IA-2026-000001.pdf',
    });
  });
});
