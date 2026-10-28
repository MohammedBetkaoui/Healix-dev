/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// The rows of the in-memory tables below are untyped on purpose: they stand in
// for Prisma, whatever the query asks for.
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { createSha256Checksum } from '../common/utils/checksum.util';
import { type PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { type PatientFileValidator } from '../patients/documents/patient-file-validator';
import { type PatientsService } from '../patients/patients.service';
import { type PrescriptionAuthorizationService } from '../prescriptions/prescription-authorization.service';
import { type PrismaService } from '../prisma/prisma.service';
import { type WorkspaceContextService } from '../workspaces/workspace-context.service';
import { ReportAuthorizationService } from './report-authorization.service';
import { ReportNumberService } from './report-number.service';
import { type ReportPdfService } from './report-pdf.service';
import { type ReportStorageService } from './report-storage.service';
import { ReportsService } from './reports.service';

type Row = Record<string, any>;

const doctorA: AuthenticatedUserPayload = {
  sub: 'doctor-a',
  role: 'INDEPENDENT_DOCTOR',
} as AuthenticatedUserPayload;
const doctorB: AuthenticatedUserPayload = {
  sub: 'doctor-b',
  role: 'INDEPENDENT_DOCTOR',
} as AuthenticatedUserPayload;
const admin: AuthenticatedUserPayload = {
  sub: 'admin-a',
  role: 'ESTABLISHMENT_ADMIN',
} as AuthenticatedUserPayload;

const WORKSPACE_OF: Record<string, string> = {
  'doctor-a': 'ws-a',
  'admin-a': 'ws-a',
  'doctor-b': 'ws-b',
};

const identity = {
  doctorProfileId: 'profile',
  fullName: 'Samir Kaci',
  speciality: 'Cardiologie',
  registrationNumber: 'CNOM-16-2041',
  regionalCouncil: "Conseil régional d'Alger",
  registrationWilaya: 'Alger',
  professionalAddress: '12 rue Didouche Mourad',
  professionalPhone: '0555111111',
  organization: {
    id: null,
    name: 'Cabinet du Dr Kaci',
    address: '12 rue Didouche Mourad',
    wilaya: 'Alger',
    phone: '0555111111',
  },
  credentialsComplete: true,
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    clientVersion: 'test',
    code: 'P2002',
  });

// A small in-memory stand-in for the tables the service touches.
function createDatabase() {
  const reports: Row[] = [];
  const documents: Row[] = [];
  const patientDocuments: Row[] = [];
  const aiReports: Row[] = [];
  const sequences = new Map<string, number>();
  const audit: Row[] = [];
  const users: Record<string, Row> = {
    'doctor-a': {
      id: 'doctor-a',
      fullName: 'Samir Kaci',
      doctorProfile: { speciality: 'Cardiologie' },
    },
    'doctor-b': {
      id: 'doctor-b',
      fullName: 'Leila Ait',
      doctorProfile: { speciality: 'Pédiatrie' },
    },
    'admin-a': {
      id: 'admin-a',
      fullName: 'Admin Clinique',
      doctorProfile: null,
    },
  };
  const patients: Record<string, Row> = {
    'patient-a': {
      id: 'patient-a',
      workspaceId: 'ws-a',
      administrativeStatus: 'ACTIVE',
      firstName: 'Amina',
      firstNameAr: 'أمينة',
      lastName: 'Benali',
      lastNameAr: 'بن علي',
      birthDate: new Date('1985-03-12T00:00:00Z'),
      gender: 'FEMALE',
      hospitalRecordNumber: 'DOS-0001',
    },
    'patient-b': {
      id: 'patient-b',
      workspaceId: 'ws-b',
      administrativeStatus: 'ACTIVE',
      firstName: 'Omar',
      firstNameAr: 'عمر',
      lastName: 'Haddad',
      lastNameAr: 'حداد',
      birthDate: new Date('1990-01-01T00:00:00Z'),
      gender: 'MALE',
      hospitalRecordNumber: null,
    },
  };

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, expected]) => {
      if (expected === undefined) return true;
      if (
        expected !== null &&
        typeof expected === 'object' &&
        !(expected instanceof Date)
      ) {
        if ('in' in expected) return expected.in.includes(row[key]);
        if ('not' in expected) return row[key] !== expected.not;
        return true;
      }
      return row[key] === expected;
    });

  const hydrate = (row: Row | undefined) =>
    row && {
      ...row,
      patient: patients[row.patientId],
      author: users[row.authorId],
      finalizedBy: row.finalizedById ? users[row.finalizedById] : null,
      canceledBy: row.canceledById ? users[row.canceledById] : null,
      encounter: null,
      document: documents.find((doc) => doc.reportId === row.id) ?? null,
      replaces: reports.find((other) => other.id === row.replacesId) ?? null,
      replacedBy: reports.find((other) => other.replacesId === row.id) ?? null,
      patientDocument:
        patientDocuments.find((doc) => doc.id === row.patientDocumentId) ??
        null,
      aiAnalysisReport:
        aiReports.find((report) => report.id === row.aiAnalysisReportId) ??
        null,
    };

  let counter = 0;
  const clinicalReport = {
    findFirst: ({ where }: { where: Row }) =>
      Promise.resolve(
        hydrate(reports.find((row) => matches(row, where))) ?? null,
      ),
    findUnique: ({ where }: { where: Row }) =>
      Promise.resolve(
        hydrate(reports.find((row) => matches(row, where))) ?? null,
      ),
    findUniqueOrThrow: ({ where }: { where: Row }) => {
      const row = hydrate(
        reports.find((candidate) => matches(candidate, where)),
      );
      return row
        ? Promise.resolve(row)
        : Promise.reject(new Error('not found'));
    },
    findMany: ({ where }: { where: Row }) =>
      Promise.resolve(
        reports.filter((row) => matches(row, where)).map((row) => hydrate(row)),
      ),
    count: ({ where }: { where: Row }) =>
      Promise.resolve(reports.filter((row) => matches(row, where)).length),
    create: ({ data }: { data: Row }) => {
      const taken = (field: string) =>
        data[field] != null &&
        reports.some((row) => row[field] === data[field]);
      if (['number', 'replacesId', 'aiAnalysisReportId'].some(taken)) {
        return Promise.reject(uniqueViolation());
      }
      counter += 1;
      const row: Row = {
        id: `report-${counter}`,
        number: null,
        status: 'DRAFT',
        version: 1,
        replacesId: null,
        supersededAt: null,
        encounterId: null,
        conclusion: null,
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
        effectiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      reports.push(row);
      return Promise.resolve(row);
    },
    updateMany: ({ where, data }: { where: Row; data: Row }) => {
      const found = reports.filter((row) => matches(row, where));
      for (const row of found) {
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined) row[key] = value;
        });
        row.updatedAt = new Date();
      }
      return Promise.resolve({ count: found.length });
    },
    deleteMany: ({ where }: { where: Row }) => {
      const found = reports.filter((row) => matches(row, where));
      for (const row of found) reports.splice(reports.indexOf(row), 1);
      return Promise.resolve({ count: found.length });
    },
  };

  const prisma = {
    clinicalReport,
    clinicalReportDocument: {
      create: ({ data }: { data: Row }) => {
        documents.push({ id: `doc-${documents.length + 1}`, ...data });
        return Promise.resolve(data);
      },
    },
    // The two statements of the counter (see nextSequenceValue): add 1 to
    // (type, year), then read it.
    $executeRaw: (
      _strings: TemplateStringsArray,
      type: string,
      year: number,
    ) => {
      const key = `${type}:${year}`;
      sequences.set(key, (sequences.get(key) ?? 0) + 1);
      return Promise.resolve(1);
    },
    $queryRaw: (_strings: TemplateStringsArray, type: string, year: number) =>
      Promise.resolve([{ last_value: sequences.get(`${type}:${year}`) }]),
    patient: {
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve(
          Object.values(patients).find((row) => matches(row, where)) ?? null,
        ),
      findUnique: () => Promise.resolve({ doctorProfile: null }),
    },
    patientConsultation: { findFirst: () => Promise.resolve(null) },
    patientDocument: {
      create: ({ data }: { data: Row }) => {
        const row = { id: `pdoc-${patientDocuments.length + 1}`, ...data };
        patientDocuments.push(row);
        return Promise.resolve(row);
      },
    },
    user: {
      findUniqueOrThrow: ({ where }: { where: { id: string } }) =>
        Promise.resolve(users[where.id]),
    },
    workspace: {
      findUniqueOrThrow: () =>
        Promise.resolve({ name: 'Cabinet du Dr Kaci', establishment: null }),
    },
    auditLog: { findMany: () => Promise.resolve([]) },
    $transaction: (work: unknown) =>
      typeof work === 'function'
        ? (work as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(work as Array<Promise<unknown>>),
  };
  return {
    prisma,
    reports,
    documents,
    patientDocuments,
    aiReports,
    patients,
    audit,
  };
}

function createService() {
  const db = createDatabase();
  const disk = new Map<string, Buffer>();
  const render = jest.fn(({ number }: { number: string }) =>
    Promise.resolve(Buffer.from(`%PDF-1.4 ${number} ${Math.random()}`)),
  );
  const store = jest.fn(
    ({
      number,
      pdf,
    }: {
      number: string;
      reportId: string;
      pdf: Buffer;
    }) => {
      // The PDF goes under an opaque key of the storage, the way the real
      // ReportStorageService answers.
      const storageKey = `hx/medical/ab/${number.replace(/\W/g, '-')}.pdf`;
      disk.set(storageKey, pdf);
      return Promise.resolve({
        storedName: `${number}.pdf`,
        storageKey,
        encryptionVersion: 1,
        size: pdf.length,
        checksum: createSha256Checksum(pdf),
      });
    },
  );
  const read = jest.fn((path: string) =>
    Promise.resolve(disk.get(path) as Buffer),
  );
  const remove = jest.fn((path: string) => {
    disk.delete(path);
    return Promise.resolve();
  });
  const readStoredFile = jest.fn((path: string) =>
    Promise.resolve(disk.get(path) as Buffer),
  );
  const storePatientDocument = jest.fn(
    ({ file, patientId }: { file: Express.Multer.File; patientId: string }) => {
      // An imported document is encrypted too: the row holds its key, never
      // a path.
      const storageKey = `hx/medical/ab/import-${patientId}.pdf`;
      disk.set(storageKey, file.buffer);
      return Promise.resolve({
        checksum: createSha256Checksum(file.buffer),
        storageKey,
        encryptionVersion: 1,
        originalName: file.originalname,
        storedName: file.originalname,
      });
    },
  );
  const deleteFile = jest.fn((path: string) => {
    disk.delete(path);
    return Promise.resolve();
  });
  const createAuditLog = jest.fn((input: Row) => {
    db.audit.push(input);
    return Promise.resolve(input);
  });
  const workspaceContext = {
    resolveWorkspaceForUser: ({ userId }: { userId: string }) =>
      Promise.resolve({ workspaceId: WORKSPACE_OF[userId] }),
  };
  const prescriberAuthorization = {
    resolvePrescriber: (user: AuthenticatedUserPayload) =>
      Promise.resolve({
        workspace: { workspaceId: WORKSPACE_OF[user.sub] },
        identity,
      }),
  };
  const patients = {
    getPatientInScope: (user: AuthenticatedUserPayload, id: string) => {
      const patient = db.patients[id];
      return patient && patient.workspaceId === WORKSPACE_OF[user.sub]
        ? Promise.resolve(patient)
        : Promise.reject(new NotFoundException('Patient introuvable.'));
    },
  };
  const service = new ReportsService(
    db.prisma as unknown as PrismaService,
    patients as unknown as PatientsService,
    new ReportAuthorizationService(
      workspaceContext as unknown as WorkspaceContextService,
      prescriberAuthorization as unknown as PrescriptionAuthorizationService,
    ),
    new ReportNumberService(),
    { render } as unknown as ReportPdfService,
    { store, read, remove } as unknown as ReportStorageService,
    {
      storePatientDocument,
      readStoredFile,
      deleteFile,
    } as unknown as PatientFileStorageService,
    {
      validate: () => ({ extension: '.pdf', mimeType: 'application/pdf' }),
    } as unknown as PatientFileValidator,
    { createAuditLog } as unknown as AuditLogsService,
  );
  return {
    service,
    db,
    disk,
    render,
    store,
    remove,
    storePatientDocument,
    deleteFile,
    createAuditLog,
  };
}

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
};
const codeOf = (error: HttpException) =>
  (error.getResponse() as { code?: string }).code;

const draftBody = {
  patientId: 'patient-a',
  title: 'Note de consultation',
  sections: [
    { id: 'findings', body: 'Tension 13/8.' },
    { id: 'reason', body: 'Contrôle de routine.' },
    { id: 'results', body: '   ' },
  ],
  conclusion: 'Suivi à 3 mois.',
};
const year = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Algiers',
  year: 'numeric',
}).format(new Date());

describe('ReportsService', () => {
  describe('drafts and workspace boundary', () => {
    it('creates a draft with sections in print order, without the empty ones', async () => {
      const { service } = createService();

      const draft = await service.create(doctorA, draftBody);

      expect(draft).toMatchObject({
        status: 'DRAFT',
        number: null,
        category: 'CONSULTATION_NOTE',
        sourceType: 'CONSULTATION',
        version: 1,
        conclusion: 'Suivi à 3 mois.',
      });
      expect(draft.sections.map((section) => section.id)).toEqual([
        'reason',
        'findings',
      ]);
      expect(draft.sections[0]).toMatchObject({
        title: 'Motif',
        body: 'Contrôle de routine.',
      });
    });

    it('answers 404, not 403, for a patient or a report of another workspace', async () => {
      const { service } = createService();
      const mine = await service.create(doctorA, draftBody);

      const patientError = await errorOf(service.create(doctorB, draftBody));
      expect(patientError).toBeInstanceOf(NotFoundException);

      for (const call of [
        () => service.findOne(doctorB, mine.id),
        () => service.history(doctorB, mine.id),
        () => service.getPdf(doctorB, mine.id),
        () => service.update(doctorB, mine.id, { title: 'x' }),
        () => service.remove(doctorB, mine.id),
        () => service.finalize(doctorB, mine.id),
        () => service.amend(doctorB, mine.id),
        () => service.cancel(doctorB, mine.id, { reason: 'Erreur de saisie' }),
      ]) {
        const error = await errorOf(call());
        expect(error).toBeInstanceOf(NotFoundException);
        expect(codeOf(error)).toBe('REPORT_NOT_FOUND');
      }
      const list = await service.list(doctorB, { page: 1, limit: 20 });
      expect(list.data).toEqual([]);
    });

    it('lets the administration draft but not finalize, amend or cancel', async () => {
      const { service } = createService();
      const draft = await service.create(admin, draftBody);

      for (const call of [
        () => service.finalize(admin, draft.id),
        () => service.amend(admin, draft.id),
        () => service.cancel(admin, draft.id, { reason: 'Erreur de saisie' }),
      ]) {
        const error = await errorOf(call());
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(codeOf(error)).toBe('REPORT_PERMISSION_DENIED');
      }
    });

    it('updates and deletes a draft', async () => {
      const { service } = createService();
      const draft = await service.create(doctorA, draftBody);

      const updated = await service.update(doctorA, draft.id, {
        title: 'Nouveau titre',
        conclusion: null,
      });
      expect(updated).toMatchObject({
        title: 'Nouveau titre',
        conclusion: null,
      });

      await expect(service.remove(doctorA, draft.id)).resolves.toEqual({
        deleted: true,
      });
      const error = await errorOf(service.findOne(doctorA, draft.id));
      expect(codeOf(error)).toBe('REPORT_NOT_FOUND');
    });
  });

  describe('finalization', () => {
    it('numbers CR-<year>-<NNNNNN> in sequence, freezes the content and stores the PDF', async () => {
      const { service, db, store } = createService();
      const first = await service.create(doctorA, draftBody);
      const second = await service.create(doctorA, {
        ...draftBody,
        title: 'Autre note',
      });

      const one = await service.finalize(doctorA, first.id);
      const two = await service.finalize(doctorA, second.id);

      expect(one.number).toBe(`CR-${year}-000001`);
      expect(two.number).toBe(`CR-${year}-000002`);
      expect(one).toMatchObject({
        status: 'FINAL',
        version: 1,
        documentAvailable: true,
      });
      expect(one.validator).toMatchObject({
        fullName: 'Samir Kaci',
        registrationNumber: 'CNOM-16-2041',
      });
      expect(one.organization).toMatchObject({ name: 'Cabinet du Dr Kaci' });
      expect(one.contentFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(store).toHaveBeenCalledTimes(2);
      expect(db.documents).toHaveLength(2);
      expect(db.documents[0].contentFingerprint).toBe(one.contentFingerprint);
    });

    it('is idempotent: finalizing a finalized report returns it unchanged', async () => {
      const { service, render } = createService();
      const draft = await service.create(doctorA, draftBody);
      const first = await service.finalize(doctorA, draft.id);

      const again = await service.finalize(doctorA, draft.id);

      expect(again.number).toBe(first.number);
      expect(render).toHaveBeenCalledTimes(1);
    });

    it('refuses an empty report (400 REPORT_EMPTY) and stores nothing', async () => {
      const { service, store } = createService();
      const draft = await service.create(doctorA, {
        patientId: 'patient-a',
        title: 'Vide',
      });

      const error = await errorOf(service.finalize(doctorA, draft.id));

      expect(codeOf(error)).toBe('REPORT_EMPTY');
      expect(store).not.toHaveBeenCalled();
    });

    it('removes the stored PDF and keeps the draft when the finalization fails', async () => {
      const { service, db, remove } = createService();
      const draft = await service.create(doctorA, draftBody);
      const original = db.prisma.clinicalReportDocument.create;
      db.prisma.clinicalReportDocument.create = () =>
        Promise.reject(new Error('db down'));

      await expect(service.finalize(doctorA, draft.id)).rejects.toThrow(
        'db down',
      );
      db.prisma.clinicalReportDocument.create = original;

      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('a finalized report is immutable', () => {
    it('refuses to update or delete it (409) and leaves it exactly as it was', async () => {
      const { service, db } = createService();
      const draft = await service.create(doctorA, draftBody);
      const final = await service.finalize(doctorA, draft.id);
      const before = JSON.stringify(db.reports[0]);

      for (const call of [
        () =>
          service.update(doctorA, final.id, {
            title: 'Falsifié',
            conclusion: 'Autre',
          }),
        () => service.remove(doctorA, final.id),
      ]) {
        const error = await errorOf(call());
        expect(error).toBeInstanceOf(ConflictException);
        expect(codeOf(error)).toBe('REPORT_NOT_EDITABLE');
      }
      expect(JSON.stringify(db.reports[0])).toBe(before);
    });
  });

  describe('amendments', () => {
    it('draft → final → amended: v2 replaces v1, which is marked superseded and stays readable', async () => {
      const { service, db } = createService();
      const draft = await service.create(doctorA, draftBody);
      const v1 = await service.finalize(doctorA, draft.id);

      const amendment = await service.amend(doctorA, v1.id);
      expect(amendment).toMatchObject({
        status: 'DRAFT',
        version: 2,
        number: null,
      });
      expect(amendment.replaces).toMatchObject({
        id: v1.id,
        number: v1.number,
      });

      await service.update(doctorA, amendment.id, {
        conclusion: 'Suivi à 1 mois.',
      });
      const v2 = await service.finalize(doctorA, amendment.id);

      expect(v2).toMatchObject({ status: 'AMENDED', version: 2 });
      expect(v2.number).toBe(`CR-${year}-000002`);
      expect(v2.conclusion).toBe('Suivi à 1 mois.');
      const old = db.reports.find((row) => row.id === v1.id) as Row;
      expect(old.supersededAt).toBeInstanceOf(Date);
      expect(old.status).toBe('FINAL');
      expect(old.conclusion).toBe('Suivi à 3 mois.');
      expect(
        v2.versions.map((version) => [version.version, version.isCurrent]),
      ).toEqual([
        [1, false],
        [2, true],
      ]);
      // The old version is still readable.
      await expect(service.findOne(doctorA, v1.id)).resolves.toMatchObject({
        isCurrent: false,
        version: 1,
      });
    });

    it('lists the current versions only, unless asked for the replaced ones', async () => {
      const { service } = createService();
      const v1 = await service.finalize(
        doctorA,
        (await service.create(doctorA, draftBody)).id,
      );
      const amendment = await service.amend(doctorA, v1.id);
      await service.finalize(doctorA, amendment.id);

      const current = await service.list(doctorA, { page: 1, limit: 20 });
      const all = await service.list(doctorA, {
        page: 1,
        limit: 20,
        includeSuperseded: true,
      });

      expect(current.data.map((report) => report.version)).toEqual([2]);
      expect(all.data.map((report) => report.version).sort()).toEqual([1, 2]);
    });

    it('allows one amendment at a time (409 REPORT_AMENDMENT_IN_PROGRESS)', async () => {
      const { service } = createService();
      const v1 = await service.finalize(
        doctorA,
        (await service.create(doctorA, draftBody)).id,
      );
      await service.amend(doctorA, v1.id);

      const again = await errorOf(service.amend(doctorA, v1.id));
      const cancel = await errorOf(
        service.cancel(doctorA, v1.id, { reason: 'Erreur de saisie' }),
      );

      expect(codeOf(again)).toBe('REPORT_AMENDMENT_IN_PROGRESS');
      expect(codeOf(cancel)).toBe('REPORT_AMENDMENT_IN_PROGRESS');
    });

    it('only amends the current version of a finalized report', async () => {
      const { service } = createService();
      const draft = await service.create(doctorA, draftBody);
      expect(codeOf(await errorOf(service.amend(doctorA, draft.id)))).toBe(
        'REPORT_NOT_AMENDABLE',
      );
      const v1 = await service.finalize(doctorA, draft.id);
      const amendment = await service.amend(doctorA, v1.id);
      await service.finalize(doctorA, amendment.id);

      const error = await errorOf(service.amend(doctorA, v1.id));

      expect(codeOf(error)).toBe('REPORT_NOT_AMENDABLE');
    });
  });

  describe('cancellation', () => {
    it('cancels a finalized report with its reason, then stays canceled', async () => {
      const { service } = createService();
      const final = await service.finalize(
        doctorA,
        (await service.create(doctorA, draftBody)).id,
      );

      const canceled = await service.cancel(doctorA, final.id, {
        reason: 'Rapport établi pour le mauvais patient',
      });
      const again = await service.cancel(doctorA, final.id, {
        reason: 'Autre motif',
      });

      expect(canceled).toMatchObject({
        status: 'CANCELED',
        cancellationReason: 'Rapport établi pour le mauvais patient',
        canceledByName: 'Samir Kaci',
      });
      expect(again.cancellationReason).toBe(
        'Rapport établi pour le mauvais patient',
      );
      expect(codeOf(await errorOf(service.amend(doctorA, final.id)))).toBe(
        'REPORT_NOT_AMENDABLE',
      );
    });

    it('does not cancel a draft nor a replaced version (409 REPORT_NOT_CANCELABLE)', async () => {
      const { service } = createService();
      const draft = await service.create(doctorA, draftBody);
      expect(
        codeOf(
          await errorOf(
            service.cancel(doctorA, draft.id, { reason: 'Erreur de saisie' }),
          ),
        ),
      ).toBe('REPORT_NOT_CANCELABLE');
      const v1 = await service.finalize(doctorA, draft.id);
      const amendment = await service.amend(doctorA, v1.id);
      await service.finalize(doctorA, amendment.id);

      const error = await errorOf(
        service.cancel(doctorA, v1.id, { reason: 'Erreur de saisie' }),
      );

      expect(codeOf(error)).toBe('REPORT_NOT_CANCELABLE');
    });
  });

  describe('report of an AI analysis', () => {
    const withAiReport = () => {
      const context = createService();
      const pdf = Buffer.from('%PDF-1.7 ai');
      context.disk.set(
        '/uploads/patients/patient-a/ai-reports/CR-IA-2026-000007.pdf',
        pdf,
      );
      context.db.aiReports.push({
        id: 'ai-report-1',
        reportNumber: 'CR-IA-2026-000007',
        filePath:
          '/uploads/patients/patient-a/ai-reports/CR-IA-2026-000007.pdf',
        sha256: createSha256Checksum(pdf),
        sizeBytes: pdf.length,
        run: null,
      });
      context.db.reports.push({
        id: 'ai-row',
        number: 'CR-IA-2026-000007',
        workspaceId: 'ws-a',
        patientId: 'patient-a',
        category: 'AI_BRAIN',
        sourceType: 'AI_ANALYSIS',
        status: 'FINAL',
        title: 'Compte rendu IA — Brain',
        sections: [],
        version: 1,
        replacesId: null,
        supersededAt: null,
        encounterId: null,
        conclusion: null,
        authorId: 'doctor-a',
        finalizedAt: new Date(),
        finalizedById: 'doctor-a',
        canceledAt: null,
        canceledById: null,
        cancellationReason: null,
        patientSnapshot: {
          firstName: 'Amina',
          lastName: 'Benali',
          birthDate: '1985-03-12',
        },
        authorSnapshot: { fullName: 'Samir Kaci' },
        organizationSnapshot: null,
        contentFingerprint: 'a'.repeat(64),
        externalSource: null,
        aiAnalysisReportId: 'ai-report-1',
        patientDocumentId: null,
        effectiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { ...context, pdf };
    };

    it('is refused any change: no amendment, no cancellation, no edit (409 REPORT_AI_IMMUTABLE)', async () => {
      const { service } = withAiReport();

      for (const call of [
        () => service.amend(doctorA, 'ai-row'),
        () => service.cancel(doctorA, 'ai-row', { reason: 'Erreur de saisie' }),
      ]) {
        const error = await errorOf(call());
        expect(error).toBeInstanceOf(ConflictException);
        expect(codeOf(error)).toBe('REPORT_AI_IMMUTABLE');
      }
      expect(
        codeOf(
          await errorOf(service.update(doctorA, 'ai-row', { title: 'x' })),
        ),
      ).toBe('REPORT_NOT_EDITABLE');
    });

    it('serves the PDF of the analysis, checked against its SHA-256', async () => {
      const { service, pdf, disk } = withAiReport();

      const document = await service.getPdf(doctorA, 'ai-row');

      expect(document).toMatchObject({
        fileName: 'CR-IA-2026-000007.pdf',
        mimeType: 'application/pdf',
      });
      expect(document.file.equals(pdf)).toBe(true);
      disk.set(
        '/uploads/patients/patient-a/ai-reports/CR-IA-2026-000007.pdf',
        Buffer.from('tampered'),
      );
      const error = await errorOf(service.getPdf(doctorA, 'ai-row'));
      expect(codeOf(error)).toBe('REPORT_INTEGRITY_FAILED');
    });

    it('is listed with its analysis and counted as an AI validated report', async () => {
      const { service } = withAiReport();

      const list = await service.list(doctorA, { page: 1, limit: 20 });
      const stats = await service.stats(doctorA);

      expect(list.data[0]).toMatchObject({
        number: 'CR-IA-2026-000007',
        sourceType: 'AI_ANALYSIS',
        status: 'FINAL',
      });
      expect(stats.aiValidated).toBe(1);
    });
  });

  describe('import', () => {
    const file = {
      originalname: 'bilan-externe.pdf',
      buffer: Buffer.from('%PDF-1.4 externe'),
      size: 16,
      mimetype: 'application/pdf',
    } as Express.Multer.File;
    const body = {
      patientId: 'patient-a',
      title: 'Bilan externe',
      effectiveDate: '2026-10-01',
      externalAuthor: 'Dr Rachid Merad',
      specialty: 'Radiologie',
    };

    it('files the document as a final EXTERNAL_DOCUMENT report, numbered, with its patient document', async () => {
      const { service, db, createAuditLog } = createService();

      const report = await service.importDocument(admin, body, file);

      expect(report).toMatchObject({
        status: 'FINAL',
        sourceType: 'EXTERNAL_DOCUMENT',
        category: 'EXTERNAL_MEDICAL',
        number: `CR-${year}-000001`,
        external: { author: 'Dr Rachid Merad', specialty: 'Radiologie' },
        importedDocument: { fileName: 'bilan-externe.pdf' },
        documentAvailable: true,
      });
      expect(db.patientDocuments).toHaveLength(1);
      expect(db.patientDocuments[0]).toMatchObject({
        documentType: 'MEDICAL_REPORT',
        patientId: 'patient-a',
      });
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REPORT_IMPORTED',
          entityType: 'CLINICAL_REPORT',
        }),
        expect.anything(),
      );
      const document = await service.getPdf(admin, report.id);
      expect(document.file.equals(file.buffer)).toBe(true);
    });

    it('needs a file (400) and a patient of the workspace (404)', async () => {
      const { service, storePatientDocument } = createService();

      expect(
        codeOf(await errorOf(service.importDocument(admin, body, undefined))),
      ).toBe('REPORT_IMPORT_FILE_REQUIRED');
      expect(
        await errorOf(
          service.importDocument(
            admin,
            { ...body, patientId: 'patient-b' },
            file,
          ),
        ),
      ).toBeInstanceOf(NotFoundException);
      expect(storePatientDocument).not.toHaveBeenCalled();
    });

    it('removes the stored file when the report cannot be created', async () => {
      const { service, db, deleteFile } = createService();
      db.prisma.clinicalReport.create = () =>
        Promise.reject(new Error('db down'));

      await expect(service.importDocument(admin, body, file)).rejects.toThrow(
        'db down',
      );

      expect(deleteFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('patient reports and history', () => {
    it("lists a patient's current reports, and refuses a patient of another workspace", async () => {
      const { service } = createService();
      await service.finalize(
        doctorA,
        (await service.create(doctorA, draftBody)).id,
      );

      const reports = await service.patientReports(doctorA, 'patient-a');

      expect(reports).toHaveLength(1);
      expect(
        await errorOf(service.patientReports(doctorA, 'patient-b')),
      ).toBeInstanceOf(NotFoundException);
    });

    it('writes every action to the audit trail on the report', async () => {
      const { service, createAuditLog } = createService();
      const draft = await service.create(doctorA, draftBody);
      await service.update(doctorA, draft.id, { title: 'Titre' });
      await service.finalize(doctorA, draft.id);

      const actions = createAuditLog.mock.calls.map(([input]) => input.action);

      expect(actions).toEqual([
        'REPORT_CREATED',
        'REPORT_UPDATED',
        'REPORT_PDF_GENERATED',
        'REPORT_FINALIZED',
      ]);
      expect(
        createAuditLog.mock.calls.every(
          ([input]) => input.entityType === 'CLINICAL_REPORT',
        ),
      ).toBe(true);
    });
  });
});
