import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AccountStatus as PrismaAccountStatus,
  NotificationCategory,
  type Prisma,
  WorkspaceMembershipRole,
} from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PasswordResetService } from '../auth/password-reset/password-reset.service';
import { hasCapability } from '../common/authorization/capabilities';
import { NotificationProducerService } from '../notifications/notification-producer.service';
import {
  actorOf,
  OrganizationAuthorizationService,
  type Actor,
  type WorkspaceActorContext,
} from '../organization/organization-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import type { TeamOverview } from './team.types';
import { mapTeamOverview } from './mappers/team-response.mapper';

type RequestUser = Parameters<typeof actorOf>[0];

type RequestContext = { ipAddress: string | null; userAgent: string | null };

type MemberRow = Prisma.WorkspaceMembershipGetPayload<{
  select: {
    createdAt: true;
    id: true;
    role: true;
    userId: true;
    workspaceId: true;
    user: {
      select: {
        accountStatus: true;
        email: true;
        fullName: true;
        id: true;
        isEmailVerified: true;
      };
    };
  };
}>;

// The workspace owner is untouchable: no suspension, no admin-initiated reset
// — a workspace invariant, never a permission someone could grant.
const PROTECTED_ROLE = WorkspaceMembershipRole.OWNER;

// Who each actor may suspend or reactivate: the OWNER handles ADMIN and
// DOCTOR; a day-to-day ADMIN hands doctors only.
const TARGET_ROLES_BY_ACTOR: Record<
  WorkspaceMembershipRole,
  readonly WorkspaceMembershipRole[]
> = {
  OWNER: [WorkspaceMembershipRole.ADMIN, WorkspaceMembershipRole.DOCTOR],
  ADMIN: [WorkspaceMembershipRole.DOCTOR],
  DOCTOR: [],
  RECEPTIONIST: [],
};

// Runs in the same transaction the quota lock opened (reactivation of a
// doctor) or the plain acceptance one.
type TransactionRun = (
  transaction: Prisma.TransactionClient,
) => Promise<PrismaAccountStatus>;

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly auditLogsService: AuditLogsService,
    private readonly entitlements: EntitlementsService,
    private readonly realtime: RealtimeService,
    private readonly notificationProducer: NotificationProducerService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  // The team page: members always, invitations and quota usage for the
  // managers. Doctors keep the directory view of WHERE they work (names and
  // roles, no contacts, no actions).
  async getTeam(user: RequestUser): Promise<TeamOverview> {
    const actor = actorOf(user);
    const context = await this.authorization.resolveActor(actor);
    const full = hasCapability(context.capabilities, 'team.read');

    const members = await this.prisma.workspaceMembership.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            accountStatus: true,
            isEmailVerified: true,
            doctorProfile: {
              select: {
                id: true,
                speciality: true,
                wilaya: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
    });

    if (!full) {
      return mapTeamOverview({
        workspaceId: context.workspaceId,
        capabilities: context.capabilities,
        scope: 'BASIC',
        members,
        invitations: null,
        usage: null,
      });
    }

    const invitations = await this.prisma.workspaceInvitation.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      include: { invitedBy: { select: { fullName: true } } },
    });
    const usage = await this.entitlements.getEntitlements(context.workspaceId);

    return mapTeamOverview({
      workspaceId: context.workspaceId,
      capabilities: context.capabilities,
      scope: 'FULL',
      members,
      invitations,
      usage: {
        activeDoctors: usage.usage.doctors,
        maxDoctors: usage.quotas.maxDoctors,
      },
    });
  }

  // Suspension closes the ACCOUNT, not the membership row: the suspended
  // member cannot sign in anywhere, their tokens die on the spot, and their
  // seat frees for the plan. Clinical data they produced stays untouched.
  async suspendMember(
    user: RequestUser,
    membershipId: string,
    requestContext: RequestContext,
  ): Promise<{ membershipId: string; accountStatus: string }> {
    const { workspaceId, member } = await this.resolveTargetsActedOn(
      user,
      membershipId,
    );

    if (member.user.accountStatus === PrismaAccountStatus.SUSPENDED) {
      throw new ConflictException(
        'Ce membre est déjà suspendu : réactivez-le pour lui rendre l’accès.',
      );
    }

    const suspendedAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: member.userId },
        data: { accountStatus: PrismaAccountStatus.SUSPENDED },
      });
      // A suspended account loses every existing session immediately: the
      // access token dies on its next request, the refresh one right here.
      await transaction.refreshToken.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: suspendedAt },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'TEAM_MEMBER_SUSPENDED',
          entityType: 'USER',
          entityId: member.userId,
          ipAddress: requestContext.ipAddress,
          // Membership id and role only: no e-mail, no clinical data.
          metadata: {
            membershipId: member.id,
            role: member.role,
            workspaceId,
          },
          userAgent: requestContext.userAgent,
          userId: actorOf(user).userId,
        },
        transaction,
      );
    });

    await this.realtime.disconnectUser(member.userId);

    // The owner must know a member was just cut off; the suspended member
    // themselves cannot be notified (their membership is inactive for the
    // notification producer by the time we would notify).
    await this.notifyOwner(workspaceId, member.id, member.role, {
      category: NotificationCategory.SECURITY,
      type: 'TEAM_MEMBER_SUSPENDED',
    });

    return {
      membershipId: member.id,
      accountStatus: PrismaAccountStatus.SUSPENDED,
    };
  }

  async reactivateMember(
    user: RequestUser,
    membershipId: string,
    requestContext: RequestContext,
  ): Promise<{ membershipId: string; accountStatus: string }> {
    const { workspaceId, member } = await this.resolveTargetsActedOn(
      user,
      membershipId,
    );

    if (member.user.accountStatus !== PrismaAccountStatus.SUSPENDED) {
      throw new ConflictException('Ce membre est déjà actif.');
    }

    const runActivation: TransactionRun = async (transaction) => {
      // No session to revoke further: the suspension already did. Any socket
      // left from before is closed after the transaction.
      const updated = await transaction.user.update({
        where: { id: member.userId },
        data: { accountStatus: PrismaAccountStatus.ACTIVE },
        select: { accountStatus: true },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'TEAM_MEMBER_REACTIVATED',
          entityType: 'USER',
          entityId: member.userId,
          ipAddress: requestContext.ipAddress,
          metadata: {
            membershipId: member.id,
            role: member.role,
            workspaceId,
          },
          userAgent: requestContext.userAgent,
          userId: actorOf(user).userId,
        },
        transaction,
      );

      return updated.accountStatus;
    };

    // A DOCTOR seat is taken under the subscription lock (the plan's number
    // of doctors applies again); an administrator is never part of it.
    const accountStatus =
      member.role === WorkspaceMembershipRole.DOCTOR
        ? await this.entitlements.withQuota(
            workspaceId,
            'maxDoctors',
            runActivation,
          )
        : await this.prisma.$transaction(runActivation);

    await this.realtime.disconnectUser(member.userId);

    // The membership is ACTIVE again: the member can be notified themselves,
    // and knows at once that their account came back.
    await this.notificationProducer.create({
      data: { membershipId: member.id, role: member.role },
      type: 'TEAM_MEMBER_REACTIVATED',
      userId: member.userId,
      workspaceId,
      category: NotificationCategory.TEAM,
    });

    return { membershipId: member.id, accountStatus };
  }

  // The admin asks the platform to email the member a SELF-SERVICE reset
  // link (the existing password-reset flow). Nobody here sees, sets or
  // writes a password: only the member's inbox holds the link.
  async sendPasswordReset(
    user: RequestUser,
    membershipId: string,
    requestContext: RequestContext,
  ): Promise<{ message: string }> {
    const actor = actorOf(user);
    const context = await this.authorization.resolveActor(actor);
    this.authorization.require(context, 'team.sendPasswordReset');

    const member = await this.readMember(context, membershipId);

    if (member.role === PROTECTED_ROLE) {
      throw new ForbiddenException(
        'Le compte propriétaire est géré par l’administration : chaque administrateur gère le sien.',
      );
    }
    if (
      member.user.accountStatus !== PrismaAccountStatus.ACTIVE ||
      !member.user.isEmailVerified
    ) {
      throw new ConflictException(
        'Ce compte ne peut pas recevoir de lien : réactivez-le et vérifiez son e-mail d’abord.',
      );
    }

    await this.auditLogsService.createAuditLog({
      action: 'TEAM_MEMBER_PASSWORD_RESET_LINK_SENT',
      entityType: 'USER',
      entityId: member.userId,
      ipAddress: requestContext.ipAddress,
      metadata: {
        membershipId: member.id,
        workspaceId: context.workspaceId,
      },
      userAgent: requestContext.userAgent,
      userId: actor.userId,
    });

    // The self-service flow answers identically whether the address exists,
    // and the token never leaves the member's inbox.
    await this.passwordResetService.requestReset(
      member.user.email,
      requestContext,
    );

    return {
      message:
        'Un lien de réinitialisation a été envoyé à l’adresse de ce membre (valable 30 minutes).',
    };
  }

  // The shared front door of every member action: workspace authorization,
  // the capability of the actor, the same-workspace 404 and the protected
  // role. Every managed member goes through exactly one of these checks.
  private async resolveTargetsActedOn(
    user: RequestUser,
    membershipId: string,
  ): Promise<{ workspaceId: string; member: MemberRow }> {
    const actor: Actor = actorOf(user);
    const context = await this.authorization.resolveActor(actor);
    this.authorization.require(context, 'team.suspendMember');

    const member = await this.readMember(context, membershipId);

    if (member.role === PROTECTED_ROLE) {
      throw new ForbiddenException(
        'Le compte propriétaire ne peut pas être désactivé.',
      );
    }
    if (!TARGET_ROLES_BY_ACTOR[context.membershipRole].includes(member.role)) {
      throw new ForbiddenException(
        context.membershipRole === WorkspaceMembershipRole.OWNER
          ? 'Ce rôle de l’équipe ne peut pas être géré.'
          : 'Un administrateur ne gère que les médecins de l’équipe.',
      );
    }

    return { workspaceId: context.workspaceId, member };
  }

  private async readMember(
    context: WorkspaceActorContext,
    membershipId: string,
  ): Promise<MemberRow> {
    const membership = await this.prisma.workspaceMembership.findUnique({
      select: {
        createdAt: true,
        id: true,
        role: true,
        userId: true,
        workspaceId: true,
        user: {
          select: {
            accountStatus: true,
            email: true,
            fullName: true,
            id: true,
            isEmailVerified: true,
          },
        },
      },
      where: { id: membershipId },
    });

    // Identical 404 whether the membership is outside this workspace or does
    // not exist: the existence of other workspaces' data is never answered.
    OrganizationAuthorizationService.assertSameWorkspace(
      context,
      membership?.workspaceId,
    );

    return membership as MemberRow;
  }

  // The one account that pays for the workspace and keeps its ownership:
  // every owner-only notification points there.
  private async notifyOwner(
    workspaceId: string,
    membershipId: string,
    role: WorkspaceMembershipRole,
    notification: { category: NotificationCategory; type: string },
  ): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      select: { establishment: { select: { ownerId: true } } },
      where: { id: workspaceId },
    });

    const ownerId = workspace?.establishment?.ownerId;
    if (!ownerId) {
      return;
    }

    await this.notificationProducer.create({
      category: notification.category,
      data: { membershipId, role },
      type: notification.type,
      userId: ownerId,
      workspaceId,
    });
  }
}
