import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AccountStatus as PrismaAccountStatus,
  NotificationCategory,
  NotificationResourceType,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  type Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthService } from '../auth/auth.service';
import { type WorkspaceCapability } from '../common/authorization/capabilities';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import { normalizeEmail } from '../common/utils/sanitize';
import { MailService } from '../mail/mail.service';
import {
  INVITATION_TTL_HOURS,
  workspaceInvitationEmail,
} from '../mail/templates/workspace-invitation.templates';
import { NotificationProducerService } from '../notifications/notification-producer.service';
import {
  actorOf,
  OrganizationAuthorizationService,
  type WorkspaceActorContext,
} from '../organization/organization-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { AcceptTeamInvitationDto } from './dto/accept-team-invitation.dto';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto';
import { invitationStatusOf } from './mappers/team-response.mapper';
import type { InvitationInspection, TeamInvitationView } from './team.types';

type RequestUser = Parameters<typeof actorOf>[0];

type RequestContext = { ipAddress: string | null; userAgent: string | null };

type InvitationRow = Prisma.WorkspaceInvitationGetPayload<{
  include: { invitedBy: { select: { fullName: true } } };
}>;

// 32 random bytes, exactly like the password-reset tokens: the entropy is
// the secret, and only its SHA-256 is stored, so a database dump yields no
// usable invitation link. The raw token lives in the mail link alone.
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const INVITATION_INVALID = () =>
  new BadRequestException({
    code: 'INVITATION_INVALID',
    message:
      'Ce lien d’invitation est invalide. Demandez à votre établissement une nouvelle invitation.',
  });

const INVITATION_EXPIRED = () =>
  new BadRequestException({
    code: 'INVITATION_EXPIRED',
    message:
      'Cette invitation a expiré. Demandez à votre établissement d’en envoyer une nouvelle.',
  });

const INVITATION_REVOKED = () =>
  new BadRequestException({
    code: 'INVITATION_REVOKED',
    message:
      'Cette invitation a été annulée. Demandez à votre établissement d’en envoyer une nouvelle.',
  });

const INVITATION_ALREADY_USED = () =>
  new ConflictException({
    code: 'INVITATION_ALREADY_USED',
    message:
      'Cette invitation a déjà été utilisée. Vous pouvez vous connecter à votre compte.',
  });

const ACCOUNT_ALREADY_EXISTS = () =>
  new ConflictException({
    code: 'ACCOUNT_ALREADY_EXISTS',
    message:
      'Un compte HealixDz existe déjà avec cet e-mail. Connectez-vous ; pour rejoindre cette équipe, contactez votre établissement.',
  });

const PHONE_ALREADY_USED = () =>
  new ConflictException({
    code: 'PHONE_ALREADY_USED',
    message: 'Ce numéro de téléphone est déjà utilisé.',
  });

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function createInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

// The invited doctor's profile follows the establishment's subscription: a
// TRIALING establishment lends its trial, everything else behaves as ACTIVE
// (the exact rule the affiliated-doctor flow used).
function establishmentSubscriptionStatus(
  status: SubscriptionStatus,
): SubscriptionStatus {
  return status === SubscriptionStatus.TRIALING
    ? SubscriptionStatus.TRIALING
    : SubscriptionStatus.ACTIVE;
}

function mapInvitationView(row: InvitationRow): TeamInvitationView {
  const now = new Date();

  return {
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
    id: row.id,
    invitedByFullName: row.invitedBy.fullName,
    role: row.role,
    status: invitationStatusOf(row, now),
  };
}

// Everything about invitations that goes by e-mail: creation in a workspace,
// the rotation of the token on resend, the revocation, and the public
// acceptance that pivots the invitation into a real account. The token
// never appears in a log, an audit line or an API response.
@Injectable()
export class TeamInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly auditLogsService: AuditLogsService,
    private readonly entitlements: EntitlementsService,
    private readonly mailService: MailService,
    private readonly notificationProducer: NotificationProducerService,
    private readonly authService: AuthService,
  ) {}

  async createInvitation(
    user: RequestUser,
    dto: CreateTeamInvitationDto,
    requestContext: RequestContext,
  ): Promise<TeamInvitationView> {
    const actor = actorOf(user);
    const context = await this.authorization.resolveActor(actor);
    const email = normalizeEmail(dto.email);
    this.requireInviteCapability(context, dto.role);

    await this.assertNoBlockingAccount(email);

    const pendingSameEmail = await this.prisma.workspaceInvitation.findFirst({
      where: {
        acceptedAt: null,
        email,
        expiresAt: { gt: new Date() },
        revokedAt: null,
        workspaceId: context.workspaceId,
      },
      select: { id: true },
    });

    if (pendingSameEmail) {
      throw new ConflictException({
        code: 'TEAM_INVITATION_ALREADY_PENDING',
        message:
          'Une invitation est déjà en attente pour cet e-mail : renvoyez-la ou révoquez-la.',
      });
    }

    const token = createInvitationToken();
    const invitation = await this.prisma.workspaceInvitation.create({
      data: {
        email,
        expiresAt: invitationExpiry(new Date()),
        invitedById: actor.userId,
        role: dto.role,
        tokenHash: hashInvitationToken(token),
        workspaceId: context.workspaceId,
      },
      include: { invitedBy: { select: { fullName: true } } },
    });

    await this.sendInvitationEmail(invitation, {
      email,
      token,
    });

    await this.auditLogsService.createAuditLog({
      action: 'TEAM_INVITATION_CREATED',
      entityType: 'WORKSPACE_INVITATION',
      entityId: invitation.id,
      ipAddress: requestContext.ipAddress,
      // Role and workspace: no e-mail, and above all no token anywhere.
      metadata: { role: dto.role, workspaceId: context.workspaceId },
      userAgent: requestContext.userAgent,
      userId: actor.userId,
    });

    return mapInvitationView(invitation);
  }

  // Resending regenerates the token and the validity window of the same
  // invitation: any older letter that still exists stops working.
  async resendInvitation(
    user: RequestUser,
    invitationId: string,
    requestContext: RequestContext,
  ): Promise<TeamInvitationView> {
    const actor = actorOf(user);
    const context = await this.authorization.resolveActor(actor);
    const invitation = await this.readWorkspaceInvitation(
      context,
      invitationId,
    );

    this.requireInviteCapability(context, invitation.role);

    if (invitation.acceptedAt) {
      throw INVITATION_ALREADY_USED();
    }
    if (invitation.revokedAt) {
      throw INVITATION_REVOKED();
    }

    const token = createInvitationToken();
    const rotated = await this.prisma.workspaceInvitation.update({
      data: {
        expiresAt: invitationExpiry(new Date()),
        tokenHash: hashInvitationToken(token),
      },
      include: { invitedBy: { select: { fullName: true } } },
      where: { id: invitation.id },
    });

    await this.sendInvitationEmail(rotated, {
      email: rotated.email,
      token,
    });

    await this.auditLogsService.createAuditLog({
      action: 'TEAM_INVITATION_RESENT',
      entityType: 'WORKSPACE_INVITATION',
      entityId: invitation.id,
      ipAddress: requestContext.ipAddress,
      metadata: { role: invitation.role, workspaceId: context.workspaceId },
      userAgent: requestContext.userAgent,
      userId: actor.userId,
    });

    return mapInvitationView(rotated);
  }

  // Revocation is idempotent: a second revocation changes nothing and still
  // answers the same view, so double-clicks stay cheap. Audited once.
  async revokeInvitation(
    user: RequestUser,
    invitationId: string,
    requestContext: RequestContext,
  ): Promise<TeamInvitationView> {
    const actor = actorOf(user);
    const context = await this.authorization.resolveActor(actor);
    const invitation = await this.readWorkspaceInvitation(
      context,
      invitationId,
    );

    this.authorization.require(context, 'team.revokeInvitation');

    if (invitation.acceptedAt) {
      throw INVITATION_ALREADY_USED();
    }

    if (!invitation.revokedAt) {
      await this.prisma.workspaceInvitation.update({
        data: { revokedAt: new Date() },
        where: { id: invitation.id },
      });

      await this.auditLogsService.createAuditLog({
        action: 'TEAM_INVITATION_REVOKED',
        entityType: 'WORKSPACE_INVITATION',
        entityId: invitation.id,
        ipAddress: requestContext.ipAddress,
        metadata: { role: invitation.role, workspaceId: context.workspaceId },
        userAgent: requestContext.userAgent,
        userId: actor.userId,
      });

      invitation.revokedAt = new Date();
    }

    return {
      createdAt: invitation.createdAt.toISOString(),
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
      id: invitation.id,
      invitedByFullName: invitation.invitedBy.fullName,
      role: invitation.role,
      status: invitationStatusOf(invitation, new Date()),
    };
  }

  // The public read an anonymous visitor does from the invitation link
  // before filling the form. No enumeration risk: the token itself is the
  // secret; a wrong one is indistinguishable from none.
  async inspectInvitation(token: string): Promise<InvitationInspection> {
    const invitation = await this.readInvitationByToken(token);
    const status = invitationStatusOf(invitation, new Date());

    const workspace = await this.prisma.workspace.findUnique({
      include: { establishment: { select: { name: true } } },
      where: { id: invitation.workspaceId },
    });

    if (!workspace?.establishment) {
      // A workspace without its establishment cannot lead anywhere, whatever
      // the status of the invitation row.
      throw INVITATION_INVALID();
    }

    return {
      email: invitation.email,
      establishmentName: workspace.establishment.name,
      expiresAt: invitation.expiresAt.toISOString(),
      role: invitation.role,
      status,
      usable: status === 'PENDING',
      workspaceName: workspace.name,
    };
  }

  // The public write: the invited person's account, their membership and —
  // for a doctor — their DRAFT professional profile, all inside the
  // subscription lock so an opened plan cannot be passed by two acceptances.
  async acceptInvitation(
    dto: AcceptTeamInvitationDto,
    requestContext: RequestContext,
  ): Promise<{ email: string; message: string }> {
    const invitation = await this.readInvitationByToken(dto.token);

    const passwordHash = await this.authService.hashPassword(dto.password);

    const establishment = await this.readInvitedEstablishment(invitation);

    // What the committed transaction answers: the account it created, the
    // DRAFT profile for a doctor (null for an administrator).
    type AcceptedInvitation = {
      doctorProfileId: string | null;
      newUserId: string;
    };

    const runAccept = async (
      transaction: Prisma.TransactionClient,
    ): Promise<AcceptedInvitation> => {
      // Conditional claim inside the transaction: of two concurrent
      // acceptances of the same link, exactly one persists.
      const claimed = await transaction.workspaceInvitation.updateMany({
        data: { acceptedAt: new Date() },
        where: {
          acceptedAt: null,
          expiresAt: { gt: new Date() },
          id: invitation.id,
          revokedAt: null,
        },
      });

      if (claimed.count !== 1) {
        throw INVITATION_ALREADY_USED();
      }

      // Re-checked inside the transaction: the pre-read answer is not enough
      // when two acceptances (or a registration) race.
      await this.assertNoAccountCollision(
        invitation.email,
        dto.phone,
        transaction,
      );

      const newUser = await transaction.user.create({
        data: {
          accountStatus: PrismaAccountStatus.ACTIVE,
          // Proven: the invitation reached this inbox and was opened. The
          // phone, on the other hand, is not verified yet.
          email: invitation.email,
          fullName: dto.fullName,
          isEmailVerified: true,
          isPhoneVerified: false,
          passwordHash,
          phone: dto.phone,
          // The account role mirrors the workspace role: an invited admin is
          // an establishment administrator, an invited doctor a member
          // doctor of their establishment.
          role:
            invitation.role === WorkspaceMembershipRole.ADMIN
              ? UserRole.ESTABLISHMENT_ADMIN
              : UserRole.AFFILIATED_DOCTOR,
        },
        select: { id: true },
      });

      let doctorProfileId: string | null = null;
      if (invitation.role === WorkspaceMembershipRole.DOCTOR) {
        const doctorProfile = await transaction.doctorProfile.create({
          data: {
            establishmentId: establishment.id,
            isIndependent: false,
            professionalAddress: dto.professionalAddress ?? '',
            speciality: dto.speciality ?? '',
            // Follows the establishment's subscription: had it lapsed, the
            // quota gate would already have refused the seat.
            subscriptionStatus: establishmentSubscriptionStatus(
              establishment.subscriptionStatus,
            ),
            // NOT VERIFIED: the profile is a DRAFT the doctor completes and
            // has verified. Nothing clinical works before that.
            verificationStatus: VerificationStatus.DRAFT,
            wilaya: dto.wilaya ?? '',
            userId: newUser.id,
          },
          select: { id: true },
        });
        doctorProfileId = doctorProfile.id;
      }
      await transaction.workspaceMembership.create({
        data: {
          role: invitation.role,
          status: WorkspaceMembershipStatus.ACTIVE,
          userId: newUser.id,
          workspaceId: invitation.workspaceId,
        },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'TEAM_INVITATION_ACCEPTED',
          entityType: 'USER',
          entityId: newUser.id,
          ipAddress: requestContext.ipAddress,
          // The e-mail lives on the invitation row; the audit carries the
          // invitation id and never the token.
          metadata: {
            invitationId: invitation.id,
            role: invitation.role,
            workspaceId: invitation.workspaceId,
          },
          userAgent: requestContext.userAgent,
          userId: newUser.id,
        },
        transaction,
      );

      return {
        doctorProfileId,
        newUserId: newUser.id,
      };
    };

    // A doctor seat is counted and taken under the subscription lock; an
    // administrator takes none (the plan quota counts doctors only).
    const accepted =
      invitation.role === WorkspaceMembershipRole.DOCTOR
        ? await this.entitlements.withQuota(
            invitation.workspaceId,
            'maxDoctors',
            runAccept,
          )
        : await this.prisma.$transaction(runAccept);

    // AFTER the commit: the account exists for every reader, the membership
    // the producer re-checks is visible — inside the transaction it would
    // miss the row and silently skip the notice. Non-critical by design:
    // the producer swallows its own errors, the acceptance stands whatever
    // the notice did. Payload only the profile id, no personal data.
    if (accepted.doctorProfileId) {
      await this.notificationProducer.create({
        category: NotificationCategory.TEAM,
        data: { doctorProfileId: accepted.doctorProfileId },
        dedupeKey: `doctor-account-created:${accepted.doctorProfileId}`,
        resourceType: NotificationResourceType.DOCTOR_PROFILE,
        resourceId: accepted.doctorProfileId,
        type: 'DOCTOR_ACCOUNT_CREATED',
        userId: accepted.newUserId,
        workspaceId: invitation.workspaceId,
      });
    }

    return {
      email: invitation.email,
      message:
        'Votre compte est créé. Connectez-vous pour commencer à utiliser HealixDz.',
    };
  }

  // Existing accounts everywhere and existing members of this workspace:
  // one identity, one door. A suspended member does not get an invitation
  // either — their way back is the reactivate action of the manager.
  private async assertNoBlockingAccount(email: string): Promise<void> {
    const account = await this.prisma.user.findUnique({
      select: { id: true },
      where: { email },
    });

    if (account) {
      throw ACCOUNT_ALREADY_EXISTS();
    }
  }

  private async assertNoAccountCollision(
    email: string,
    phone: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const emailOwner = await transaction.user.findUnique({
      select: { id: true },
      where: { email },
    });
    if (emailOwner) {
      throw ACCOUNT_ALREADY_EXISTS();
    }

    const phoneOwner = await transaction.user.findUnique({
      select: { id: true },
      where: { phone },
    });
    if (phoneOwner) {
      throw PHONE_ALREADY_USED();
    }
  }

  // Any other workspace's invitation is the same 404 — or rather, the same
  // "invalid", — as one that does not exist.
  private async readWorkspaceInvitation(
    context: WorkspaceActorContext,
    invitationId: string,
  ): Promise<InvitationRow> {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      include: { invitedBy: { select: { fullName: true } } },
      where: { id: invitationId },
    });

    OrganizationAuthorizationService.assertSameWorkspace(
      context,
      invitation?.workspaceId,
    );

    return invitation as InvitationRow;
  }

  private async readInvitationByToken(token: string): Promise<InvitationRow> {
    if (!TOKEN_PATTERN.test(token)) {
      throw INVITATION_INVALID();
    }

    const invitation = await this.prisma.workspaceInvitation.findUnique({
      include: { invitedBy: { select: { fullName: true } } },
      where: { tokenHash: hashInvitationToken(token) },
    });

    if (!invitation) {
      throw INVITATION_INVALID();
    }

    if (invitation.revokedAt) {
      throw INVITATION_REVOKED();
    }
    if (invitation.acceptedAt) {
      throw INVITATION_ALREADY_USED();
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw INVITATION_EXPIRED();
    }

    return invitation;
  }

  // DOCTOR and ADMIN map to different capabilities; OWNER and RECEPTIONIST
  // cannot be invited at all (the owner comes with the workspace,
  // RECEPTIONIST is not exposed yet).
  private requireInviteCapability(
    context: WorkspaceActorContext,
    role: WorkspaceMembershipRole,
  ): void {
    const capability: WorkspaceCapability | null =
      role === WorkspaceMembershipRole.DOCTOR
        ? 'team.inviteDoctor'
        : role === WorkspaceMembershipRole.ADMIN
          ? 'team.inviteAdmin'
          : null;

    if (!capability) {
      throw new BadRequestException({
        code: 'TEAM_INVITATION_ROLE_NOT_ALLOWED',
        message: 'Ce rôle ne peut pas être attribué par invitation.',
      });
    }

    this.authorization.require(context, capability);
  }

  // Exactly one token per send: it is regenerated at creation and at every
  // resend, and any earlier link — even one never opened — stops working.
  private async sendInvitationEmail(
    invitation: InvitationRow,
    mail: {
      email: string;
      token: string;
    },
  ): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      include: { establishment: { select: { name: true } } },
      where: { id: invitation.workspaceId },
    });

    // Handled before sending in every caller (the workspace check); this is
    // the defensive variant of the same answer.
    if (!workspace?.establishment) {
      throw INVITATION_INVALID();
    }

    const email = workspaceInvitationEmail({
      expiresAt: invitation.expiresAt,
      invitationUrl: `${this.mailService.publicUrl}/invite/accept?token=${mail.token}`,
      role: invitation.role,
      workspaceName: workspace.name,
    });

    // A delivery failure leaves the invitation PENDING (resend exists); the
    // mail service has already logged the reason.
    try {
      await this.mailService.send({ ...email, to: mail.email });
    } catch {
      return;
    }
  }

  // The only invitation-bearing workspace: an ESTABLISHMENT one. Private
  // practices have no team page, so no invitation should ever point there —
  // and if rows drifted, the public page refuses.
  private async readInvitedEstablishment(invitation: InvitationRow) {
    const workspace = await this.prisma.workspace.findUnique({
      select: {
        establishment: { select: { id: true, subscriptionStatus: true } },
        type: true,
      },
      where: { id: invitation.workspaceId },
    });

    if (workspace?.type !== 'ESTABLISHMENT' || !workspace.establishment) {
      throw INVITATION_INVALID();
    }

    return workspace.establishment;
  }
}
