/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// In-memory rows, untyped on purpose; the workspace authorization is the REAL
// OrganizationAuthorizationService (capability matrix included), only its
// database reads are stubbed. Subject: the whole life of an invitation —
// create, resend, revoke, inspect, accept — and the exact error contract the
// public acceptance page reads.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { WorkspaceMembershipRole, WorkspaceType } from '@prisma/client';
import { createHash } from 'node:crypto';

import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { AcceptTeamInvitationDto } from './dto/accept-team-invitation.dto';
import { TeamInvitationService } from './team-invitation.service';

const ADMIN = WorkspaceMembershipRole.ADMIN;
const DOCTOR = WorkspaceMembershipRole.DOCTOR;
const OWNER = WorkspaceMembershipRole.OWNER;

const ownerActor = {
  role: 'ESTABLISHMENT_ADMIN',
  sub: 'user-owner',
} as const;

// The raw token the specs hold; its SHA-256 is what the fixtures store.
const INVITE_TOKEN = 'a'.repeat(43);
const sha256 = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const WORKSPACE_NAME = 'Clinique El Amel';

function requestContext() {
  return { ipAddress: '127.0.0.1', userAgent: 'jest' };
}

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000);

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    acceptedAt: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    email: 'invite@example.dz',
    expiresAt: future(72),
    id: 'invitation-1',
    invitedById: 'user-owner',
    revokedAt: null,
    role: DOCTOR,
    tokenHash: sha256(INVITE_TOKEN),
    workspaceId: 'ws-1',
    ...overrides,
  };
}

// Reads the error code the same way the frontend does: from the response
// body. A resolution (no rejection) yields an empty code, which keeps the
// failure visible in the assertion rather than in the helper.
async function rejectCode(run: () => Promise<unknown>): Promise<{
  code: string;
  error: unknown;
}> {
  const caught = await run().then(
    () => undefined,
    (error: unknown) => error,
  );
  const error = caught as
    | {
        getResponse: () => { code?: string };
      }
    | undefined;

  return {
    code:
      typeof error?.getResponse === 'function'
        ? (error.getResponse().code ?? '')
        : '',
    error: caught,
  };
}

function build(
  options: {
    actorRole: WorkspaceMembershipRole;
  } = { actorRole: OWNER },
) {
  const contextService = {
    resolveWorkspaceForUser: jest.fn(() => ({
      establishmentId: 'est-1',
      membershipRole: options.actorRole,
      workspaceId: 'ws-1',
      workspaceType: WorkspaceType.ESTABLISHMENT,
    })),
  };

  const createdUsers: Array<Record<string, unknown>> = [];
  const createdDoctors: Array<Record<string, unknown>> = [];
  const createdMemberships: Array<Record<string, unknown>> = [];
  const transaction = {
    doctorProfile: {
      create: jest.fn((input: { data: Record<string, unknown> }) => {
        createdDoctors.push(input.data);

        return { id: 'dp-new' };
      }),
    },
    user: {
      create: jest.fn((input: { data: Record<string, unknown> }) => {
        createdUsers.push(input.data);

        return { id: 'user-new' };
      }),
      findUnique: jest.fn(() => null) as jest.Mock,
    },
    workspaceInvitation: {
      updateMany: jest.fn(() => ({ count: 1 })) as jest.Mock,
    },
    workspaceMembership: {
      create: jest.fn((input: { data: Record<string, unknown> }) => {
        createdMemberships.push(input.data);

        return {};
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn((work: (client: unknown) => unknown) =>
      work(transaction),
    ),
    user: {
      // The authorization reads the account by id (must be ACTIVE for the
      // actor); the "existing account" check reads by e-mail (defaults to
      // none here). One mock, two lookup shapes. Several tests replace it
      // with a different row; typed loose on purpose.
      findUnique: jest.fn(
        ({ where }: { where: { email?: string; id?: string } }) =>
          where.id ? { accountStatus: 'ACTIVE' } : null,
      ) as jest.Mock,
    },
    workspace: {
      findUnique: jest.fn(() => ({
        establishment: {
          id: 'est-1',
          name: WORKSPACE_NAME,
          ownerId: 'user-owner',
          subscriptionStatus: 'ACTIVE',
        },
        id: 'ws-1',
        name: WORKSPACE_NAME,
        type: WorkspaceType.ESTABLISHMENT,
      })),
    },
    workspaceInvitation: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => ({
        ...invitationRow(),
        invitedBy: { fullName: 'Dr Propriétaire' },
        ...data,
      })),
      findFirst: jest.fn(() => null) as jest.Mock,
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; tokenHash?: string } }) => {
          // By id (management paths) and by tokenHash (public paths): an
          // unknown hash or id must NOT resolve to the fixture row.
          if (where.id !== undefined) {
            return where.id === 'invitation-1'
              ? {
                  ...invitationRow(),
                  invitedBy: { fullName: 'Dr Propriétaire' },
                }
              : null;
          }

          return where.tokenHash === sha256(INVITE_TOKEN)
            ? { ...invitationRow(), invitedBy: { fullName: 'Dr Propriétaire' } }
            : null;
        },
      ) as jest.Mock,
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data?: Record<string, unknown>;
        }) => ({
          ...invitationRow(),
          id: where.id,
          invitedBy: { fullName: 'Dr Propriétaire' },
          ...data,
        }),
      ),
      updateMany: jest.fn(),
    },
  };

  const authorization = new OrganizationAuthorizationService(
    prisma as never,
    contextService as never,
  );
  const audits: Array<Record<string, unknown>> = [];
  const auditLogsService = {
    createAuditLog: jest.fn((entry: Record<string, unknown>) => {
      audits.push(entry);

      return {};
    }),
  };
  const entitlements = {
    getEntitlements: jest.fn(() => ({
      quotas: { maxDoctors: 10 },
      usage: { doctors: 0 },
    })),
    withQuota: jest.fn(
      (
        _workspaceId: string,
        _quota: string,
        run: (client: unknown) => unknown,
      ) => run(transaction),
    ),
  };
  const sentMails: Array<{ to: string; text: string }> = [];
  const mailService = {
    publicUrl: 'https://app.test',
    send: jest.fn((message: { to: string; text: string }) => {
      sentMails.push(message);

      return undefined;
    }),
  };
  const notificationProducer = { create: jest.fn(() => ({})) };
  const authService = { hashPassword: jest.fn(() => '$2a$hash') };

  const service = new TeamInvitationService(
    prisma as never,
    authorization,
    auditLogsService as never,
    entitlements as never,
    mailService as never,
    notificationProducer as never,
    authService as never,
  );

  return {
    audits,
    auditLogsService,
    authService,
    entitlements,
    mailService,
    notificationProducer,
    prisma,
    service,
    transaction,
  };
}

describe('TeamInvitationService.createInvitation', () => {
  it('creates a pending doctor invitation, mails the only link and audits neither the token nor the e-mail', async () => {
    const mock = build();

    const view = await mock.service.createInvitation(
      ownerActor,
      { email: ' Invite@Example.dz ', role: DOCTOR },
      requestContext(),
    );

    // The e-mail is normalized before anything is stored or mailed.
    expect(view).toMatchObject({
      email: 'invite@example.dz',
      role: DOCTOR,
      status: 'PENDING',
    });

    const stored = mock.prisma.workspaceInvitation.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    // The link in the mail carries the raw token; exactly one is sent.
    expect(mock.mailService.send).toHaveBeenCalledTimes(1);
    const mail = mock.mailService.send.mock.calls[0][0];
    expect(mail.to).toBe('invite@example.dz');
    expect(mail.text).toContain(
      `${mock.mailService.publicUrl}/invite/accept?token=`,
    );
    expect(mail.text).toContain(WORKSPACE_NAME);

    // Audit line: role and workspace, nothing else.
    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TEAM_INVITATION_CREATED',
        metadata: { role: DOCTOR, workspaceId: 'ws-1' },
      }),
    );
  });

  it('refuses a second pending invitation for the same inbox', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findFirst = jest.fn(() => ({
      id: 'pending-1',
    }));

    const { code, error } = await rejectCode(() =>
      mock.service.createInvitation(
        ownerActor,
        { email: 'invite@example.dz', role: DOCTOR },
        requestContext(),
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(code).toBe('TEAM_INVITATION_ALREADY_PENDING');
    expect(mock.prisma.workspaceInvitation.create).not.toHaveBeenCalled();
  });

  it('refuses an e-mail an existing account holds, before inviting', async () => {
    const mock = build();
    mock.prisma.user.findUnique = jest.fn(() => ({
      id: 'user-existing',
    }));

    const { code } = await rejectCode(() =>
      mock.service.createInvitation(
        ownerActor,
        { email: 'invite@example.dz', role: DOCTOR },
        requestContext(),
      ),
    );

    expect(code).toBe('ACCOUNT_ALREADY_EXISTS');
    expect(mock.mailService.send).not.toHaveBeenCalled();
    expect(mock.prisma.workspaceInvitation.create).not.toHaveBeenCalled();
  });

  it('an ADMIN actor cannot invite another ADMIN: the inviteAdmin capability is owner-only', async () => {
    const mock = build({ actorRole: ADMIN });

    await expect(
      mock.service.createInvitation(
        ownerActor,
        { email: 'invite@example.dz', role: ADMIN },
        requestContext(),
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mock.prisma.workspaceInvitation.create).not.toHaveBeenCalled();
    expect(mock.mailService.send).not.toHaveBeenCalled();
  });

  it('OWNER and RECEPTIONIST roles cannot be invited at all', async () => {
    const mock = build();

    const { code } = await rejectCode(() =>
      mock.service.createInvitation(
        ownerActor,
        { email: 'invite@example.dz', role: OWNER },
        requestContext(),
      ),
    );

    expect(code).toBe('TEAM_INVITATION_ROLE_NOT_ALLOWED');
  });
});

describe('TeamInvitationService.resendInvitation', () => {
  it('rotates the stored hash, extends the window and mails the new link', async () => {
    const mock = build();

    const view = await mock.service.resendInvitation(
      ownerActor,
      'invitation-1',
      requestContext(),
    );

    expect(view).toMatchObject({
      id: 'invitation-1',
      invitedByFullName: 'Dr Propriétaire',
      status: 'PENDING',
    });
    const rotated = mock.prisma.workspaceInvitation.update.mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(rotated.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rotated.expiresAt).toBeInstanceOf(Date);
    expect(mock.mailService.send).toHaveBeenCalledTimes(1);
    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TEAM_INVITATION_RESENT' }),
    );
  });

  it('an accepted invitation cannot be resent', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ acceptedAt: new Date() }),
      invitedBy: { fullName: 'x' },
    }));

    const { code, error } = await rejectCode(() =>
      mock.service.resendInvitation(
        ownerActor,
        'invitation-1',
        requestContext(),
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(code).toBe('INVITATION_ALREADY_USED');
  });

  it('a revoked invitation cannot be resent either', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ revokedAt: new Date() }),
      invitedBy: { fullName: 'x' },
    }));

    const { code } = await rejectCode(() =>
      mock.service.resendInvitation(
        ownerActor,
        'invitation-1',
        requestContext(),
      ),
    );

    expect(code).toBe('INVITATION_REVOKED');
  });

  it('an invitation of another workspace answers the missing 404', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ workspaceId: 'ws-2' }),
      invitedBy: { fullName: 'x' },
    }));

    await expect(
      mock.service.resendInvitation(
        ownerActor,
        'invitation-1',
        requestContext(),
      ),
    ).rejects.toThrow(new Error('Ressource introuvable.'));
    expect(mock.prisma.workspaceInvitation.update).not.toHaveBeenCalled();
  });
});

describe('TeamInvitationService.revokeInvitation', () => {
  it('revokes a pending invitation and keeps the audit minimal', async () => {
    const mock = build();

    const view = await mock.service.revokeInvitation(
      ownerActor,
      'invitation-1',
      requestContext(),
    );

    expect(view.status).toBe('REVOKED');
    expect(mock.prisma.workspaceInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'invitation-1' } }),
    );
    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TEAM_INVITATION_REVOKED',
        metadata: { role: DOCTOR, workspaceId: 'ws-1' },
      }),
    );
  });

  it('revoking twice stays a success and audits once', async () => {
    const mock = build();

    await mock.service.revokeInvitation(
      ownerActor,
      'invitation-1',
      requestContext(),
    );
    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledTimes(1);

    // Second call re-reads a revoked row: no update, no second audit.
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ revokedAt: new Date('2026-10-21T00:00:00Z') }),
      invitedBy: { fullName: 'x' },
    }));

    const view = await mock.service.revokeInvitation(
      ownerActor,
      'invitation-1',
      requestContext(),
    );

    expect(view.status).toBe('REVOKED');
    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('an accepted invitation cannot be revoked', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ acceptedAt: new Date() }),
      invitedBy: { fullName: 'x' },
    }));

    const { code } = await rejectCode(() =>
      mock.service.revokeInvitation(
        ownerActor,
        'invitation-1',
        requestContext(),
      ),
    );

    expect(code).toBe('INVITATION_ALREADY_USED');
  });

  it('an invitation elsewhere in the team is a 404, revoked or not', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ revokedAt: new Date(), workspaceId: 'ws-9' }),
      invitedBy: { fullName: 'x' },
    }));

    await expect(
      mock.service.revokeInvitation(
        ownerActor,
        'invitation-9',
        requestContext(),
      ),
    ).rejects.toThrow(new Error('Ressource introuvable.'));
  });
});

describe('TeamInvitationService.inspectInvitation', () => {
  it('answers the workspace, the establishment, the role and usable=true for a pending one', async () => {
    const mock = build();

    const inspection = await mock.service.inspectInvitation(INVITE_TOKEN);

    expect(inspection).toMatchObject({
      email: 'invite@example.dz',
      establishmentName: WORKSPACE_NAME,
      role: DOCTOR,
      status: 'PENDING',
      usable: true,
      workspaceName: WORKSPACE_NAME,
    });
  });

  it('an expired invitation is refused with its own message', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ expiresAt: new Date(Date.now() - 1000) }),
      invitedBy: { fullName: 'x' },
    }));

    const { code, error } = await rejectCode(() =>
      mock.service.inspectInvitation(INVITE_TOKEN),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(code).toBe('INVITATION_EXPIRED');
  });

  it('a revoked invitation is likewise refused at inspect', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ revokedAt: new Date() }),
      invitedBy: { fullName: 'x' },
    }));

    const { code } = await rejectCode(() =>
      mock.service.inspectInvitation(INVITE_TOKEN),
    );

    expect(code).toBe('INVITATION_REVOKED');
  });

  it('an already accepted invitation is answered INVITATION_ALREADY_USED at inspect', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ acceptedAt: new Date() }),
      invitedBy: { fullName: 'x' },
    }));

    const { code, error } = await rejectCode(() =>
      mock.service.inspectInvitation(INVITE_TOKEN),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(code).toBe('INVITATION_ALREADY_USED');
  });

  it('a malformed token and an unknown one are the same INVITATION_INVALID ', async () => {
    const mock = build();

    const malformed = await rejectCode(() =>
      mock.service.inspectInvitation('not-a-token'),
    );
    expect(malformed.code).toBe('INVITATION_INVALID');
    expect(malformed.error).toBeInstanceOf(BadRequestException);

    const unknown = await rejectCode(() =>
      mock.service.inspectInvitation('b'.repeat(43)),
    );
    expect(unknown.code).toBe('INVITATION_INVALID');
  });
});

describe('TeamInvitationService.acceptInvitation', () => {
  const acceptDto = (
    overrides: Partial<AcceptTeamInvitationDto> = {},
  ): AcceptTeamInvitationDto => ({
    confirmPassword: 'Nouveau-mdp-2026',
    fullName: 'Dr Yamina Ait',
    password: 'Nouveau-mdp-2026',
    phone: '0770 11 22 44',
    professionalAddress: '1 rue de la Santé, Alger',
    speciality: 'Cardiologie',
    token: INVITE_TOKEN,
    wilaya: 'Alger',
    ...overrides,
  });

  it('creates an ACTIVE e-mail-verified doctor account, a DRAFT profile and the membership, under the quota lock', async () => {
    const mock = build();

    const outcome = await mock.service.acceptInvitation(
      acceptDto(),
      requestContext(),
    );

    expect(outcome.email).toBe('invite@example.dz');
    expect(outcome.message).toContain('compte');

    expect(mock.authService.hashPassword).toHaveBeenCalledWith(
      'Nouveau-mdp-2026',
    );
    expect(mock.entitlements.withQuota).toHaveBeenCalledWith(
      'ws-1',
      'maxDoctors',
      expect.any(Function),
    );

    const createdUser = mock.transaction.user.create.mock.calls[0][0].data;
    expect(createdUser).toMatchObject({
      accountStatus: 'ACTIVE',
      email: 'invite@example.dz',
      isEmailVerified: true,
      isPhoneVerified: false,
      passwordHash: '$2a$hash',
      role: 'AFFILIATED_DOCTOR',
    });

    const createdProfile =
      mock.transaction.doctorProfile.create.mock.calls[0][0].data;
    expect(createdProfile).toMatchObject({
      establishmentId: 'est-1',
      isIndependent: false,
      professionalAddress: '1 rue de la Santé, Alger',
      speciality: 'Cardiologie',
      subscriptionStatus: 'ACTIVE',
      verificationStatus: 'DRAFT',
      wilaya: 'Alger',
    });

    const membership =
      mock.transaction.workspaceMembership.create.mock.calls[0][0].data;
    expect(membership).toMatchObject({
      role: DOCTOR,
      status: 'ACTIVE',
      userId: 'user-new',
      workspaceId: 'ws-1',
    });

    // The claim is conditional: not accepted, not revoked, not expired.
    const claim = mock.transaction.workspaceInvitation.updateMany.mock
      .calls[0][0] as unknown as {
      data: Record<string, unknown>;
      where: Record<string, unknown>;
    };
    expect(claim.where).toMatchObject({
      acceptedAt: null,
      id: 'invitation-1',
      revokedAt: null,
    });

    expect(mock.auditLogsService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TEAM_INVITATION_ACCEPTED',
        entityId: 'user-new',
        metadata: {
          invitationId: 'invitation-1',
          role: DOCTOR,
          workspaceId: 'ws-1',
        },
      }),
      expect.anything(),
    );
    expect(mock.notificationProducer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DOCTOR_ACCOUNT_CREATED',
        userId: 'user-new',
        workspaceId: 'ws-1',
      }),
    );
    // Sent after the commit, never inside the transaction: the producer
    // re-checks the membership with its own client, which must see the
    // committed account.
    expect(
      mock.entitlements.withQuota.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mock.notificationProducer.create.mock.invocationCallOrder[0],
    );
  });

  it('an ADMIN invitation creates an admin account and consumes no doctor seat', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ role: ADMIN }),
      invitedBy: { fullName: 'x' },
    }));

    await mock.service.acceptInvitation(acceptDto(), requestContext());

    expect(mock.entitlements.withQuota).not.toHaveBeenCalled();
    expect(mock.prisma.$transaction).toHaveBeenCalled();
    expect(mock.transaction.doctorProfile.create).not.toHaveBeenCalled();
    expect(mock.transaction.user.create.mock.calls[0][0].data.role).toBe(
      'ESTABLISHMENT_ADMIN',
    );
  });

  it('the second acceptance of one link loses the claim', async () => {
    const mock = build();
    mock.transaction.workspaceInvitation.updateMany = jest.fn(() => ({
      count: 0,
    }));

    const { code, error } = await rejectCode(() =>
      mock.service.acceptInvitation(acceptDto(), requestContext()),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(code).toBe('INVITATION_ALREADY_USED');
    expect(mock.transaction.user.create).not.toHaveBeenCalled();
  });

  it('an account registered meanwhile with the same e-mail is refused, everything rolled back', async () => {
    const mock = build();
    mock.transaction.user.findUnique = jest.fn(() => ({
      id: 'user-race',
    }));

    const { code } = await rejectCode(() =>
      mock.service.acceptInvitation(acceptDto(), requestContext()),
    );

    expect(code).toBe('ACCOUNT_ALREADY_EXISTS');
    expect(mock.transaction.user.create).not.toHaveBeenCalled();
  });

  it('a phone already in use is refused with its own code', async () => {
    const mock = build();
    let call = 0;
    mock.transaction.user.findUnique = jest.fn(() => {
      call += 1;

      return call === 2 ? { id: 'user-phone-owner' } : null;
    });

    const { code } = await rejectCode(() =>
      mock.service.acceptInvitation(acceptDto(), requestContext()),
    );

    expect(code).toBe('PHONE_ALREADY_USED');
  });

  it('an unknown token is INVITATION_INVALID, regardless of the form fields', async () => {
    const mock = build();

    const { code } = await rejectCode(() =>
      mock.service.acceptInvitation(
        acceptDto({ token: 'b'.repeat(43) }),
        requestContext(),
      ),
    );

    expect(code).toBe('INVITATION_INVALID');
    expect(mock.transaction.user.create).not.toHaveBeenCalled();
  });

  it('an expired invitation is a 400 INVITATION_EXPIRED before anything is written', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ expiresAt: new Date(Date.now() - 1000) }),
      invitedBy: { fullName: 'x' },
    }));

    const { code, error } = await rejectCode(() =>
      mock.service.acceptInvitation(acceptDto(), requestContext()),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(code).toBe('INVITATION_EXPIRED');
    expect(mock.authService.hashPassword).not.toHaveBeenCalled();
  });

  it('a revoked invitation is a 400 INVITATION_REVOKED before anything is written', async () => {
    const mock = build();
    mock.prisma.workspaceInvitation.findUnique = jest.fn(() => ({
      ...invitationRow({ revokedAt: new Date() }),
      invitedBy: { fullName: 'x' },
    }));

    const { code } = await rejectCode(() =>
      mock.service.acceptInvitation(acceptDto(), requestContext()),
    );

    expect(code).toBe('INVITATION_REVOKED');
    expect(mock.transaction.user.create).not.toHaveBeenCalled();
  });

  it('accepted doctor professional data is optional: empty strings, profile stays DRAFT', async () => {
    const mock = build();

    const outcome = await mock.service.acceptInvitation(
      acceptDto({
        professionalAddress: undefined,
        speciality: undefined,
        wilaya: undefined,
      }),
      requestContext(),
    );

    const createdProfile =
      mock.transaction.doctorProfile.create.mock.calls[0][0].data;
    expect(createdProfile.speciality).toBe('');
    expect(createdProfile.wilaya).toBe('');
    expect(createdProfile.professionalAddress).toBe('');
    expect(createdProfile.verificationStatus).toBe('DRAFT');
    expect(outcome.message).toContain('compte');
  });

  it('nothing in the acceptance response or audit carries the token', async () => {
    const mock = build();

    const outcome = await mock.service.acceptInvitation(
      acceptDto(),
      requestContext(),
    );

    expect(JSON.stringify(outcome)).not.toContain(INVITE_TOKEN);
    const audit = mock.audits.find(
      (entry) => entry.action === 'TEAM_INVITATION_ACCEPTED',
    ) as { metadata: Record<string, unknown> } | undefined;
    expect(audit?.metadata).toEqual({
      invitationId: 'invitation-1',
      role: DOCTOR,
      workspaceId: 'ws-1',
    });
  });
});
