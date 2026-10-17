import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ParticipantStatus,
  Prisma,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type RequestContext } from '../common/utils/request-context';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import { type DirectoryQueryDto } from './dto/directory.dto';
import {
  cannotBlockSelf,
  nothingToUpdate,
  recipientNotFound,
} from './messaging-errors';
import { MessagingEvents } from './messaging-events';
import { directKeyFor, MESSAGING_ROLES } from './messaging-rules';
import {
  MessagingUsersService,
  type PeerProfile,
  peerProfileSelect,
  reachableUserWhere,
  toPeerProfile,
} from './messaging-users.service';

export const DIRECTORY_LIMIT = 20;
export const WORKSPACE_MEMBERS_LIMIT = 100;

export type DirectoryEntry = PeerProfile & {
  // A DIRECT conversation opens at once; otherwise it starts as a request.
  sameWorkspace: boolean;
  blockedByMe: boolean;
};

export type BlockView = {
  userId: string;
  fullName: string;
  createdAt: Date;
};

export type MessagingSettings = {
  discoverableByPeers: boolean;
  // Reciprocal: see readPositionVisible.
  shareReadReceipts: boolean;
};

const settingsSelect = {
  discoverableByPeers: true,
  shareReadReceipts: true,
} satisfies Prisma.UserSelect;

const contains = (value: string) => ({ contains: value });

@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: MessagingUsersService,
    private readonly auditLogs: AuditLogsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly events: MessagingEvents,
  ) {}

  // The colleagues a group of the caller can hold: verified, usable
  // professionals with an ACTIVE membership of the caller's workspace (the
  // one a new group is created in), listed or not in the directory. Never
  // the caller, never an e-mail nor a phone. An independent doctor, alone in
  // their practice, gets an empty list.
  async workspaceMembers(
    actor: AuthenticatedUserPayload,
    rawSearch?: string,
  ): Promise<PeerProfile[]> {
    let workspaceId: string;
    try {
      ({ workspaceId } = await this.workspaceContext.resolveWorkspaceForUser({
        role: actor.role,
        userId: actor.sub,
      }));
    } catch (error) {
      if (error instanceof ForbiddenException) return [];
      throw error;
    }

    const search = sanitizeTextInput(rawSearch);
    const users = await this.prisma.user.findMany({
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: peerProfileSelect,
      take: WORKSPACE_MEMBERS_LIMIT,
      where: {
        AND: [
          reachableUserWhere,
          { id: { not: actor.sub } },
          {
            workspaceMemberships: {
              some: { status: WorkspaceMembershipStatus.ACTIVE, workspaceId },
            },
          },
          search
            ? {
                OR: [
                  { fullName: contains(search) },
                  { doctorProfile: { speciality: contains(search) } },
                ],
              }
            : {},
        ],
      },
    });

    return users.map(toPeerProfile);
  }

  // Verified, usable professionals who chose to be listed, 20 at most, by
  // name; never the caller, never someone who blocked the caller, never an
  // e-mail nor a phone. MySQL's collation makes the search case-insensitive.
  async search(
    actor: AuthenticatedUserPayload,
    query: DirectoryQueryDto,
  ): Promise<DirectoryEntry[]> {
    const search = sanitizeTextInput(query.search);
    const speciality = sanitizeTextInput(query.speciality);
    const wilaya = sanitizeTextInput(query.wilaya);
    const workspaceIds = await this.users.activeWorkspaceIds(actor.sub);
    const filters: Prisma.UserWhereInput[] = [
      reachableUserWhere,
      { discoverableByPeers: true },
      { id: { not: actor.sub } },
      { blocksMade: { none: { blockedId: actor.sub } } },
    ];

    if (search) {
      filters.push({
        OR: [
          { fullName: contains(search) },
          { establishment: { name: contains(search) } },
          { doctorProfile: { speciality: contains(search) } },
          { doctorProfile: { wilaya: contains(search) } },
          { establishment: { wilaya: contains(search) } },
        ],
      });
    }
    if (speciality) {
      filters.push({ doctorProfile: { speciality: contains(speciality) } });
    }
    if (wilaya) {
      filters.push({
        OR: [
          { doctorProfile: { wilaya: contains(wilaya) } },
          { establishment: { wilaya: contains(wilaya) } },
        ],
      });
    }

    const users = await this.prisma.user.findMany({
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: {
        ...peerProfileSelect,
        blocksReceived: {
          select: { id: true },
          where: { blockerId: actor.sub },
        },
        workspaceMemberships: {
          select: { id: true },
          where: {
            status: WorkspaceMembershipStatus.ACTIVE,
            workspaceId: { in: workspaceIds },
          },
        },
      },
      take: DIRECTORY_LIMIT,
      where: { AND: filters },
    });

    return users.map(({ blocksReceived, workspaceMemberships, ...user }) => ({
      ...toPeerProfile(user),
      blockedByMe: blocksReceived.length > 0,
      sameWorkspace: workspaceMemberships.length > 0,
    }));
  }

  async listBlocks(actor: AuthenticatedUserPayload): Promise<BlockView[]> {
    const blocks = await this.prisma.userBlock.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        blocked: { select: { fullName: true, id: true } },
        createdAt: true,
      },
      where: { blockerId: actor.sub },
    });
    return blocks.map(({ blocked, createdAt }) => ({
      createdAt,
      fullName: blocked.fullName,
      userId: blocked.id,
    }));
  }

  // The blocked user can neither open a conversation with the caller nor
  // write to them (a neutral 404). A request they sent, not answered yet,
  // leaves the caller's list (participant BLOCKED).
  async block(
    actor: AuthenticatedUserPayload,
    userId: string,
    context: RequestContext,
  ): Promise<{ userId: string; blocked: true }> {
    if (userId === actor.sub) throw cannotBlockSelf();

    const target = await this.prisma.user.findFirst({
      select: { id: true },
      where: { id: userId, role: { in: [...MESSAGING_ROLES] } },
    });

    if (!target) throw recipientNotFound();

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.userBlock.findUnique({
        where: {
          blockerId_blockedId: { blockedId: userId, blockerId: actor.sub },
        },
      });

      if (existing) return;

      await transaction.userBlock.create({
        data: { blockedId: userId, blockerId: actor.sub },
      });
      await transaction.conversationParticipant.updateMany({
        data: { status: ParticipantStatus.BLOCKED },
        where: {
          conversation: { directKey: directKeyFor(actor.sub, userId) },
          status: ParticipantStatus.PENDING,
          userId: actor.sub,
        },
      });
      await this.audit('USER_BLOCKED', actor, userId, context, transaction);
    });

    return { blocked: true, userId };
  }

  async unblock(
    actor: AuthenticatedUserPayload,
    userId: string,
    context: RequestContext,
  ): Promise<{ userId: string; blocked: false }> {
    await this.prisma.$transaction(async (transaction) => {
      const { count } = await transaction.userBlock.deleteMany({
        where: { blockedId: userId, blockerId: actor.sub },
      });
      if (count > 0) {
        await this.audit('USER_UNBLOCKED', actor, userId, context, transaction);
      }
    });

    return { blocked: false, userId };
  }

  async getSettings(
    actor: AuthenticatedUserPayload,
  ): Promise<MessagingSettings> {
    return this.prisma.user.findUniqueOrThrow({
      select: settingsSelect,
      where: { id: actor.sub },
    });
  }

  // The caller's own settings, one or both. Turning read receipts on or off
  // changes what the participants of the caller's conversations see: they
  // read them again.
  async updateSettings(
    actor: AuthenticatedUserPayload,
    settings: Partial<MessagingSettings>,
  ): Promise<MessagingSettings> {
    if (
      settings.discoverableByPeers === undefined &&
      settings.shareReadReceipts === undefined
    ) {
      throw nothingToUpdate();
    }

    const before = await this.getSettings(actor);
    const saved = await this.prisma.user.update({
      data: {
        discoverableByPeers: settings.discoverableByPeers,
        shareReadReceipts: settings.shareReadReceipts,
      },
      select: settingsSelect,
      where: { id: actor.sub },
    });

    if (saved.shareReadReceipts !== before.shareReadReceipts) {
      await this.events.readReceiptsChanged(actor.sub);
    }
    return saved;
  }

  private audit(
    action: string,
    actor: AuthenticatedUserPayload,
    userId: string,
    context: RequestContext,
    client: Prisma.TransactionClient,
  ) {
    return this.auditLogs.createAuditLog(
      {
        action,
        entityId: userId,
        entityType: 'USER',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        userId: actor.sub,
      },
      client,
    );
  }
}
