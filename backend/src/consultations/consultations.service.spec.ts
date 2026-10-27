/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConsultationStatus } from '@prisma/client';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type PrismaService } from '../prisma/prisma.service';
import { type ConsultationAuthorizationService } from './consultation-authorization.service';
import { ConsultationsService, periodStarts } from './consultations.service';

const doctor = {
  sub: 'user-doctor',
  role: 'INDEPENDENT_DOCTOR',
} as AuthenticatedUserPayload;
const admin = {
  sub: 'user-admin',
  role: 'ESTABLISHMENT_ADMIN',
} as AuthenticatedUserPayload;

type ConsultationState = {
  id: string;
  workspaceId: string;
  patientId: string;
  doctorProfileId: string;
  status: ConsultationStatus;
  startedAt: Date | null;
  chiefComplaint: string | null;
  clinicalExamination: string | null;
  assessment: string | null;
  carePlan?: string | null;
  _count: { diagnoses: number };
};

function setup(initial: Partial<ConsultationState> = {}) {
  const state: ConsultationState = {
    id: 'consultation-1',
    workspaceId: 'workspace-1',
    patientId: 'patient-1',
    doctorProfileId: 'doctor-profile-1',
    status: ConsultationStatus.DRAFT,
    startedAt: null,
    chiefComplaint: null,
    clinicalExamination: null,
    assessment: null,
    carePlan: null,
    _count: { diagnoses: 0 },
    ...initial,
  };
  const audits: Array<Record<string, unknown>> = [];
  const addenda: Array<Record<string, unknown>> = [];
  const diagnoses: Array<Record<string, unknown>> = [];

  const prisma: any = {
    patient: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.id === 'patient-1' && where.workspaceId === 'workspace-1'
            ? { id: 'patient-1' }
            : null,
        ),
      ),
    },
    appointment: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.id === 'appointment-1' &&
            where.patientId === 'patient-1' &&
            where.doctorProfileId === 'doctor-profile-1'
            ? { id: 'appointment-1' }
            : null,
        ),
      ),
    },
    patientConsultation: {
      create: jest.fn(({ data }: any) => {
        Object.assign(state, data);
        return Promise.resolve(state);
      }),
      update: jest.fn(({ data }: any) => {
        Object.assign(state, data);
        return Promise.resolve(state);
      }),
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.id === state.id && where.workspaceId === state.workspaceId
            ? state
            : null,
        ),
      ),
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(0)),
    },
    consultationDiagnosis: {
      deleteMany: jest.fn(() => {
        diagnoses.splice(0);
        state._count.diagnoses = 0;
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn(({ data }: any) => {
        diagnoses.push(...data);
        state._count.diagnoses = data.length;
        return Promise.resolve({ count: data.length });
      }),
    },
    consultationVitalSigns: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    consultationAddendum: {
      create: jest.fn(({ data }: any) => {
        const addendum = { id: `addendum-${addenda.length + 1}`, ...data };
        addenda.push(addendum);
        return Promise.resolve(addendum);
      }),
    },
    prescription: { findMany: jest.fn(() => Promise.resolve([])) },
    clinicalReport: { findMany: jest.fn(() => Promise.resolve([])) },
    doctorProfile: { findUnique: jest.fn(() => Promise.resolve(null)) },
    $transaction: jest.fn((work: any) =>
      Array.isArray(work) ? Promise.all(work) : work(prisma),
    ),
  };
  const authorization = {
    capabilities: jest.fn((role: string) => ({
      canViewConsultations: role !== 'SUPER_ADMIN',
      canCreateConsultation: role !== 'ESTABLISHMENT_ADMIN',
      canCompleteConsultation: role !== 'ESTABLISHMENT_ADMIN',
    })),
    resolveWorkspace: jest.fn((user: AuthenticatedUserPayload) =>
      user.role === 'SUPER_ADMIN'
        ? Promise.reject(new ForbiddenException())
        : Promise.resolve({ workspaceId: 'workspace-1' }),
    ),
    resolvePhysician: jest.fn((user: AuthenticatedUserPayload) =>
      user.role === 'ESTABLISHMENT_ADMIN'
        ? Promise.reject(new ForbiddenException())
        : Promise.resolve({
            workspace: { workspaceId: 'workspace-1' },
            doctorProfileId: 'doctor-profile-1',
          }),
    ),
    assertResponsibleDoctor: jest.fn(
      (consultation: ConsultationState, doctorProfileId: string) => {
        if (consultation.doctorProfileId !== doctorProfileId) {
          throw new ForbiddenException();
        }
      },
    ),
  };
  const audit = {
    createAuditLog: jest.fn((entry: Record<string, unknown>) => {
      audits.push(entry);
      return Promise.resolve(entry);
    }),
  };
  const service = new ConsultationsService(
    prisma as PrismaService,
    authorization as unknown as ConsultationAuthorizationService,
    audit as unknown as AuditLogsService,
  );
  return {
    addenda,
    audit,
    audits,
    authorization,
    diagnoses,
    prisma,
    service,
    state,
  };
}

function bypassResponse(service: ConsultationsService) {
  return jest
    .spyOn(service, 'findOne')
    .mockImplementation((_user, id) => Promise.resolve({ id }) as never);
}

describe('periodStarts', () => {
  it('uses midnight in Algiers and Monday as the first day of the week', () => {
    const starts = periodStarts(new Date('2026-10-23T22:30:00Z'));
    expect(starts.today.toISOString()).toBe('2026-10-22T23:00:00.000Z');
    expect(starts.week.toISOString()).toBe('2026-10-18T23:00:00.000Z');
    expect(starts.month.toISOString()).toBe('2026-09-30T23:00:00.000Z');
  });
});

describe('ConsultationsService structured lifecycle', () => {
  it('creates a physician-owned draft and audits it', async () => {
    const { audits, service, state } = setup();
    bypassResponse(service);

    await service.create(doctor, { patientId: 'patient-1' });

    expect(state).toMatchObject({
      workspaceId: 'workspace-1',
      patientId: 'patient-1',
      doctorProfileId: 'doctor-profile-1',
      status: ConsultationStatus.DRAFT,
    });
    expect(audits.at(-1)).toMatchObject({
      action: 'CONSULTATION_CREATED',
      metadata: { status: ConsultationStatus.DRAFT },
    });
  });

  it('does not reveal a consultation from another workspace', async () => {
    const { authorization, service } = setup();
    authorization.resolveWorkspace.mockResolvedValueOnce({
      workspaceId: 'workspace-2',
    });

    await expect(
      service.findOne(doctor, 'consultation-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a patient from another workspace', async () => {
    const { service } = setup();
    await expect(
      service.create(doctor, { patientId: 'patient-other' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an appointment belonging to another patient or physician', async () => {
    const { service } = setup();
    await expect(
      service.create(doctor, {
        patientId: 'patient-1',
        appointmentId: 'appointment-other',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates a draft with structured fields and diagnostics', async () => {
    const { diagnoses, service, state } = setup();
    bypassResponse(service);

    await service.update(doctor, state.id, {
      chiefComplaint: 'Douleur thoracique',
      carePlan: 'Surveillance',
      diagnoses: [{ label: 'Douleur thoracique', isPrimary: true }],
    });

    expect(state).toMatchObject({
      chiefComplaint: 'Douleur thoracique',
      carePlan: 'Surveillance',
    });
    expect(diagnoses).toHaveLength(1);
  });

  it('keeps completed clinical content immutable', async () => {
    const { service, state } = setup({
      status: ConsultationStatus.COMPLETED,
      chiefComplaint: 'Contenu signé',
    });

    await expect(
      service.update(doctor, state.id, { chiefComplaint: 'Tentative' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.chiefComplaint).toBe('Contenu signé');
  });

  it('prevents an establishment administrator from finalizing', async () => {
    const { service } = setup({ chiefComplaint: 'Contrôle' });
    await expect(
      service.complete(admin, 'consultation-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('finalizes once, records the signer and audits minimal metadata', async () => {
    const { audits, service, state } = setup({
      status: ConsultationStatus.IN_PROGRESS,
      chiefComplaint: 'Contrôle',
      startedAt: new Date('2026-10-27T08:00:00Z'),
    });
    bypassResponse(service);

    await service.complete(doctor, state.id);
    await service.complete(doctor, state.id);

    expect(state).toMatchObject({
      status: ConsultationStatus.COMPLETED,
      completedById: doctor.sub,
    });
    expect(
      audits.filter((entry) => entry.action === 'CONSULTATION_COMPLETED'),
    ).toHaveLength(1);
    expect(audits.at(-1)?.metadata).toEqual({
      status: ConsultationStatus.COMPLETED,
    });
  });

  it('requires meaningful clinical content before finalization', async () => {
    const { service } = setup();
    await expect(
      service.complete(doctor, 'consultation-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds a traceable addendum without changing the signed content', async () => {
    const { addenda, audits, service, state } = setup({
      status: ConsultationStatus.COMPLETED,
      chiefComplaint: 'Contenu signé',
    });
    bypassResponse(service);

    await service.addAddendum(doctor, state.id, {
      content: 'Correction datée et signée',
    });

    expect(state.chiefComplaint).toBe('Contenu signé');
    expect(addenda[0]).toMatchObject({
      consultationId: state.id,
      authorId: doctor.sub,
      content: 'Correction datée et signée',
    });
    expect(audits.at(-1)?.action).toBe('CONSULTATION_ADDENDUM_CREATED');
  });
});
