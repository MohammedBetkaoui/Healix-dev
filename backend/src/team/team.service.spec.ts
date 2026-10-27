// In-memory rows, untyped on purpose: they stand in for Prisma, whatever the
// services ask for. The workspace authorization is the REAL
// OrganizationAuthorizationService (capability matrix included), only its
// database reads are stubbed.
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { WorkspaceMembershipRole, WorkspaceType } from '@prisma/client';

import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { TeamService } from './team.service';

type Row = Record<string, any>;

const OWNER = WorkspaceMembershipRole.OWNER;
const ADMIN = WorkspaceMembershipRole.ADMIN;
const DOCTOR = WorkspaceMembershipRole.DOCTOR;

const ownerActor: Pick<AuthenticatedUserPayload, 'role' | 'sub'> = {
  role: 'ESTABLISHMENT_ADMIN',
  sub: 'user-owner',
};

function requestContext() {
  return { ipAddress: '127.0.0.1', userAgent: 'jest' };
}

function memberRow(overrides: Row = {}): Row {
  return {
    createdAt: new Date('2026-01-01T09:00:00Z'),
    id: 'membership-doctor',
    role: DOCTOR,
    user: {
      accountStatus: 'ACTIVE',
      email: 'doctor@example.dz',
      fullName: 'Dr Yamina Ait',
      id: 'user-doctor',
      isEmailVerified: true,
    },
    userId: 'user-doctor',
    workspaceId: 'ws-1',
    ...overrides,
  };
}

function build(options: {
  actorRole: WorkspaceMembershipRole;
  member?: Row | null;
  members?: Row[];
  entitlements?: Partial<{ maxDoctors: number | null; usageDoctors: number }>;
}) {
  const contextService = {
    resolveWorkspaceForUser: jest.fn(() => ({
      establishmentId: 'est-1',
      membershipRole: options.actorRole,
      workspaceId: 'ws-1',
      workspaceType: WorkspaceType.ESTABLISHMENT,
    })),
  };

  const transaction = {
    refreshToken: { updateMany: jest.fn(() => ({ count: 2 })) },
    user: {
      update: jest.fn(() => ({ accountStatus: 'ACTIVE' })),
    },
    workspaceInvitation: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: unknown) => unknown) =>
      work(transaction),
    ),
    refreshToken: { updateMany: jest.fn() },
    user: {
      findUnique: jest.fn(() => ({ accountStatus: 'ACTIVE' })),
      update: jest.fn(() => ({ accountStatus: 'ACTIVE' })),
    },
    workspace: {
      findUnique: jest.fn(() => ({
        establishment: { ownerId: 'user-owner' },
      })),
    },
    workspaceInvitation: { findMany: jest.fn(() => []) },
    workspaceMembership: {
      findMany: jest.fn(() => options.members ?? []),
      findUnique: jest.fn(() => options.member ?? null),
    },
  };

  const authorization = new OrganizationAuthorizationService(
    prisma as never,
    contextService as never,
  );
  const auditLogsService = { createAuditLog: jest.fn(() => ({})) };
  const entitlements = {
    getEntitlements: jest.fn(() => ({
      quotas: { maxDoctors: options.entitlements?.maxDoctors ?? 10 },
      usage: { doctors: options.entitlements?.usageDoctors ?? 3 },
    })),
    withQuota: jest.fn(
      (
        _workspaceId: string,
        _quota: string,
        run: (client: unknown) => unknown,
      ) => run(transaction),
    ),
  };
  const realtime = { disconnectUser: jest.fn(() => undefined) };
  const notificationProducer = { create: jest.fn(() => ({})) };
  const passwordResetService = {
    requestReset: jest.fn(() => ({ message: 'sent' })),
  };

  const team = new TeamService(
    prisma as never,
    authorization,
    auditLogsService as never,
    entitlements as never,
    realtime as never,
    notificationProducer as never,
    passwordResetService as never,
  );

  return {
    auditLogsService,
    entitlements,
    notificationProducer,
    passwordResetService,
    prisma,
    realtime,
    team,
  };
}

describe('TeamService.getTeam', () => {
  const managementMember = memberRow({ id: 'membership-admin', role: ADMIN });
  const doctorMember = memberRow();

  it('gives managers everything: members with their e-mail, invitations and usage', async () => {
    const { team } = build({
      actorRole: OWNER,
      members: [managementMember, doctorMember],
      entitlements: { maxDoctors: 5, usageDoctors: 3 },
    });

    const overview = await team.getTeam(ownerActor);

    expect(overview.scope).toBe('FULL');
    expect(overview.members).toHaveLength(2);
    expect(overview.members[0].email).toBe('doctor@example.dz');
    expect(overview.usage).toEqual({ activeDoctors: 3, maxDoctors: 5 });
    expect(overview.invitations).toEqual([]);
    expect(overview.capabilities).toContain('team.suspendMember');
  });

  it('gives doctors only the directory: no e-mail, no invitations, no usage', async () => {
    const { team } = build({
      actorRole: DOCTOR,
      members: [managementMember, doctorMember],
    });

    const overview = await team.getTeam(ownerActor);

    expect(overview.scope).toBe('BASIC');
    expect(overview.members[0].email).toBeNull();
    expect(overview.members[0].isEmailVerified).toBe(false);
    expect(overview.usage).toBeNull();
    expect(overview.invitations).toBeNull();
    expect(overview.capabilities).not.toContain('team.read');
  });
});

describe('TeamService.suspendMember', () => {
  it('suspends the account, revokes the sessions, disconnects realtime, audits and warns the owner', async () => {
    const mock = build({ actorRole: OWNER, member: memberRow() });

    const outcome = await mock.team.suspendMember(
      ownerActor,
      'membership-doctor',
      requestContext(),
    );

    expect(outcome).toEqual({
      accountStatus: 'SUSPENDED',
      membershipId: 'membership-doctor',
    });

    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TEAM_MEMBER_SUSPENDED',
        entityId: 'user-doctor',
        metadata: {
          membershipId: 'membership-doctor',
          role: DOCTOR,
          workspaceId: 'ws-1',
        },
      }),
      expect.anything(),
    );
    expect(mock.realtime.disconnectUser).toHaveBeenCalledWith('user-doctor');
    expect(mock.notificationProducer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TEAM_MEMBER_SUSPENDED',
        userId: 'user-owner',
        workspaceId: 'ws-1',
      }),
    );
  });

  it('never lets the owner be suspended, even by the owner', async () => {
    const mock = build({
      actorRole: OWNER,
      member: memberRow({
        id: 'membership-owner',
        role: OWNER,
        userId: 'user-owner',
      }),
    });

    await expect(
      mock.team.suspendMember(ownerActor, 'membership-owner', requestContext()),
    ).rejects.toThrow(ForbiddenException);

    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
    expect(mock.realtime.disconnectUser).not.toHaveBeenCalled();
  });

  it('an ADMIN actor may only suspend doctors, not other admins', async () => {
    const mock = build({
      actorRole: ADMIN,
      member: memberRow({ role: ADMIN }),
    });

    await expect(
      mock.team.suspendMember(
        ownerActor,
        'membership-doctor',
        requestContext(),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an already suspended member answers 409 without acting again', async () => {
    const mock = build({
      actorRole: OWNER,
      member: memberRow({ user: { accountStatus: 'SUSPENDED' } }),
    });

    await expect(
      mock.team.suspendMember(
        ownerActor,
        'membership-doctor',
        requestContext(),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('a membership of another workspace answers 404 like a missing one', async () => {
    const mock = build({
      actorRole: OWNER,
      member: memberRow({ workspaceId: 'ws-2' }),
    });

    await expect(
      mock.team.suspendMember(
        ownerActor,
        'membership-doctor',
        requestContext(),
      ),
    ).rejects.toThrow(new Error('Ressource introuvable.'));

    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('TeamService.reactivateMember', () => {
  it('takes the seat under the subscription lock for a doctor', async () => {
    const mock = build({
      actorRole: OWNER,
      member: memberRow({ user: { accountStatus: 'SUSPENDED' } }),
    });

    const outcome = await mock.team.reactivateMember(
      ownerActor,
      'membership-doctor',
      requestContext(),
    );

    expect(outcome.accountStatus).toBe('ACTIVE');
    expect(mock.entitlements.withQuota).toHaveBeenCalledWith(
      'ws-1',
      'maxDoctors',
      expect.any(Function),
    );
    expect(mock.notificationProducer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TEAM_MEMBER_REACTIVATED',
        userId: 'user-doctor',
      }),
    );
  });

  it('an administrator reactivation never consumes a doctor seat', async () => {
    const mock = build({
      actorRole: OWNER,
      member: memberRow({
        role: ADMIN,
        user: { accountStatus: 'SUSPENDED' },
      }),
    });

    await mock.team.reactivateMember(
      ownerActor,
      'membership-doctor',
      requestContext(),
    );

    expect(mock.entitlements.withQuota).not.toHaveBeenCalled();
    expect(mock.prisma.$transaction).toHaveBeenCalled();
  });

  it('a target outside the actor\u2019s scope is refused before the seat is taken', async () => {
    const mock = build({
      actorRole: ADMIN,
      member: memberRow({ role: ADMIN }),
    });

    await expect(
      mock.team.reactivateMember(
        ownerActor,
        'membership-doctor',
        requestContext(),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mock.entitlements.withQuota).not.toHaveBeenCalled();
  });
});

describe('TeamService.sendPasswordReset', () => {
  it('sends the self-service link of an active member through the password-reset flow', async () => {
    const mock = build({ actorRole: OWNER, member: memberRow() });

    const outcome = await mock.team.sendPasswordReset(
      ownerActor,
      'membership-doctor',
      requestContext(),
    );

    expect(outcome.message).toContain('lien de réinitialisation');
    expect(mock.passwordResetService.requestReset).toHaveBeenCalledWith(
      'doctor@example.dz',
      requestContext(),
    );
    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TEAM_MEMBER_PASSWORD_RESET_LINK_SENT',
        metadata: {
          membershipId: 'membership-doctor',
          workspaceId: 'ws-1',
        },
      }),
    );
  });

  it('the owner is out of reach of an admin-initiated reset', async () => {
    const mock = build({
      actorRole: OWNER,
      member: memberRow({
        id: 'membership-owner',
        role: OWNER,
        userId: 'user-owner',
      }),
    });

    await expect(
      mock.team.sendPasswordReset(
        ownerActor,
        'membership-owner',
        requestContext(),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mock.passwordResetService.requestReset).not.toHaveBeenCalled();
  });

  it('a suspended member may not receive a reset link while suspended', async () => {
    const mock = build({
      actorRole: OWNER,
      member: memberRow({ user: { accountStatus: 'SUSPENDED' } }),
    });

    await expect(
      mock.team.sendPasswordReset(
        ownerActor,
        'membership-doctor',
        requestContext(),
      ),
    ).rejects.toThrow(ConflictException);
    expect(mock.passwordResetService.requestReset).not.toHaveBeenCalled();
  });

  it('a doctor actor has no sendPasswordReset capability at all', async () => {
    const mock = build({
      actorRole: DOCTOR,
      member: memberRow(),
      members: [],
    });

    await expect(
      mock.team.sendPasswordReset(
        {
          role: 'AFFILIATED_DOCTOR' as const,
          sub: 'user-doctor',
        },
        'membership-admin',
        requestContext(),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mock.passwordResetService.requestReset).not.toHaveBeenCalled();
  });
});
