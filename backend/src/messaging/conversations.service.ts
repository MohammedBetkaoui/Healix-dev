import { Injectable } from '@nestjs/common';
import {
  ConversationType,
  type Message,
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
import {
  type ConversationListStatus,
  type CreateConversationDto,
  type ListConversationsQueryDto,
  type UpdateConversationDto,
} from './dto/conversations.dto';
import { MessageCrypto } from './message-crypto';
import { type LastMessageView, toLastMessageView } from './message-views';
import {
  cannotMessageSelf,
  contactBlocked,
  conversationNotFound,
  conversationTypeNotAvailable,
  groupOnly,
  invalidGroupMembers,
  invalidTitle,
  notPending,
  nothingToUpdate,
  ownerOnly,
  participantNotFound,
  recipientNotFound,
} from './messaging-errors';
import {
  CONVERSATION_PAGE_LIMIT_DEFAULT,
  CONVERSATION_TITLE_MAX_LENGTH,
  type ConversationCursor,
  decodeCursor,
  directKeyFor,
  encodeCursor,
  PARTICIPANT_ROLE,
} from './messaging-rules';
import {
  MessagingUsersService,
  peerProfileSelect,
  reachableUserWhere,
  toPeerProfile,
} from './messaging-users.service';

// The types of lot 1; the others are refused, and never listed.
export const AVAILABLE_CONVERSATION_TYPES: ConversationType[] = [
  ConversationType.DIRECT,
  ConversationType.GROUP,
];

export const participantsInclude = {
  participants: {
    include: { user: { select: peerProfileSelect } },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ConversationInclude;

export type ConversationWithParticipants = Prisma.ConversationGetPayload<{
  include: typeof participantsInclude;
}>;

type ParticipantRow = ConversationWithParticipants['participants'][number];

export type Participation = {
  conversation: ConversationWithParticipants;
  participant: ParticipantRow;
};

export type ConversationParticipantView = {
  userId: string;
  fullName: string;
  speciality: string | null;
  establishmentName: string | null;
  role: string;
  status: ParticipantStatus;
};

export type ConversationView = {
  id: string;
  type: ConversationType;
  title: string | null;
  workspaceId: string | null;
  createdById: string;
  lastSeq: number;
  lastMessageAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  me: {
    role: string;
    status: ParticipantStatus;
    lastReadSeq: number;
    mutedUntil: Date | null;
  };
  unreadCount: number;
  lastMessage: LastMessageView | null;
  participants: ConversationParticipantView[];
};

export type ConversationPage = {
  items: ConversationView[];
  nextCursor: string | null;
};

const OPEN_STATUSES: ParticipantStatus[] = [
  ParticipantStatus.ACTIVE,
  ParticipantStatus.PENDING,
];

const AUDIT_ENTITY = 'CONVERSATION';

function cursorWhere(
  cursor: ConversationCursor,
): Prisma.ConversationWhereInput {
  if (cursor.lastMessageAt === null) {
    return { id: { lt: cursor.id }, lastMessageAt: null };
  }

  return {
    OR: [
      { lastMessageAt: { lt: cursor.lastMessageAt } },
      { id: { lt: cursor.id }, lastMessageAt: cursor.lastMessageAt },
      { lastMessageAt: null },
    ],
  };
}

// A group belongs to its workspace: a participant whose membership of that
// workspace is no longer ACTIVE (removed, suspended) loses it, in reading as
// in writing.
export function groupWorkspaceMemberWhere(
  userId: string,
): Prisma.ConversationWhereInput {
  return {
    OR: [
      { type: { not: ConversationType.GROUP } },
      {
        workspace: {
          memberships: {
            some: { status: WorkspaceMembershipStatus.ACTIVE, userId },
          },
        },
      },
    ],
  };
}

function listStatusWhere(
  userId: string,
  status: ConversationListStatus,
): Prisma.ConversationWhereInput {
  if (status === 'pending') {
    return {
      participants: { some: { status: ParticipantStatus.PENDING, userId } },
    };
  }

  return {
    archivedAt: status === 'archived' ? { not: null } : null,
    participants: { some: { status: ParticipantStatus.ACTIVE, userId } },
  };
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: MessagingUsersService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly auditLogs: AuditLogsService,
    private readonly crypto: MessageCrypto,
  ) {}

  // The caller's participation, in one of the given statuses; 404 for anyone
  // else, so that the conversation's existence is not revealed.
  async getParticipation(
    userId: string,
    conversationId: string,
    statuses: ParticipantStatus[] = [ParticipantStatus.ACTIVE],
  ): Promise<Participation> {
    const conversation = await this.prisma.conversation.findFirst({
      include: participantsInclude,
      where: {
        AND: [
          { id: conversationId, type: { in: AVAILABLE_CONVERSATION_TYPES } },
          groupWorkspaceMemberWhere(userId),
        ],
      },
    });
    const participant = conversation?.participants.find(
      (entry) => entry.userId === userId,
    );

    if (
      !conversation ||
      !participant ||
      !statuses.includes(participant.status)
    ) {
      throw conversationNotFound();
    }

    return { conversation, participant };
  }

  async list(
    actor: AuthenticatedUserPayload,
    query: ListConversationsQueryDto,
  ): Promise<ConversationPage> {
    const limit = query.limit ?? CONVERSATION_PAGE_LIMIT_DEFAULT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.conversation.findMany({
      include: participantsInclude,
      // MySQL sorts NULL last in descending order: conversations without a
      // message come after the others.
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      where: {
        AND: [
          { type: query.type ?? { in: AVAILABLE_CONVERSATION_TYPES } },
          listStatusWhere(actor.sub, query.status ?? 'active'),
          groupWorkspaceMemberWhere(actor.sub),
          cursor ? cursorWhere(cursor) : {},
        ],
      },
    });
    const page = rows.slice(0, limit);
    const lastMessages = await this.findLastMessages(page);
    const last = page.at(-1);

    return {
      items: page.map((conversation) =>
        this.toView(
          conversation,
          actor.sub,
          lastMessages.get(conversation.id) ?? null,
        ),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ id: last.id, lastMessageAt: last.lastMessageAt })
          : null,
    };
  }

  async getOne(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<ConversationView> {
    const { conversation } = await this.getParticipation(
      actor.sub,
      conversationId,
      OPEN_STATUSES,
    );
    return this.view(conversation, actor.sub);
  }

  async create(
    actor: AuthenticatedUserPayload,
    dto: CreateConversationDto,
    context: RequestContext,
  ): Promise<{ conversation: ConversationView; created: boolean }> {
    switch (dto.type) {
      case ConversationType.DIRECT:
        return this.createDirect(actor, dto.participantId ?? '', context);
      case ConversationType.GROUP:
        return this.createGroup(
          actor,
          dto.title ?? '',
          dto.participantIds ?? [],
          context,
        );
      default:
        throw conversationTypeNotAvailable();
    }
  }

  async update(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationView> {
    const { conversation, participant } = await this.getParticipation(
      actor.sub,
      conversationId,
    );

    if (
      dto.title === undefined &&
      dto.archived === undefined &&
      dto.mutedUntil === undefined
    ) {
      throw nothingToUpdate();
    }

    const isGroup = conversation.type === ConversationType.GROUP;
    const isOwner = participant.role === PARTICIPANT_ROLE.OWNER;
    const changes: Prisma.ConversationUpdateInput = {};

    if (dto.title !== undefined) {
      if (!isGroup) throw groupOnly();
      if (!isOwner) throw ownerOnly();
      changes.title = this.readTitle(dto.title);
    }

    // Archiving is the conversation's, shared by its participants: the
    // OWNER's decision for a group, either side's for a DIRECT. A new
    // message brings it back.
    if (dto.archived !== undefined) {
      if (isGroup && !isOwner) throw ownerOnly();
      changes.archivedAt = dto.archived
        ? (conversation.archivedAt ?? new Date())
        : null;
    }

    // Muting is the caller's own; a date already past unmutes.
    const mutedUntil =
      dto.mutedUntil === undefined
        ? undefined
        : dto.mutedUntil === null || new Date(dto.mutedUntil) <= new Date()
          ? null
          : new Date(dto.mutedUntil);

    await this.prisma.$transaction(async (transaction) => {
      if (Object.keys(changes).length > 0) {
        await transaction.conversation.update({
          data: changes,
          where: { id: conversation.id },
        });
      }
      if (mutedUntil !== undefined) {
        await transaction.conversationParticipant.update({
          data: { mutedUntil },
          where: { id: participant.id },
        });
      }
    });

    return this.getOne(actor, conversationId);
  }

  async addParticipants(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    userIds: string[],
    context: RequestContext,
  ): Promise<ConversationView> {
    const { conversation, participant } = await this.getParticipation(
      actor.sub,
      conversationId,
    );

    if (conversation.type !== ConversationType.GROUP) throw groupOnly();
    if (participant.role !== PARTICIPANT_ROLE.OWNER) throw ownerOnly();

    const memberIds = [...new Set(userIds)].filter((id) => id !== actor.sub);
    await this.assertGroupMembers(conversation.workspaceId, memberIds);

    const current = new Map(
      conversation.participants.map((entry) => [entry.userId, entry]),
    );
    const added = memberIds.filter(
      (userId) => current.get(userId)?.status !== ParticipantStatus.ACTIVE,
    );

    await this.prisma.$transaction(async (transaction) => {
      for (const userId of added) {
        // A member who joins reads the history, with nothing unread.
        await transaction.conversationParticipant.upsert({
          create: {
            conversationId: conversation.id,
            lastReadSeq: conversation.lastSeq,
            role: PARTICIPANT_ROLE.MEMBER,
            status: ParticipantStatus.ACTIVE,
            userId,
          },
          update: {
            joinedAt: new Date(),
            lastReadSeq: conversation.lastSeq,
            leftAt: null,
            role: PARTICIPANT_ROLE.MEMBER,
            status: ParticipantStatus.ACTIVE,
          },
          where: {
            conversationId_userId: { conversationId: conversation.id, userId },
          },
        });
        await this.audit(
          'CONVERSATION_MEMBER_ADDED',
          actor,
          conversation.id,
          { memberId: userId },
          context,
          transaction,
        );
      }
    });

    return this.getOne(actor, conversationId);
  }

  // The OWNER removes a member; any member removes themselves (leaves). An
  // OWNER who leaves hands the group to its longest-standing member.
  async removeParticipant(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    userId: string,
    context: RequestContext,
  ): Promise<{ id: string; status: ParticipantStatus } | ConversationView> {
    const { conversation, participant } = await this.getParticipation(
      actor.sub,
      conversationId,
    );

    if (conversation.type !== ConversationType.GROUP) throw groupOnly();

    const leaving = userId === actor.sub;
    const isOwner = participant.role === PARTICIPANT_ROLE.OWNER;

    if (!leaving && !isOwner) throw ownerOnly();

    const target = conversation.participants.find(
      (entry) =>
        entry.userId === userId && OPEN_STATUSES.includes(entry.status),
    );

    if (!target) throw participantNotFound();

    const successor =
      leaving && isOwner
        ? conversation.participants.find(
            (entry) =>
              entry.userId !== actor.sub &&
              entry.status === ParticipantStatus.ACTIVE,
          )
        : undefined;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.conversationParticipant.update({
        data: {
          leftAt: new Date(),
          role: PARTICIPANT_ROLE.MEMBER,
          status: ParticipantStatus.LEFT,
        },
        where: { id: target.id },
      });
      if (successor) {
        await transaction.conversationParticipant.update({
          data: { role: PARTICIPANT_ROLE.OWNER },
          where: { id: successor.id },
        });
      }
      await this.audit(
        leaving ? 'CONVERSATION_LEFT' : 'CONVERSATION_MEMBER_REMOVED',
        actor,
        conversation.id,
        leaving
          ? { newOwnerId: successor?.userId ?? null }
          : { memberId: userId },
        context,
        transaction,
      );
    });

    return leaving
      ? { id: conversation.id, status: ParticipantStatus.LEFT }
      : this.getOne(actor, conversationId);
  }

  async accept(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<ConversationView> {
    const { participant } = await this.getParticipation(
      actor.sub,
      conversationId,
      OPEN_STATUSES,
    );

    if (participant.status !== ParticipantStatus.PENDING) throw notPending();

    await this.prisma.conversationParticipant.update({
      data: { status: ParticipantStatus.ACTIVE },
      where: { id: participant.id },
    });
    return this.getOne(actor, conversationId);
  }

  // The request leaves the recipient's list; the sender cannot write again
  // (CONVERSATION_CLOSED) unless the recipient starts the conversation.
  async decline(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<{ id: string; status: ParticipantStatus }> {
    const { participant } = await this.getParticipation(
      actor.sub,
      conversationId,
      OPEN_STATUSES,
    );

    if (participant.status !== ParticipantStatus.PENDING) throw notPending();

    await this.prisma.conversationParticipant.update({
      data: { leftAt: new Date(), status: ParticipantStatus.LEFT },
      where: { id: participant.id },
    });
    return { id: conversationId, status: ParticipantStatus.LEFT };
  }

  // --- Creation ---------------------------------------------------------------

  // One conversation per pair. The other professional must be verified and
  // usable, and either a member of a workspace of the caller or listed in
  // the directory; outside the caller's workspaces, they receive a request
  // (PENDING) carrying a single message until they accept it.
  private async createDirect(
    actor: AuthenticatedUserPayload,
    otherUserId: string,
    context: RequestContext,
  ) {
    if (otherUserId === actor.sub) throw cannotMessageSelf();

    const blocks = await this.users.blockRelation(actor.sub, otherUserId);

    if (blocks.blockedMe) throw recipientNotFound();
    if (blocks.blockedByMe) throw contactBlocked();

    const other = await this.prisma.user.findFirst({
      select: { discoverableByPeers: true, id: true },
      where: { AND: [{ id: otherUserId }, reachableUserWhere] },
    });

    if (!other) throw recipientNotFound();

    const sameWorkspace = await this.users.shareWorkspace(actor.sub, other.id);

    if (!sameWorkspace && !other.discoverableByPeers) throw recipientNotFound();

    const directKey = directKeyFor(actor.sub, other.id);
    const existing = await this.findDirect(directKey);

    if (existing) {
      return {
        conversation: await this.reopenDirect(existing, actor),
        created: false,
      };
    }

    try {
      const conversation = await this.prisma.$transaction(
        async (transaction) => {
          const created = await transaction.conversation.create({
            data: {
              createdById: actor.sub,
              directKey,
              participants: {
                create: [
                  {
                    role: PARTICIPANT_ROLE.MEMBER,
                    status: ParticipantStatus.ACTIVE,
                    userId: actor.sub,
                  },
                  {
                    role: PARTICIPANT_ROLE.MEMBER,
                    status: sameWorkspace
                      ? ParticipantStatus.ACTIVE
                      : ParticipantStatus.PENDING,
                    userId: other.id,
                  },
                ],
              },
              type: ConversationType.DIRECT,
            },
            include: participantsInclude,
          });
          await this.audit(
            'CONVERSATION_CREATED',
            actor,
            created.id,
            {
              participantIds: [other.id],
              request: !sameWorkspace,
              type: ConversationType.DIRECT,
            },
            context,
            transaction,
          );
          return created;
        },
      );
      return {
        conversation: await this.view(conversation, actor.sub),
        created: true,
      };
    } catch (error) {
      // Both sides opened it at the same time: the other request won.
      const raced = isUniqueViolation(error)
        ? await this.findDirect(directKey)
        : null;
      if (!raced) throw error;
      return {
        conversation: await this.reopenDirect(raced, actor),
        created: false,
      };
    }
  }

  private findDirect(directKey: string) {
    return this.prisma.conversation.findUnique({
      include: participantsInclude,
      where: { directKey },
    });
  }

  // Opening an existing DIRECT conversation makes the caller ACTIVE again:
  // a request they had not answered, or had declined, counts as accepted.
  private async reopenDirect(
    conversation: ConversationWithParticipants,
    actor: AuthenticatedUserPayload,
  ): Promise<ConversationView> {
    const mine = conversation.participants.find(
      (entry) => entry.userId === actor.sub,
    );

    if (mine && mine.status !== ParticipantStatus.ACTIVE) {
      await this.prisma.conversationParticipant.update({
        data: { leftAt: null, status: ParticipantStatus.ACTIVE },
        where: { id: mine.id },
      });
      return this.getOne(actor, conversation.id);
    }

    return this.view(conversation, actor.sub);
  }

  // A team conversation of the caller's workspace: every member is a
  // verified professional with an ACTIVE membership of that workspace.
  private async createGroup(
    actor: AuthenticatedUserPayload,
    rawTitle: string,
    participantIds: string[],
    context: RequestContext,
  ) {
    const title = this.readTitle(rawTitle);
    const { workspaceId } = await this.workspaceContext.resolveWorkspaceForUser(
      {
        role: actor.role,
        userId: actor.sub,
      },
    );
    const memberIds = [...new Set(participantIds)].filter(
      (id) => id !== actor.sub,
    );
    await this.assertGroupMembers(workspaceId, memberIds);

    const conversation = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.conversation.create({
        data: {
          createdById: actor.sub,
          participants: {
            create: [
              {
                role: PARTICIPANT_ROLE.OWNER,
                status: ParticipantStatus.ACTIVE,
                userId: actor.sub,
              },
              ...memberIds.map((userId) => ({
                role: PARTICIPANT_ROLE.MEMBER,
                status: ParticipantStatus.ACTIVE,
                userId,
              })),
            ],
          },
          title,
          type: ConversationType.GROUP,
          workspaceId,
        },
        include: participantsInclude,
      });
      await this.audit(
        'CONVERSATION_CREATED',
        actor,
        created.id,
        {
          participantIds: memberIds,
          type: ConversationType.GROUP,
          workspaceId,
        },
        context,
        transaction,
      );
      return created;
    });

    return {
      conversation: await this.view(conversation, actor.sub),
      created: true,
    };
  }

  private async assertGroupMembers(
    workspaceId: string | null,
    memberIds: string[],
  ): Promise<void> {
    if (!workspaceId || memberIds.length === 0) throw invalidGroupMembers();

    const eligible = await this.prisma.user.count({
      where: {
        AND: [
          { id: { in: memberIds } },
          reachableUserWhere,
          {
            workspaceMemberships: {
              some: { status: WorkspaceMembershipStatus.ACTIVE, workspaceId },
            },
          },
        ],
      },
    });

    if (eligible !== memberIds.length) throw invalidGroupMembers();
  }

  private readTitle(value: string): string {
    const title = sanitizeTextInput(value);

    if (title.length === 0 || title.length > CONVERSATION_TITLE_MAX_LENGTH) {
      throw invalidTitle();
    }

    return title;
  }

  // --- Views ------------------------------------------------------------------

  private async view(
    conversation: ConversationWithParticipants,
    userId: string,
  ): Promise<ConversationView> {
    const lastMessages = await this.findLastMessages([conversation]);
    return this.toView(
      conversation,
      userId,
      lastMessages.get(conversation.id) ?? null,
    );
  }

  private async findLastMessages(
    conversations: ConversationWithParticipants[],
  ): Promise<Map<string, Message>> {
    const withMessages = conversations.filter(({ lastSeq }) => lastSeq > 0);

    if (withMessages.length === 0) {
      return new Map();
    }

    const messages = await this.prisma.message.findMany({
      where: {
        OR: withMessages.map(({ id, lastSeq }) => ({
          conversationId: id,
          seq: lastSeq,
        })),
      },
    });
    return new Map(
      messages.map((message) => [message.conversationId, message]),
    );
  }

  private toView(
    conversation: ConversationWithParticipants,
    userId: string,
    lastMessage: Message | null,
  ): ConversationView {
    const me = conversation.participants.find(
      (entry) => entry.userId === userId,
    ) as ParticipantRow;

    return {
      archivedAt: conversation.archivedAt,
      createdAt: conversation.createdAt,
      createdById: conversation.createdById,
      id: conversation.id,
      lastMessage: lastMessage
        ? toLastMessageView(this.crypto, lastMessage)
        : null,
      lastMessageAt: conversation.lastMessageAt,
      lastSeq: conversation.lastSeq,
      me: {
        lastReadSeq: me.lastReadSeq,
        mutedUntil: me.mutedUntil,
        role: me.role,
        status: me.status,
      },
      // Both sides of a DIRECT conversation are always named; a group shows
      // its current members.
      participants: conversation.participants
        .filter(
          (entry) =>
            conversation.type === ConversationType.DIRECT ||
            OPEN_STATUSES.includes(entry.status),
        )
        .map((entry) => {
          const profile = toPeerProfile(entry.user);
          return {
            establishmentName: profile.establishmentName,
            fullName: profile.fullName,
            role: entry.role,
            speciality: profile.speciality,
            status: entry.status,
            userId: entry.userId,
          };
        }),
      title: conversation.title,
      type: conversation.type,
      unreadCount: Math.max(0, conversation.lastSeq - me.lastReadSeq),
      workspaceId: conversation.workspaceId,
    };
  }

  // Never the text of a message: identifiers only.
  private audit(
    action: string,
    actor: AuthenticatedUserPayload,
    conversationId: string,
    metadata: Prisma.InputJsonObject,
    context: RequestContext,
    client: Prisma.TransactionClient,
  ) {
    return this.auditLogs.createAuditLog(
      {
        action,
        entityId: conversationId,
        entityType: AUDIT_ENTITY,
        ipAddress: context.ipAddress,
        metadata,
        userAgent: context.userAgent,
        userId: actor.sub,
      },
      client,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
