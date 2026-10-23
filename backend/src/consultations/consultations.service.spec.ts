/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// The rows of the in-memory tables below are untyped on purpose: they stand in
// for Prisma, whatever the query asks for.
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type PatientsService } from '../patients/patients.service';
import { type PrismaService } from '../prisma/prisma.service';
import { ConsultationsService, periodStarts } from './consultations.service';
import { ListConsultationsQueryDto } from './dto/list-consultations-query.dto';

type Row = Record<string, any>;

const doctorA = {
  sub: 'doctor-a',
  role: 'INDEPENDENT_DOCTOR',
} as AuthenticatedUserPayload;
const doctorB = {
  sub: 'doctor-b',
  role: 'INDEPENDENT_DOCTOR',
} as AuthenticatedUserPayload;
const admin = {
  sub: 'admin-a',
  role: 'ESTABLISHMENT_ADMIN',
} as AuthenticatedUserPayload;
const superAdmin = {
  sub: 'root',
  role: 'SUPER_ADMIN',
} as AuthenticatedUserPayload;

const WORKSPACE_OF: Record<string, string> = {
  'admin-a': 'ws-a',
  'doctor-a': 'ws-a',
  'doctor-b': 'ws-b',
};
const PROFILE_OF: Record<string, string> = {
  'doctor-a': 'profile-a',
  'doctor-b': 'profile-b',
};

const patients: Record<string, Row> = {
  'patient-a': {
    id: 'patient-a',
    workspaceId: 'ws-a',
    firstName: 'Amina',
    firstNameAr: 'أمينة',
    lastName: 'Benali',
    lastNameAr: 'بن علي',
    birthDate: new Date('1985-03-12T00:00:00Z'),
    gender: 'FEMALE',
    hospitalRecordNumber: 'DOS-1',
  },
  'patient-a2': {
    id: 'patient-a2',
    workspaceId: 'ws-a',
    firstName: 'Karim',
    firstNameAr: 'كريم',
    lastName: 'Haddad',
    lastNameAr: 'حداد',
    birthDate: new Date('1970-01-01T00:00:00Z'),
    gender: 'MALE',
    hospitalRecordNumber: 'DOS-2',
  },
  'patient-b': {
    id: 'patient-b',
    workspaceId: 'ws-b',
    firstName: 'Omar',
    firstNameAr: 'عمر',
    lastName: 'Merad',
    lastNameAr: 'مراد',
    birthDate: new Date('1990-05-05T00:00:00Z'),
    gender: 'MALE',
    hospitalRecordNumber: null,
  },
};

const consultation = (
  id: string,
  patientId: string,
  date: string,
  extra: Row = {},
): Row => ({
  id,
  patientId,
  doctorProfileId: patientId === 'patient-b' ? 'profile-b' : 'profile-a',
  appointmentId: null,
  date: new Date(date),
  reason: 'Contrôle',
  diagnosis: 'RAS',
  treatment: 'Aucun',
  createdAt: new Date(date),
  updatedAt: new Date(date),
  ...extra,
});

// Evaluates the clauses the service builds.
function matches(row: Row, clause: Row, tables: Row): boolean {
  return Object.entries(clause).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (key === 'AND')
      return (expected as Row[]).every((part) => matches(row, part, tables));
    if (key === 'OR')
      return (expected as Row[]).some((part) => matches(row, part, tables));
    if (key === 'patient')
      return matches(patients[row.patientId], expected, tables);
    if (key === 'prescriptions') {
      const count = tables.prescriptions.filter(
        (rx: Row) => rx.encounterId === row.id,
      ).length;
      return 'some' in expected ? count > 0 : count === 0;
    }
    if (
      expected !== null &&
      typeof expected === 'object' &&
      !(expected instanceof Date)
    ) {
      if ('contains' in expected)
        return String(row[key] ?? '').includes(expected.contains);
      if ('gte' in expected || 'lte' in expected) {
        return (
          (!expected.gte || row[key] >= expected.gte) &&
          (!expected.lte || row[key] <= expected.lte)
        );
      }
    }
    return row[key] === expected;
  });
}

function create(extra: {
  consultations: Row[];
  prescriptions?: Row[];
  reports?: Row[];
}) {
  const tables = {
    consultations: extra.consultations,
    prescriptions: extra.prescriptions ?? [],
    reports: extra.reports ?? [],
  };
  const include = (row: Row) => ({
    ...row,
    patient: patients[row.patientId],
    doctorProfile: row.doctorProfileId
      ? {
          id: row.doctorProfileId,
          speciality: 'Cardiologie',
          user: { fullName: `Dr ${row.doctorProfileId}` },
        }
      : null,
    appointment: row.appointmentId
      ? {
          id: row.appointmentId,
          scheduledAt: row.date,
          durationMinutes: 30,
          status: 'COMPLETED',
          reason: 'Suivi',
        }
      : null,
    _count: {
      prescriptions: tables.prescriptions.filter(
        (rx) => rx.encounterId === row.id,
      ).length,
      clinicalReports: tables.reports.filter(
        (report) =>
          report.encounterId === row.id && report.supersededAt === null,
      ).length,
    },
  });
  const findMany = jest.fn(({ where, skip = 0, take }: Row) =>
    Promise.resolve(
      tables.consultations
        .filter((row) => matches(row, where, tables))
        .sort((left, right) => right.date.getTime() - left.date.getTime())
        .slice(skip, take === undefined ? undefined : skip + take)
        .map(include),
    ),
  );
  const count = jest.fn(({ where }: Row) =>
    Promise.resolve(
      tables.consultations.filter((row) => matches(row, where, tables)).length,
    ),
  );
  const prisma = {
    patientConsultation: {
      findMany,
      count,
      findFirst: jest.fn(({ where }: Row) => {
        const found = tables.consultations.find((row) =>
          matches(row, where, tables),
        );
        return Promise.resolve(found ? include(found) : null);
      }),
    },
    prescription: {
      findMany: jest.fn(({ where }: Row) =>
        Promise.resolve(
          tables.prescriptions
            .filter((rx) =>
              Object.entries(where).every(([key, value]) => rx[key] === value),
            )
            .map((rx) => ({ ...rx, _count: { items: rx.itemCount ?? 1 } })),
        ),
      ),
    },
    clinicalReport: {
      findMany: jest.fn(({ where }: Row) =>
        Promise.resolve(
          tables.reports.filter((report) =>
            Object.entries(where).every(
              ([key, value]) => report[key] === value,
            ),
          ),
        ),
      ),
    },
    doctorProfile: {
      findUnique: jest.fn(({ where }: Row) =>
        Promise.resolve(
          PROFILE_OF[where.userId] ? { id: PROFILE_OF[where.userId] } : null,
        ),
      ),
    },
    $transaction: (queries: Array<Promise<unknown>>) => Promise.all(queries),
  };
  const patientsService = {
    getPatientScope: jest.fn((user: AuthenticatedUserPayload) => {
      const workspaceId = WORKSPACE_OF[user.sub];
      return workspaceId
        ? Promise.resolve({ where: { workspaceId }, workspaceId })
        : Promise.reject(
            new ForbiddenException(
              "Ce type de compte n'est pas associé à un workspace clinique.",
            ),
          );
    }),
  };
  const service = new ConsultationsService(
    prisma as unknown as PrismaService,
    patientsService as unknown as PatientsService,
  );
  return { service, prisma };
}

const query = (overrides: Partial<ListConsultationsQueryDto> = {}) =>
  Object.assign(new ListConsultationsQueryDto(), overrides);

describe('periodStarts (Algiers time, UTC+1)', () => {
  it('starts today, the week (Monday) and the month at midnight in Algiers', () => {
    // Friday 23 October 2026, 22:30 UTC = 23:30 in Algiers.
    const starts = periodStarts(new Date('2026-10-23T22:30:00Z'));
    expect(starts.today.toISOString()).toBe('2026-10-22T23:00:00.000Z');
    expect(starts.week.toISOString()).toBe('2026-10-18T23:00:00.000Z');
    expect(starts.month.toISOString()).toBe('2026-09-30T23:00:00.000Z');
  });

  it('is already tomorrow in Algiers at 23:30 UTC, and Sunday belongs to the week of the Monday before', () => {
    // Saturday 24 October 2026, 00:30 in Algiers.
    expect(
      periodStarts(new Date('2026-10-23T23:30:00Z')).today.toISOString(),
    ).toBe('2026-10-23T23:00:00.000Z');
    // Sunday 25 October 2026.
    expect(
      periodStarts(new Date('2026-10-25T12:00:00Z')).week.toISOString(),
    ).toBe('2026-10-18T23:00:00.000Z');
  });
});

describe('ConsultationsService', () => {
  const rows = () => [
    consultation('c1', 'patient-a', '2026-10-20T09:00:00Z', {
      reason: 'Douleur thoracique',
      diagnosis: 'Angor stable',
      appointmentId: 'apt-1',
    }),
    consultation('c2', 'patient-a2', '2026-10-21T09:00:00Z', {
      reason: 'Fièvre',
      diagnosis: 'Grippe',
    }),
    consultation('c3', 'patient-a', '2026-10-22T09:00:00Z', {
      doctorProfileId: 'profile-other',
    }),
    consultation('c4', 'patient-b', '2026-10-22T10:00:00Z'),
  ];

  describe('visibility', () => {
    it('lists only the consultations of the patients of the workspace, newest first', async () => {
      const { service } = create({ consultations: rows() });

      const mine = await service.list(doctorA, query());
      const theirs = await service.list(doctorB, query());

      expect(mine.data.map((item) => item.id)).toEqual(['c3', 'c2', 'c1']);
      expect(theirs.data.map((item) => item.id)).toEqual(['c4']);
    });

    it('shows the establishment administration the consultations of the establishment, read only', async () => {
      const { service } = create({ consultations: rows() });

      expect((await service.list(admin, query())).data).toHaveLength(3);
      expect(service.capabilities(admin)).toEqual({
        canCreateConsultation: false,
      });
      expect(service.capabilities(doctorA)).toEqual({
        canCreateConsultation: true,
      });
    });

    it('answers 404, not 403, for a consultation of another workspace', async () => {
      const { service } = create({ consultations: rows() });

      await expect(service.findOne(doctorB, 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(doctorA, 'c4')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(doctorA, 'unknown')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(doctorA, 'c1')).resolves.toMatchObject({
        id: 'c1',
      });
    });

    it('gives an account without a clinical workspace nothing (403)', async () => {
      const { service } = create({ consultations: rows() });

      await expect(service.list(superAdmin, query())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.stats(superAdmin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.findOne(superAdmin, 'c1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('list', () => {
    it('paginates', async () => {
      const { service } = create({ consultations: rows() });

      const first = await service.list(doctorA, query({ limit: 2, page: 1 }));
      const second = await service.list(doctorA, query({ limit: 2, page: 2 }));

      expect(first.data.map((item) => item.id)).toEqual(['c3', 'c2']);
      expect(second.data.map((item) => item.id)).toEqual(['c1']);
      expect(first.meta).toEqual({
        limit: 2,
        page: 1,
        total: 3,
        totalPages: 2,
      });
    });

    it('filters by period and by patient', async () => {
      const { service } = create({ consultations: rows() });

      const period = await service.list(
        doctorA,
        query({ from: '2026-10-21T00:00:00Z', to: '2026-10-21T23:59:59Z' }),
      );
      const patient = await service.list(
        doctorA,
        query({ patientId: 'patient-a' }),
      );

      expect(period.data.map((item) => item.id)).toEqual(['c2']);
      expect(patient.data.map((item) => item.id)).toEqual(['c3', 'c1']);
    });

    it('searches the name of the patient (both scripts), the reason and the diagnosis', async () => {
      const { service } = create({ consultations: rows() });
      const ids = async (search: string) =>
        (await service.list(doctorA, query({ query: search }))).data.map(
          (item) => item.id,
        );

      expect(await ids('Haddad')).toEqual(['c2']);
      expect(await ids('أمينة')).toEqual(['c3', 'c1']);
      expect(await ids('thoracique')).toEqual(['c1']);
      expect(await ids('Grippe')).toEqual(['c2']);
      expect(await ids('introuvable')).toEqual([]);
    });

    it('filters the consultations with or without a prescription', async () => {
      const { service } = create({
        consultations: rows(),
        prescriptions: [{ id: 'rx1', encounterId: 'c1' }],
      });

      expect(
        (await service.list(doctorA, query({ prescription: 'with' }))).data.map(
          (item) => item.id,
        ),
      ).toEqual(['c1']);
      expect(
        (
          await service.list(doctorA, query({ prescription: 'without' }))
        ).data.map((item) => item.id),
      ).toEqual(['c3', 'c2']);
    });

    it('keeps the consultations recorded by the caller with mine, and none for the administration', async () => {
      const { service } = create({ consultations: rows() });

      expect(
        (await service.list(doctorA, query({ mine: true }))).data.map(
          (item) => item.id,
        ),
      ).toEqual(['c2', 'c1']);
      expect((await service.list(admin, query({ mine: true }))).data).toEqual(
        [],
      );
    });

    it('counts the prescriptions and the current reports of each consultation', async () => {
      const { service } = create({
        consultations: rows(),
        prescriptions: [
          { id: 'rx1', encounterId: 'c1' },
          { id: 'rx2', encounterId: 'c1' },
        ],
        reports: [
          { id: 'r1', encounterId: 'c1', supersededAt: new Date() },
          { id: 'r2', encounterId: 'c1', supersededAt: null },
        ],
      });

      const [, , first] = (await service.list(doctorA, query())).data;

      expect(first).toMatchObject({
        id: 'c1',
        prescriptionCount: 2,
        reportCount: 1,
        appointmentId: 'apt-1',
        patient: { lastName: 'Benali' },
        doctor: { fullName: 'Dr profile-a' },
      });
    });
  });

  describe('detail', () => {
    const prescription = (
      id: string,
      encounterId: string,
      patientId: string,
      workspaceId = 'ws-a',
      status = 'VALIDATED',
    ) => ({
      id,
      number: `ORD-${id}`,
      status,
      type: 'STANDARD',
      prescribedAt: new Date('2026-10-20T10:00:00Z'),
      validUntil: null,
      encounterId,
      patientId,
      workspaceId,
      itemCount: 2,
    });
    const report = (
      id: string,
      encounterId: string,
      patientId: string,
      extra: Row = {},
    ) => ({
      id,
      number: `CR-${id}`,
      status: 'FINAL',
      category: 'CONSULTATION_NOTE',
      sourceType: 'CONSULTATION',
      title: 'Note',
      version: 1,
      effectiveAt: new Date('2026-10-20T11:00:00Z'),
      finalizedAt: new Date('2026-10-20T11:05:00Z'),
      encounterId,
      patientId,
      workspaceId: 'ws-a',
      supersededAt: null,
      ...extra,
    });

    it('returns the patient, the doctor, the appointment, the prescriptions and the reports of the consultation', async () => {
      const { service } = create({
        consultations: rows(),
        prescriptions: [prescription('rx1', 'c1', 'patient-a')],
        reports: [report('r1', 'c1', 'patient-a')],
      });

      const detail = await service.findOne(doctorA, 'c1');

      expect(detail).toMatchObject({
        id: 'c1',
        reason: 'Douleur thoracique',
        treatment: 'Aucun',
        patient: {
          id: 'patient-a',
          birthDate: '1985-03-12',
          hospitalRecordNumber: 'DOS-1',
        },
        doctor: { fullName: 'Dr profile-a', speciality: 'Cardiologie' },
        appointment: { id: 'apt-1', status: 'COMPLETED', durationMinutes: 30 },
      });
      expect(detail.prescriptions).toEqual([
        expect.objectContaining({
          id: 'rx1',
          number: 'ORD-rx1',
          status: 'VALIDATED',
          effectiveStatus: 'VALIDATED',
          itemCount: 2,
        }),
      ]);
      expect(detail.reports).toEqual([
        expect.objectContaining({
          id: 'r1',
          number: 'CR-r1',
          category: 'CONSULTATION_NOTE',
          status: 'FINAL',
          version: 1,
        }),
      ]);
    });

    it('ignores the prescriptions and the reports of another patient or workspace, and the replaced versions', async () => {
      const { service } = create({
        consultations: rows(),
        prescriptions: [
          prescription('rx-own', 'c1', 'patient-a'),
          prescription('rx-stray', 'c1', 'patient-a2'),
          prescription('rx-elsewhere', 'c1', 'patient-a', 'ws-b'),
          prescription('rx-other-consultation', 'c2', 'patient-a'),
        ],
        reports: [
          report('r-own', 'c1', 'patient-a', { version: 2 }),
          report('r-old', 'c1', 'patient-a', { supersededAt: new Date() }),
          report('r-stray', 'c1', 'patient-b'),
        ],
      });

      const detail = await service.findOne(doctorA, 'c1');

      expect(detail.prescriptions.map((item) => item.id)).toEqual(['rx-own']);
      expect(detail.reports.map((item) => item.id)).toEqual(['r-own']);
    });

    it('shows a validated prescription past its date as expired, and a consultation with nothing linked', async () => {
      const { service } = create({
        consultations: rows(),
        prescriptions: [
          {
            ...prescription('rx1', 'c2', 'patient-a2'),
            validUntil: new Date(Date.now() - 1000),
          },
        ],
      });

      expect(
        (await service.findOne(doctorA, 'c2')).prescriptions[0],
      ).toMatchObject({ status: 'VALIDATED', effectiveStatus: 'EXPIRED' });
      expect(await service.findOne(doctorA, 'c1')).toMatchObject({
        prescriptions: [],
        reports: [],
      });
    });
  });

  describe('stats', () => {
    it('counts today, this week and this month in the workspace, and the share with a prescription', async () => {
      const { service, prisma } = create({ consultations: rows() });
      prisma.patientConsultation.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(3);

      const stats = await service.stats(doctorA);

      expect(stats).toEqual({
        today: 1,
        week: 4,
        month: 8,
        withPrescription: 3,
        prescriptionShare: 38,
      });
      const wheres = prisma.patientConsultation.count.mock.calls.map(
        ([arg]) => arg.where,
      );
      expect(
        wheres.every((where: Row) => where.patient.workspaceId === 'ws-a'),
      ).toBe(true);
      expect(wheres[3].prescriptions).toEqual({ some: {} });
    });

    it('has no share without consultation this month', async () => {
      const { service, prisma } = create({ consultations: [] });
      prisma.patientConsultation.count.mockResolvedValue(0);

      expect(await service.stats(doctorA)).toMatchObject({
        month: 0,
        prescriptionShare: 0,
      });
    });
  });
});
