import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConversationType,
  MessageKind,
  MessagePriority,
  ParticipantStatus,
  Prisma,
} from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type RequestContext } from '../common/utils/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CaseRecordService } from './case-record.service';
import {
  type ConversationWithParticipants,
  ConversationsService,
  otherOpenCaseExists,
  type Participation,
} from './conversations.service';
import {
  type EditMessageDto,
  type ListMessagesQueryDto,
  type SendMessageDto,
} from './dto/messages.dto';
import { MessageCrypto } from './message-crypto';
import { MessagingEvents } from './messaging-events';
import {
  messageDetailsInclude,
  type MessageView,
  type MessageWithDetails,
  type RecipientView,
  toMessageView,
} from './message-views';
import {
  ackNotRequired,
  ackRequiresUrgent,
  cannotAckOwnMessage,
  clientMessageIdConflict,
  contactBlocked,
  conversationClosed,
  conversationPending,
  editWindowClosed,
  invalidAttachments,
  invalidBody,
  invalidHistoryQuery,
  invalidReply,
  messageDeleted,
  messageNotEditable,
  messageNotFound,
  notMessageAuthor,
  recipientNotFound,
} from './messaging-errors';
import {
  ATTACHMENTS_PER_MESSAGE_MAX,
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

// The text, normalized; empty only when files carry the message.
function readBodyOrThrow(value: string, allowEmpty: boolean): string {
  const body = sanitizeMessageBody(value);
  const length = bodyLength(body);

  if ((length === 0 && !allowEmpty) || length > MESSAGE_BODY_MAX_LENGTH) {
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

// The ACTIVE participants, those an acknowledgement is expected from (the
// sender aside, in toMessageView).
function activeParticipantsOf(
  conversation: ConversationWithParticipants,
): RecipientView[] {
  return conversation.participants
    .filter((entry) => entry.status === ParticipantStatus.ACTIVE)
    .map((entry) => ({ fullName: entry.user.fullName, userId: entry.userId }));
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
    private readonly caseRecord: CaseRecordService,
  ) {}

  // A PENDING recipient reads the request before answering it. Reading a
  // case discussion is traced in the patient's record, once a day.
  async list(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<MessagePage> {
    if (query.beforeSeq !== undefined && query.afterSeq !== undefined) {
      throw invalidHistoryQuery();
    }

    const { conversation } = await this.conversations.getParticipation(
      actor,
      conversationId,
      [ParticipantStatus.ACTIVE, ParticipantStatus.PENDING],
    );
    const limit = query.limit ?? MESSAGE_PAGE_LIMIT_DEFAULT;
    const forward = query.afterSeq !== undefined;
    const rows = await this.prisma.message.findMany({
      include: messageDetailsInclude,
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
    await this.caseRecord.recordView(actor, conversation);
    const page = rows.slice(0, limit);
    const participants = activeParticipantsOf(conversation);

    return {
      hasMore: rows.length > limit,
      items: (forward ? page : page.reverse()).map((message) =>
        toMessageView(this.crypto, message, actor.sub, { participants }),
      ),
    };
  }

  // 201 with a new message; 200 with the one this clientMessageId already
  // sent, never a duplicate. Files uploaded beforehand (attachmentIds) go
  // with it; without text, it is an ATTACHMENT message. An acknowledgement
  // is asked for an urgent message only.
  async send(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<{ message: MessageView; created: boolean }> {
    const priority = dto.priority ?? MessagePriority.NORMAL;
    const requiresAck = dto.requiresAck ?? false;
    if (requiresAck && priority !== MessagePriority.URGENT) {
      throw ackRequiresUrgent();
    }

    const participation = await this.conversations.getParticipation(
      actor,
      conversationId,
      [ParticipantStatus.ACTIVE, ParticipantStatus.PENDING],
    );
    const participants = activeParticipantsOf(participation.conversation);
    const already = await this.findSent(actor.sub, dto.clientMessageId);

    if (already) {
      return this.resend(already, conversationId, actor.sub, participants);
    }

    const attachmentIds = [...new Set(dto.attachmentIds ?? [])];
    const body = readBodyOrThrow(dto.body, attachmentIds.length > 0);
    const { firstMessageOnly } = await this.assertCanSend(actor, participation);

    if (dto.replyToId) {
      const quoted = await this.prisma.message.count({
        where: { conversationId, id: dto.replyToId },
      });
      if (quoted === 0) throw invalidReply();
    }
    await this.assertAttachable(actor, conversationId, attachmentIds);

    const encrypted = body ? this.crypto.encrypt(body, conversationId) : null;
    const { conversation } = participation;

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
            bodyCiphertext: encrypted?.ciphertext ?? null,
            clientMessageId: dto.clientMessageId,
            conversationId,
            keyId: encrypted?.keyId ?? null,
            kind: body ? MessageKind.TEXT : MessageKind.ATTACHMENT,
            priority,
            replyToId: dto.replyToId ?? null,
            requiresAck,
            senderId: actor.sub,
            seq,
          },
        });

        // Checked again under the lock: each file is the sender's, of this
        // conversation, and not sent yet; otherwise nothing is sent.
        if (attachmentIds.length > 0) {
          const { count } = await transaction.messageAttachment.updateMany({
            data: { messageId: created.id },
            where: {
              conversationId,
              id: { in: attachmentIds },
              messageId: null,
              uploaderId: actor.sub,
            },
          });
          if (count !== attachmentIds.length) throw invalidAttachments();
        }

        // A new message brings an archived conversation back; a patient's
        // archived discussion only if no other one was opened meanwhile.
        const reopens =
          conversation.archivedAt === null ||
          conversation.type !== ConversationType.CASE ||
          !conversation.patientId ||
          !(await otherOpenCaseExists(
            transaction,
            conversation.patientId,
            conversationId,
          ));
        await transaction.conversation.update({
          data: {
            ...(reopens ? { archivedAt: null } : {}),
            lastMessageAt: created.createdAt,
          },
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
        message: toMessageView(
          this.crypto,
          await this.findWithDetails(message.id),
          actor.sub,
          { knownBody: body || undefined, participants },
        ),
      };
    } catch (error) {
      // The same clientMessageId sent twice at once: the other request won,
      // and this one was rolled back with its sequence number.
      const raced = isUniqueViolation(error)
        ? await this.findSent(actor.sub, dto.clientMessageId)
        : null;
      if (!raced) throw error;
      return this.resend(raced, conversationId, actor.sub, participants);
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
    const { message, participation } = await this.findOwnMessage(
      actor,
      messageId,
    );

    if (message.kind !== MessageKind.TEXT || message.deletedAt !== null) {
      throw messageNotEditable();
    }

    const now = new Date();
    if (!isWithinEditWindow(message.createdAt, now)) throw editWindowClosed();

    const body = readBodyOrThrow(dto.body, false);
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
        include: messageDetailsInclude,
        where: { id: message.id },
      });
      await this.audit('MESSAGE_EDITED', actor, saved, context, transaction);
      return saved;
    });
    await this.events.messageUpdated(updated.conversationId, updated.id);

    return toMessageView(this.crypto, updated, actor.sub, {
      knownBody: body,
      participants: activeParticipantsOf(participation.conversation),
    });
  }

  // Logical deletion by the author: the body stays encrypted for the audit
  // and is no longer sent (body null, deleted true), nor are its files.
  async remove(
    actor: AuthenticatedUserPayload,
    messageId: string,
    context: RequestContext,
  ): Promise<MessageView> {
    const { message, participation } = await this.findOwnMessage(
      actor,
      messageId,
    );
    const participants = activeParticipantsOf(participation.conversation);

    if (message.deletedAt !== null) {
      return toMessageView(this.crypto, message, actor.sub, { participants });
    }

    const deleted = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.message.update({
        data: { deletedAt: new Date() },
        include: messageDetailsInclude,
        where: { id: message.id },
      });
      await this.audit('MESSAGE_DELETED', actor, saved, context, transaction);
      return saved;
    });
    await this.events.messageDeleted(deleted.conversationId, deleted.id);

    return toMessageView(this.crypto, deleted, actor.sub, { participants });
  }

  // The acknowledgement of an urgent message, by one of its recipients;
  // again, nothing changes.
  async ack(
    actor: AuthenticatedUserPayload,
    messageId: string,
    context: RequestContext,
  ): Promise<MessageView> {
    const message = await this.prisma.message.findUnique({
      include: messageDetailsInclude,
      where: { id: messageId },
    });
    if (!message) throw messageNotFound();

    const { conversation } = await this.participationOrNotFound(
      actor,
      message.conversationId,
    );

    if (message.deletedAt !== null) throw messageDeleted();
    if (!message.requiresAck) throw ackNotRequired();
    if (message.senderId === actor.sub) throw cannotAckOwnMessage();

    const { count } = await this.prisma.messageAck.createMany({
      data: [{ messageId: message.id, userId: actor.sub }],
      skipDuplicates: true,
    });
    if (count > 0) {
      await this.auditLogs.createAuditLog({
        action: 'MESSAGE_ACKNOWLEDGED',
        entityId: message.id,
        entityType: AUDIT_ENTITY,
        ipAddress: context.ipAddress,
        metadata: { conversationId: message.conversationId, seq: message.seq },
        userAgent: context.userAgent,
        userId: actor.sub,
      });
      await this.events.messageUpdated(message.conversationId, message.id);
    }

    return toMessageView(
      this.crypto,
      await this.findWithDetails(message.id),
      actor.sub,
      { participants: activeParticipantsOf(conversation) },
    );
  }

  // Never backwards, never past the last message.
  async markRead(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    seq: number,
  ): Promise<ReadState> {
    const { conversation, participant } =
      await this.conversations.getParticipation(actor, conversationId, [
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
      actor,
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
  // caller's conversations, muted ones aside, the groups of a workspace the
  // caller is no longer an ACTIVE member of (as groupWorkspaceMemberWhere),
  // and the case discussions of a patient outside their scope (as
  // caseScopeWhere).
  async unreadCount(actor: AuthenticatedUserPayload): Promise<UnreadCount> {
    const scopeWorkspaceId =
      await this.conversations.caseScopeWorkspaceId(actor);
    const [row] = await this.prisma.$queryRaw<
      { total: unknown; conversations: unknown }[]
    >`
      SELECT COALESCE(SUM(c.last_seq - p.last_read_seq), 0) AS total,
             COUNT(*) AS conversations
      FROM conversation_participants p
      JOIN conversations c ON c.id = p.conversation_id
      WHERE p.user_id = ${actor.sub}
        AND p.status IN ('ACTIVE', 'PENDING')
        AND c.type IN ('DIRECT', 'GROUP', 'CASE')
        AND c.last_seq > p.last_read_seq
        AND (p.muted_until IS NULL OR p.muted_until <= UTC_TIMESTAMP(3))
        AND (c.type <> 'GROUP' OR EXISTS (
          SELECT 1 FROM workspace_memberships m
          WHERE m.workspace_id = c.workspace_id
            AND m.user_id = p.user_id
            AND m.status = 'ACTIVE'))
        AND (c.type <> 'CASE' OR EXISTS (
          SELECT 1 FROM patients pt
          WHERE pt.id = c.patient_id
            AND pt.workspace_id = ${scopeWorkspaceId}))`;

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

  // At most 5 files, each uploaded by the sender to this conversation and
  // not sent yet.
  private async assertAttachable(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    attachmentIds: string[],
  ): Promise<void> {
    if (attachmentIds.length === 0) return;
    if (attachmentIds.length > ATTACHMENTS_PER_MESSAGE_MAX) {
      throw invalidAttachments();
    }

    const usable = await this.prisma.messageAttachment.count({
      where: {
        conversationId,
        id: { in: attachmentIds },
        messageId: null,
        uploaderId: actor.sub,
      },
    });
    if (usable !== attachmentIds.length) throw invalidAttachments();
  }

  private findSent(senderId: string, clientMessageId: string) {
    return this.prisma.message.findUnique({
      include: messageDetailsInclude,
      where: { senderId_clientMessageId: { clientMessageId, senderId } },
    });
  }

  private findWithDetails(messageId: string): Promise<MessageWithDetails> {
    return this.prisma.message.findUniqueOrThrow({
      include: messageDetailsInclude,
      where: { id: messageId },
    });
  }

  private resend(
    message: MessageWithDetails,
    conversationId: string,
    viewerId: string,
    participants: RecipientView[],
  ): { message: MessageView; created: boolean } {
    if (message.conversationId !== conversationId) {
      throw clientMessageIdConflict();
    }
    return {
      created: false,
      message: toMessageView(this.crypto, message, viewerId, { participants }),
    };
  }

  // The caller's ACTIVE participation in a message's conversation; a 404 on
  // the message otherwise.
  private participationOrNotFound(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<Participation> {
    return this.conversations
      .getParticipation(actor, conversationId)
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) throw messageNotFound();
        throw error;
      });
  }

  // A message of a conversation the caller is an ACTIVE participant of
  // (404 otherwise), written by the caller (403 otherwise).
  private async findOwnMessage(
    actor: AuthenticatedUserPayload,
    messageId: string,
  ): Promise<{ message: MessageWithDetails; participation: Participation }> {
    const message = await this.prisma.message.findUnique({
      include: messageDetailsInclude,
      where: { id: messageId },
    });

    if (!message) throw messageNotFound();

    const participation = await this.participationOrNotFound(
      actor,
      message.conversationId,
    );

    if (message.senderId !== actor.sub) throw notMessageAuthor();

    return { message, participation };
  }

  // Never the text: the conversation and the position of the message.
  private audit(
    action: string,
    actor: AuthenticatedUserPayload,
    message: MessageWithDetails,
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
