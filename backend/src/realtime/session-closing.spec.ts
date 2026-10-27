import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdminUsersService } from '../admin/users/admin-users.service';
import { type NotificationProducerService } from '../notifications/notification-producer.service';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { type PrismaService } from '../prisma/prisma.service';
import { TeamService } from '../team/team.service';
import { type RealtimeService } from './realtime.service';
import { passThroughEntitlements } from '../subscriptions/testing/entitlements-stub';

// The writes that end the sessions of an account also close its sockets.

const DOCTOR_USER = 'user-doctor';

function realtimeMock() {
  return { disconnectUser: jest.fn().mockResolvedValue(undefined) };
}

// Workspace members are suspended and reactivated by their TEAM manager now
// (suspend accounts, kill the refresh tokens, then close the sockets here).
// A password reset link no longer touches sessions: the member chooses their
// password themselves from the link's own page.
describe('team members suspended or reactivated by their establishment', () => {
  function teamSetup(memberStatus: 'ACTIVE' | 'SUSPENDED') {
    const realtime = realtimeMock();
    const member = {
      createdAt: new Date(),
      id: 'membership-1',
      role: 'DOCTOR',
      user: {
        accountStatus: memberStatus,
        email: 'doctor@example.dz',
        fullName: 'Dr Test',
        id: DOCTOR_USER,
        isEmailVerified: true,
      },
      userId: DOCTOR_USER,
      workspaceId: 'ws-1',
    };
    const prisma = {
      $transaction: jest.fn((work: (client: unknown) => unknown) =>
        work(prisma),
      ),
      refreshToken: { updateMany: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ accountStatus: 'ACTIVE' }),
        update: jest.fn().mockResolvedValue({ accountStatus: 'ACTIVE' }),
      },
      workspace: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ establishment: { ownerId: 'owner-1' } }),
      },
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue(member),
      },
    };
    const contextService = {
      resolveWorkspaceForUser: jest.fn().mockResolvedValue({
        establishmentId: 'est-1',
        membershipRole: 'OWNER',
        workspaceId: 'ws-1',
        workspaceType: 'ESTABLISHMENT',
      }),
    };
    const actor: Pick<AuthenticatedUserPayload, 'role' | 'sub'> = {
      role: 'ESTABLISHMENT_ADMIN',
      sub: 'owner-1',
    };
    const actorContext = () => ({ ipAddress: null, userAgent: 'jest' });
    const service = new TeamService(
      prisma,
      new OrganizationAuthorizationService(prisma, contextService as never),
      { createAuditLog: jest.fn() } as unknown as AuditLogsService,
      // The quota gate hands run this same database double as its client.
      passThroughEntitlements(prisma),
      realtime as unknown as RealtimeService,
      { create: jest.fn() } as unknown as NotificationProducerService,
      { requestReset: jest.fn() } as never,
    );
    return { actor, actorContext, realtime, service };
  }

  it('closes the sockets of the doctor on suspension', async () => {
    const { actor, actorContext, realtime, service } = teamSetup('ACTIVE');

    await service.suspendMember(actor, 'membership-1', actorContext());

    expect(realtime.disconnectUser).toHaveBeenCalledWith(DOCTOR_USER);
  });

  it('closes the sockets of the doctor on reactivation', async () => {
    const { actor, actorContext, realtime, service } = teamSetup('SUSPENDED');

    await service.reactivateMember(actor, 'membership-1', actorContext());

    expect(realtime.disconnectUser).toHaveBeenCalledWith(DOCTOR_USER);
  });
});

describe('accounts suspended or reactivated by the back office', () => {
  function setup() {
    const realtime = realtimeMock();
    const prisma = {
      $transaction: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          accountStatus: 'ACTIVE',
          doctorProfile: { verificationStatus: 'VERIFIED' },
          establishment: null,
          id: DOCTOR_USER,
        }),
        update: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      { createAuditLog: jest.fn() } as unknown as AuditLogsService,
      realtime as unknown as RealtimeService,
    );
    return { realtime, service };
  }

  it('closes the sockets on suspension and on reactivation', async () => {
    const { realtime, service } = setup();

    await service.suspendUser(DOCTOR_USER, 'admin-1', { reason: 'Contrôle' });
    await service.reactivateUser(DOCTOR_USER, 'admin-1');

    expect(realtime.disconnectUser).toHaveBeenCalledTimes(2);
    expect(realtime.disconnectUser).toHaveBeenNthCalledWith(1, DOCTOR_USER);
  });
});
