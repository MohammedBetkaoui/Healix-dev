import { Injectable } from '@nestjs/common';
import {
  ConversationType,
  type Message,
  MessageKind,
  MessagePriority,
  ParticipantStatus,
  Prisma,
} from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type RequestContext } from '../common/utils/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConversationsService,
  type Participation,
} from './conversations.service';
import {
  type EditMessageDto,
  type ListMessagesQueryDto,
  type SendMessageDto,
} from './dto/messages.dto';
import { MessageCrypto } from './message-crypto';
import { MessagingEvents } from './messaging-events';
import { type MessageView, toMessageView } from './message-views';
import {
  ackNotAvailable,
  clientMessageIdConflict,
  contactBlocked,
  conversationClosed,
  conversationPending,
  editWindowClosed,
  invalidBody,
  invalidHistoryQuery,
  invalidReply,
  messageNotEditable,
  messageNotFound,
  notMessageAuthor,
  recipientNotFound,
} from './messaging-errors';
import {
  bodyLength,
  isWithinEditWindow,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_PAGE_LIMIT_DEFAULT,
  nextReadSeq,
  sanitizeMessageBody,
} from './messaging-rules';
import { MessagingUsersService } from './messaging-users.service';

export type MessagePage = {
  items: MessageView[];
  // More messages exist in the direction asked: older ones for the latest
  // page and beforeSeq, newer ones for afterSeq.
  hasMore: boolean;
};

export type ReadState = {
  conversationId: string;
  lastReadSeq: number;
  unreadCount: number;
};

export type UnreadCount = {
  // Unread messages over the conversations that are not muted.
  total: number;
  // Conversations with at least one of them.
  conversations: number;
};

const AUDIT_ENTITY = 'MESSAGE';

function readBodyOrThrow(value: string): string {
  const body = sanitizeMessageBody(value);
  const length = bodyLength(body);

  if (length === 0 || length > MESSAGE_BODY_MAX_LENGTH) {
    throw invalidBody();
  }

  return body;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly users: MessagingUsersService,
    private readonly auditLogs: AuditLogsService,
    private readonly crypto: MessageCrypto,
    private readonly events: MessagingEvents,
  ) {}

  // A PENDING recipient reads the request before answering it.
  async list(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<MessagePage> {
    if (query.beforeSeq !== undefined && query.afterSeq !== undefined) {
      throw invalidHistoryQuery();
    }

    const { conversation } = await this.conversations.getParticipation(
      actor.sub,
      conversationId,
      [ParticipantStatus.ACTIVE, ParticipantStatus.PENDING],
    );
    const limit = query.limit ?? MESSAGE_PAGE_LIMIT_DEFAULT;
    const forward = query.afterSeq !== undefined;
    const rows = await this.prisma.message.findMany({
      orderBy: { seq: forward ? 'asc' : 'desc' },
      take: limit + 1,
      where: {
        conversationId: conversation.id,
        ...(forward
          ? { seq: { gt: query.afterSeq } }
          : query.beforeSeq !== undefined
            ? { seq: { lt: query.beforeSeq } }
            : {}),
      },
    });
    const page = rows.slice(0, limit);

    return {
      hasMore: rows.length > limit,
      items: (forward ? page : page.reverse()).map((message) =>
        toMessageView(this.crypto, message, actor.sub),
      ),
    };
  }

  // 201 with a new message; 200 with the one this clientMessageId already
  // sent, never a duplicate.
  async send(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<{ message: MessageView; created: boolean }> {
    if (dto.requiresAck) throw ackNotAvailable();

    const participation = await this.conversations.getParticipation(
      actor.sub,
      conversationId,
      [ParticipantStatus.ACTIVE, ParticipantStatus.PENDING],
    );
    const already = await this.findSent(actor.sub, dto.clientMessageId);

    if (already) {
      return this.resend(already, conversationId, actor.sub);
    }

    const body = readBodyOrThrow(dto.body);
    const { firstMessageOnly } = await this.assertCanSend(actor, participation);

    if (dto.replyToId) {
      const quoted = await this.prisma.message.count({
        where: { conversationId, id: dto.replyToId },
      });
      if (quoted === 0) throw invalidReply();
    }

    const encrypted = this.crypto.encrypt(body, conversationId);

    try {
      const message = await this.prisma.$transaction(async (transaction) => {
        // The sequence number: the conversation row is incremented, then read
        // back under its lock, so concurrent senders queue on it and each
        // gets the next number, without gap nor duplicate.
        await transaction.$executeRaw`UPDATE conversations SET last_seq = last_seq + 1 WHERE id = ${conversationId}`;
        const [row] = await transaction.$queryRaw<
          { last_seq: number | bigint }[]
        >`SELECT last_seq FROM conversations WHERE id = ${conversationId} FOR UPDATE`;
        const seq = Number(row.last_seq);

        // A request across workspaces carries one message until accepted.
        if (firstMessageOnly && seq > 1) throw conversationPending();

        const created = await transaction.message.create({
          data: {
            bodyCiphertext: encrypted.ciphertext,
            clientMessageId: dto.clientMessageId,
            conversationId,
            keyId: encrypted.keyId,
            kind: MessageKind.TEXT,
            priority: dto.priority ?? MessagePriority.NORMAL,
            replyToId: dto.replyToId ?? null,
            senderId: actor.sub,
            seq,
          },
        });
        // A new message brings an archived conversation back.
        await transaction.conversation.update({
          data: { archivedAt: null, lastMessageAt: created.createdAt },
          where: { id: conversationId },
        });
        // The sender has read up to their own message.
        await transaction.conversationParticipant.updateMany({
          data: { lastReadSeq: seq },
          where: { id: participation.participant.id, lastReadSeq: { lt: seq } },
        });
        return created;
      });
      await this.events.messageCreated(conversationId, message.seq);

      return {
        created: true,
        message: toMessageView(this.crypto, message, actor.sub, body),
      };
    } catch (error) {
      // The same clientMessageId sent twice at once: the other request won,
      // and this one was rolled back with its sequence number.
      const raced = isUniqueViolation(error)
        ? await this.findSent(actor.sub, dto.clientMessageId)
        : null;
      if (!raced) throw error;
      return this.resend(raced, conversationId, actor.sub);
    }
  }

  // The author, within 15 minutes; the previous text goes to
  // MessageRevision (medico-legal record).
  async edit(
    actor: AuthenticatedUserPayload,
    messageId: string,
    dto: EditMessageDto,
    context: RequestContext,
  ): Promise<MessageView> {
    const message = await this.findOwnMessage(actor, messageId);

    if (message.kind !== MessageKind.TEXT || message.deletedAt !== null) {
      throw messageNotEditable();
    }

    const now = new Date();
    if (!isWithinEditWindow(message.createdAt, now)) throw editWindowClosed();

    const body = readBodyOrThrow(dto.body);
    const encrypted = this.crypto.encrypt(body, message.conversationId);

    const updated = await this.prisma.$transaction(async (transaction) => {
      if (message.bodyCiphertext && message.keyId) {
        await transaction.messageRevision.create({
          data: {
            bodyCiphertext: message.bodyCiphertext,
            keyId: message.keyId,
            messageId: message.id,
          },
        });
      }
      const saved = await transaction.message.update({
        data: {
          bodyCiphertext: encrypted.ciphertext,
          editedAt: now,
          keyId: encrypted.keyId,
        },
        where: { id: message.id },
      });
      await this.audit('MESSAGE_EDITED', actor, saved, context, transaction);
      return saved;
    });
    await this.events.messageUpdated(updated.conversationId, updated.id);

    return toMessageView(this.crypto, updated, actor.sub, body);
  }

  // Logical deletion by the author: the body stays encrypted for the audit
  // and is no longer sent (body null, deleted true).
  async remove(
    actor: AuthenticatedUserPayload,
    messageId: string,
    context: RequestContext,
  ): Promise<MessageView> {
    const message = await this.findOwnMessage(actor, messageId);

    if (message.deletedAt !== null) {
      return toMessageView(this.crypto, message, actor.sub);
    }

    const deleted = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.message.update({
        data: { deletedAt: new Date() },
        where: { id: message.id },
      });
      await this.audit('MESSAGE_DELETED', actor, saved, context, transaction);
      return saved;
    });
    await this.events.messageDeleted(deleted.conversationId, deleted.id);

    return toMessageView(this.crypto, deleted, actor.sub);
  }

  // Never backwards, never past the last message.
  async markRead(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    seq: number,
  ): Promise<ReadState> {
    const { conversation, participant } =
      await this.conversations.getParticipation(actor.sub, conversationId, [
        ParticipantStatus.ACTIVE,
        ParticipantStatus.PENDING,
      ]);
    const target = nextReadSeq(
      participant.lastReadSeq,
      seq,
      conversation.lastSeq,
    );

    // Conditional: a concurrent, further read is never moved back.
    const { count: moved } =
      await this.prisma.conversationParticipant.updateMany({
        data: { lastReadSeq: target },
        where: { id: participant.id, lastReadSeq: { lt: target } },
      });
    const saved = await this.prisma.conversationParticipant.findUniqueOrThrow({
      select: {
        conversation: { select: { lastSeq: true } },
        lastReadSeq: true,
      },
      where: { id: participant.id },
    });

    if (moved > 0) {
      await this.events.readUpdated(
        conversationId,
        actor.sub,
        saved.lastReadSeq,
      );
    }

    return {
      conversationId,
      lastReadSeq: saved.lastReadSeq,
      unreadCount: Math.max(0, saved.conversation.lastSeq - saved.lastReadSeq),
    };
  }

  // "Is typing", for the other ACTIVE participants; the calls less than 3 s
  // apart are ignored (MessagingEvents). Nothing between two professionals
  // of whom one blocked the other.
  async typing(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<void> {
    const { conversation } = await this.conversations.getParticipation(
      actor.sub,
      conversationId,
    );

    if (conversation.type === ConversationType.DIRECT) {
      const other = conversation.participants.find(
        (entry) => entry.userId !== actor.sub,
      );
      const blocks = other
        ? await this.users.blockRelation(actor.sub, other.userId)
        : null;
      if (!blocks || blocks.blockedMe || blocks.blockedByMe) {
        return;
      }
    }

    await this.events.typing(conversationId, actor.sub);
  }

  // The badge of the menu: lastSeq - lastReadSeq summed in SQL over the
  // caller's conversations, muted ones aside, and the groups of a workspace
  // the caller is no longer an ACTIVE member of (as groupWorkspaceMemberWhere).
  async unreadCount(actor: AuthenticatedUserPayload): Promise<UnreadCount> {
    const [row] = await this.prisma.$queryRaw<
      { total: unknown; conversations: unknown }[]
    >`
      SELECT COALESCE(SUM(c.last_seq - p.last_read_seq), 0) AS total,
             COUNT(*) AS conversations
      FROM conversation_participants p
      JOIN conversations c ON c.id = p.conversation_id
      WHERE p.user_id = ${actor.sub}
        AND p.status IN ('ACTIVE', 'PENDING')
        AND c.type IN ('DIRECT', 'GROUP')
        AND c.last_seq > p.last_read_seq
        AND (p.muted_until IS NULL OR p.muted_until <= UTC_TIMESTAMP(3))
        AND (c.type <> 'GROUP' OR EXISTS (
          SELECT 1 FROM workspace_memberships m
          WHERE m.workspace_id = c.workspace_id
            AND m.user_id = p.user_id
            AND m.status = 'ACTIVE'))`;

    return {
      conversations: Number(row?.conversations ?? 0),
      total: Number(row?.total ?? 0),
    };
  }

  // --- Helpers ----------------------------------------------------------------

  // An ACTIVE sender; in a DIRECT conversation, neither side blocked and the
  // other side still there. A request (the other side PENDING) carries its
  // first message only, checked again under the conversation's lock.
  private async assertCanSend(
    actor: AuthenticatedUserPayload,
    { conversation, participant }: Participation,
  ): Promise<{ firstMessageOnly: boolean }> {
    if (participant.status === ParticipantStatus.PENDING) {
      // The recipient of a request accepts it before writing.
      throw conversationPending();
    }

    if (conversation.type !== ConversationType.DIRECT) {
      return { firstMessageOnly: false };
    }

    const other = conversation.participants.find(
      (entry) => entry.userId !== actor.sub,
    );

    if (!other) throw conversationClosed();

    const blocks = await this.users.blockRelation(actor.sub, other.userId);

    if (blocks.blockedMe) throw recipientNotFound();
    if (blocks.blockedByMe) throw contactBlocked();

    if (other.status === ParticipantStatus.PENDING) {
      if (conversation.lastSeq > 0) throw conversationPending();
      return { firstMessageOnly: true };
    }

    if (other.status !== ParticipantStatus.ACTIVE) throw conversationClosed();

    return { firstMessageOnly: false };
  }

  private findSent(senderId: string, clientMessageId: string) {
    return this.prisma.message.findUnique({
      where: { senderId_clientMessageId: { clientMessageId, senderId } },
    });
  }

  private resend(
    message: Message,
    conversationId: string,
    viewerId: string,
  ): { message: MessageView; created: boolean } {
    if (message.conversationId !== conversationId) {
      throw clientMessageIdConflict();
    }
    return {
      created: false,
      message: toMessageView(this.crypto, message, viewerId),
    };
  }

  // A message of a conversation the caller is an ACTIVE participant of
  // (404 otherwise), written by the caller (403 otherwise).
  private async findOwnMessage(
    actor: AuthenticatedUserPayload,
    messageId: string,
  ): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) throw messageNotFound();

    try {
      await this.conversations.getParticipation(
        actor.sub,
        message.conversationId,
      );
    } catch {
      throw messageNotFound();
    }

    if (message.senderId !== actor.sub) throw notMessageAuthor();

    return message;
  }

  // Never the text: the conversation and the position of the message.
  private audit(
    action: string,
    actor: AuthenticatedUserPayload,
    message: Message,
    context: RequestContext,
    client: Prisma.TransactionClient,
  ) {
    return this.auditLogs.createAuditLog(
      {
        action,
        entityId: message.id,
        entityType: AUDIT_ENTITY,
        ipAddress: context.ipAddress,
        metadata: { conversationId: message.conversationId, seq: message.seq },
        userAgent: context.userAgent,
        userId: actor.sub,
      },
      client,
    );
  }
}
