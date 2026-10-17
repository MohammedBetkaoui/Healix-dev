import { randomBytes, randomUUID } from 'node:crypto';

import { type HttpException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConversationType, ParticipantStatus, Prisma } from '@prisma/client';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { type CaseRecordService } from './case-record.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { type PrismaService } from '../prisma/prisma.service';
import {
  type ConversationsService,
  type Participation,
} from './conversations.service';
import { MessageCrypto } from './message-crypto';
import {
  messageDetailsInclude,
  type MessageWithDetails,
} from './message-views';
import { type MessagingEvents } from './messaging-events';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import {
  bodyLength,
  EDIT_WINDOW_MS,
  isWithinEditWindow,
  nextReadSeq,
  sanitizeMessageBody,
} from './messaging-rules';
import { type MessagingUsersService } from './messaging-users.service';

const ME = 'user-me';
const OTHER = 'user-other';
const CONVERSATION = 'conversation-1';
const context = { ipAddress: '203.0.113.7', userAgent: 'jest' };
const actor: AuthenticatedUserPayload = {
  email: 'me@healix.test',
  role: UserRole.AFFILIATED_DOCTOR,
  sub: ME,
  tokenType: 'access',
};

type ParticipantRow = Participation['participant'];

function participantRow(
  userId: string,
  status: ParticipantStatus = ParticipantStatus.ACTIVE,
): ParticipantRow {
  return {
    conversationId: CONVERSATION,
    id: `participant-${userId}`,
    joinedAt: new Date('2026-10-01T08:00:00Z'),
    lastReadAt: null,
    lastReadSeq: 2,
    leftAt: null,
    mutedUntil: null,
    role: 'MEMBER',
    status,
    user: {
      discoverableByPeers: true,
      doctorProfile: null,
      establishment: null,
      fullName: userId,
      id: userId,
      role: UserRole.AFFILIATED_DOCTOR,
      shareReadReceipts: true,
    },
    userId,
  };
}

function participation(
  options: {
    type?: ConversationType;
    mine?: ParticipantStatus;
    other?: ParticipantStatus;
    lastSeq?: number;
  } = {},
): Participation {
  const participants = [
    participantRow(ME, options.mine),
    participantRow(OTHER, options.other),
  ];
  return {
    conversation: {
      archivedAt: null,
      createdAt: new Date('2026-10-01T08:00:00Z'),
      createdById: ME,
      directKey: `${ME}:${OTHER}`,
      id: CONVERSATION,
      lastMessageAt: null,
      lastSeq: options.lastSeq ?? 5,
      participants,
      patient: null,
      patientId: null,
      title: null,
      type: options.type ?? ConversationType.DIRECT,
      updatedAt: new Date('2026-10-01T08:00:00Z'),
      workspaceId: null,
    },
    participant: participants[0],
  };
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code: string }).code;

function argOf<T = unknown>(mock: jest.Mock, call = 0): T {
  return (mock.mock.calls[call] as [T])[0];
}

type CreateArgs = { data: Record<string, unknown> };

function setup() {
  const crypto = MessageCrypto.fromEnv(
    `k1:${randomBytes(32).toString('base64')}`,
  );
  const stored = (
    overrides: Partial<MessageWithDetails> = {},
  ): MessageWithDetails => {
    const encrypted = crypto.encrypt(
      'Texte enregistré',
      overrides.conversationId ?? CONVERSATION,
    );
    return {
      acks: [],
      attachments: [],
      bodyCiphertext: encrypted.ciphertext,
      clientMessageId: randomUUID(),
      clinicalNotes: [],
      conversationId: CONVERSATION,
      createdAt: new Date(),
      deletedAt: null,
      editedAt: null,
      id: 'message-6',
      keyId: encrypted.keyId,
      kind: 'TEXT',
      priority: 'NORMAL',
      replyToId: null,
      requiresAck: false,
      senderId: ME,
      seq: 6,
      ...overrides,
    };
  };
  // The last message created: what is read back after sending.
  let created: MessageWithDetails | null = null;
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ last_seq: 6 }]),
    $transaction: jest.fn(),
    conversation: { update: jest.fn() },
    conversationParticipant: {
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn((args: CreateArgs) => {
        created = stored(args.data);
        return Promise.resolve(created);
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(created ?? stored())),
      update: jest.fn((args: CreateArgs) =>
        Promise.resolve(stored(args.data as Partial<MessageWithDetails>)),
      ),
    },
    conversationReadMark: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    messageAck: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    messageAttachment: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    messageRevision: { create: jest.fn() },
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof prisma) => unknown) => callback(prisma),
  );
  const conversations = {
    caseScopeWorkspaceId: jest.fn().mockResolvedValue('workspace-a'),
    getParticipation: jest.fn().mockResolvedValue(participation()),
  };
  const caseRecord = { recordView: jest.fn().mockResolvedValue(undefined) };
  const users = {
    blockRelation: jest
      .fn()
      .mockResolvedValue({ blockedByMe: false, blockedMe: false }),
  };
  const auditLogs = { createAuditLog: jest.fn() };
  const events = {
    conversationUpdated: jest.fn().mockResolvedValue(undefined),
    conversationUpdatedFor: jest.fn(),
    messageCreated: jest.fn().mockResolvedValue(undefined),
    messageDeleted: jest.fn().mockResolvedValue(undefined),
    messageUpdated: jest.fn().mockResolvedValue(undefined),
    readUpdated: jest.fn().mockResolvedValue(undefined),
    typing: jest.fn().mockResolvedValue(true),
  };
  const service = new MessagesService(
    prisma as unknown as PrismaService,
    conversations as unknown as ConversationsService,
    users as unknown as MessagingUsersService,
    auditLogs as unknown as AuditLogsService,
    crypto,
    events as unknown as MessagingEvents,
    caseRecord as unknown as CaseRecordService,
  );
  return {
    auditLogs,
    caseRecord,
    conversations,
    crypto,
    events,
    prisma,
    service,
    stored,
    users,
  };
}

const sendDto = (body = 'Bonjour, avis sur ce cas ?') => ({
  body,
  clientMessageId: randomUUID(),
});

describe('message rules', () => {
  it('keeps the line breaks, normalizes each line with sanitizeTextInput', () => {
    expect(
      sanitizeMessageBody('  Bonjour   docteur \r\n\r\n\r\n\n IRM  ok '),
    ).toBe('Bonjour docteur\n\nIRM ok');
    expect(sanitizeMessageBody(42)).toBe('');
  });

  it('counts an emoji as one character', () => {
    expect(bodyLength('🩺ok')).toBe(3);
  });

  it('allows an edit for 15 minutes', () => {
    const sent = new Date('2026-10-16T10:00:00Z');
    expect(
      isWithinEditWindow(sent, new Date(sent.getTime() + EDIT_WINDOW_MS)),
    ).toBe(true);
    expect(
      isWithinEditWindow(sent, new Date(sent.getTime() + EDIT_WINDOW_MS + 1)),
    ).toBe(false);
  });

  it('moves the read position forward only, up to the last message', () => {
    expect(nextReadSeq(5, 8, 10)).toBe(8);
    expect(nextReadSeq(5, 3, 10)).toBe(5);
    expect(nextReadSeq(5, 99, 10)).toBe(10);
  });
});

describe('MessagesService.send', () => {
  it('asks an acknowledgement for an urgent message only', async () => {
    const { prisma, service } = setup();
    const error = await errorOf(
      service.send(actor, CONVERSATION, { ...sendDto(), requiresAck: true }),
    );
    expect(codeOf(error)).toBe('ACK_REQUIRES_URGENT');
    expect(prisma.message.create).not.toHaveBeenCalled();

    const { message } = await service.send(actor, CONVERSATION, {
      ...sendDto(),
      priority: 'URGENT',
      requiresAck: true,
    });
    expect(argOf<CreateArgs>(prisma.message.create).data).toMatchObject({
      priority: 'URGENT',
      requiresAck: true,
    });
    expect(message).toMatchObject({ requiresAck: true });
  });

  it.each([
    ['empty once normalized', ' \n \t '],
    ['longer than 4,000 characters', 'é'.repeat(4_001)],
  ])('refuses a body %s', async (_case, body) => {
    const { prisma, service } = setup();
    const error = await errorOf(
      service.send(actor, CONVERSATION, sendDto(body)),
    );
    expect(codeOf(error)).toBe('INVALID_MESSAGE_BODY');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('numbers the message under the conversation lock and stores it encrypted', async () => {
    const { prisma, service } = setup();
    const text = 'Patient stable.\nContrôle dans 48 h.';

    const { created, message } = await service.send(actor, CONVERSATION, {
      ...sendDto(text),
      priority: 'URGENT',
    });

    const [update] = argOf<TemplateStringsArray>(prisma.$executeRaw);
    expect(update).toContain('SET last_seq = last_seq + 1');
    expect(argOf<TemplateStringsArray>(prisma.$queryRaw).join('?')).toBe(
      'SELECT last_seq FROM conversations WHERE id = ? FOR UPDATE',
    );
    const { data } = argOf<CreateArgs>(prisma.message.create);
    expect(data).toMatchObject({
      conversationId: CONVERSATION,
      keyId: 'k1',
      kind: 'TEXT',
      priority: 'URGENT',
      senderId: ME,
      seq: 6,
    });
    expect(
      Buffer.from(data.bodyCiphertext as Uint8Array).toString(),
    ).not.toContain('Patient');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      data: { archivedAt: null, lastMessageAt: expect.any(Date) as Date },
      where: { id: CONVERSATION },
    });
    expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
      data: { lastReadAt: expect.any(Date) as Date, lastReadSeq: 6 },
      where: { id: `participant-${ME}`, lastReadSeq: { lt: 6 } },
    });
    // The sender has read up to their message: a read mark at its date.
    expect(prisma.conversationReadMark.create).toHaveBeenCalledWith({
      data: {
        conversationId: CONVERSATION,
        readAt: expect.any(Date) as Date,
        seq: 6,
        userId: ME,
      },
    });
    expect(created).toBe(true);
    expect(message).toMatchObject({ body: text, deleted: false, seq: 6 });
  });

  it('returns the message a clientMessageId already sent, without sending again', async () => {
    const { prisma, service, stored } = setup();
    const dto = sendDto();
    prisma.message.findUnique.mockResolvedValue(
      stored({ clientMessageId: dto.clientMessageId }),
    );

    const { created, message } = await service.send(actor, CONVERSATION, dto);

    expect(created).toBe(false);
    expect(message.clientMessageId).toBe(dto.clientMessageId);
    expect(message.body).toBe('Texte enregistré');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a clientMessageId already used in another conversation', async () => {
    const { prisma, service, stored } = setup();
    prisma.message.findUnique.mockResolvedValue(
      stored({ conversationId: 'conversation-2' }),
    );
    const error = await errorOf(service.send(actor, CONVERSATION, sendDto()));
    expect(codeOf(error)).toBe('CLIENT_MESSAGE_ID_CONFLICT');
  });

  it('returns the winner when the same clientMessageId is sent twice at once', async () => {
    const { prisma, service, stored } = setup();
    prisma.message.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored());
    prisma.message.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        clientVersion: 'test',
        code: 'P2002',
      }),
    );

    const { created } = await service.send(actor, CONVERSATION, sendDto());

    expect(created).toBe(false);
  });

  it('makes the recipient of a request accept it before writing', async () => {
    const { conversations, service } = setup();
    conversations.getParticipation.mockResolvedValue(
      participation({ mine: ParticipantStatus.PENDING }),
    );
    const error = await errorOf(service.send(actor, CONVERSATION, sendDto()));
    expect(codeOf(error)).toBe('CONVERSATION_PENDING');
  });

  it('lets a request carry its first message only', async () => {
    const { conversations, prisma, service } = setup();
    conversations.getParticipation.mockResolvedValue(
      participation({ lastSeq: 0, other: ParticipantStatus.PENDING }),
    );
    prisma.$queryRaw.mockResolvedValue([{ last_seq: 1n }]);
    await expect(
      service.send(actor, CONVERSATION, sendDto()),
    ).resolves.toMatchObject({ created: true, message: { seq: 1 } });

    conversations.getParticipation.mockResolvedValue(
      participation({ lastSeq: 1, other: ParticipantStatus.PENDING }),
    );
    const second = await errorOf(service.send(actor, CONVERSATION, sendDto()));
    expect(second.getStatus()).toBe(409);
    expect(codeOf(second)).toBe('CONVERSATION_PENDING');
  });

  it('checks the single message of a request again under the lock (two first messages at once)', async () => {
    const { conversations, prisma, service } = setup();
    conversations.getParticipation.mockResolvedValue(
      participation({ lastSeq: 0, other: ParticipantStatus.PENDING }),
    );
    prisma.$queryRaw.mockResolvedValue([{ last_seq: 2 }]);

    const error = await errorOf(service.send(actor, CONVERSATION, sendDto()));

    expect(codeOf(error)).toBe('CONVERSATION_PENDING');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('answers a neutral 404 to a blocked sender, 409 to the blocker', async () => {
    const { service, users } = setup();
    users.blockRelation.mockResolvedValueOnce({
      blockedByMe: false,
      blockedMe: true,
    });
    const blocked = await errorOf(service.send(actor, CONVERSATION, sendDto()));
    expect(blocked.getStatus()).toBe(404);
    expect(codeOf(blocked)).toBe('RECIPIENT_NOT_FOUND');

    users.blockRelation.mockResolvedValueOnce({
      blockedByMe: true,
      blockedMe: false,
    });
    const blocker = await errorOf(service.send(actor, CONVERSATION, sendDto()));
    expect(codeOf(blocker)).toBe('CONTACT_BLOCKED');
  });

  it('refuses to write to someone who declined', async () => {
    const { conversations, service } = setup();
    conversations.getParticipation.mockResolvedValue(
      participation({ other: ParticipantStatus.LEFT }),
    );
    const error = await errorOf(service.send(actor, CONVERSATION, sendDto()));
    expect(codeOf(error)).toBe('CONVERSATION_CLOSED');
  });

  it('applies no block or request rule to a group', async () => {
    const { conversations, service, users } = setup();
    conversations.getParticipation.mockResolvedValue(
      participation({
        other: ParticipantStatus.LEFT,
        type: ConversationType.GROUP,
      }),
    );
    await service.send(actor, CONVERSATION, sendDto());
    expect(users.blockRelation).not.toHaveBeenCalled();
  });

  it('quotes a message of the same conversation only', async () => {
    const { prisma, service } = setup();
    prisma.message.count.mockResolvedValue(0);
    const error = await errorOf(
      service.send(actor, CONVERSATION, {
        ...sendDto(),
        replyToId: 'elsewhere',
      }),
    );
    expect(codeOf(error)).toBe('INVALID_REPLY');
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: { conversationId: CONVERSATION, id: 'elsewhere' },
    });
  });
});

describe('MessagesService.list', () => {
  it('refuses beforeSeq and afterSeq together', async () => {
    const { service } = setup();
    const error = await errorOf(
      service.list(actor, CONVERSATION, { afterSeq: 1, beforeSeq: 9 }),
    );
    expect(codeOf(error)).toBe('INVALID_HISTORY_QUERY');
  });

  it('pages back with beforeSeq, oldest first, and tells whether more exist', async () => {
    const { prisma, service, stored } = setup();
    prisma.message.findMany.mockResolvedValue([
      stored({ id: 'm8', seq: 8 }),
      stored({ id: 'm7', seq: 7 }),
      stored({ id: 'm6', seq: 6 }),
    ]);

    const page = await service.list(actor, CONVERSATION, {
      beforeSeq: 9,
      limit: 2,
    });

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      include: messageDetailsInclude,
      orderBy: { seq: 'desc' },
      take: 3,
      where: { conversationId: CONVERSATION, seq: { lt: 9 } },
    });
    expect(page.items.map(({ seq }) => seq)).toEqual([7, 8]);
    expect(page.hasMore).toBe(true);
  });

  it('catches up with afterSeq, in order', async () => {
    const { prisma, service, stored } = setup();
    prisma.message.findMany.mockResolvedValue([stored({ seq: 4 })]);

    const page = await service.list(actor, CONVERSATION, { afterSeq: 3 });

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      include: messageDetailsInclude,
      orderBy: { seq: 'asc' },
      take: 31,
      where: { conversationId: CONVERSATION, seq: { gt: 3 } },
    });
    expect(page.hasMore).toBe(false);
  });

  it('lets a PENDING recipient read, hides deleted texts and the others clientMessageId', async () => {
    const { conversations, prisma, service, stored } = setup();
    prisma.message.findMany.mockResolvedValue([
      stored({ deletedAt: new Date(), seq: 2 }),
      stored({ senderId: OTHER, seq: 1 }),
    ]);

    const { items } = await service.list(actor, CONVERSATION, {});

    expect(conversations.getParticipation).toHaveBeenCalledWith(
      actor,
      CONVERSATION,
      ['ACTIVE', 'PENDING'],
    );
    expect(items[0]).toMatchObject({
      body: 'Texte enregistré',
      clientMessageId: null,
      seq: 1,
    });
    expect(items[1]).toMatchObject({ body: null, deleted: true, seq: 2 });
  });

  it('shows a body that does not decrypt as unavailable, without failing the page', async () => {
    const { prisma, service, stored } = setup();
    const altered = stored();
    (altered.bodyCiphertext as Uint8Array)[30] ^= 0x01;
    prisma.message.findMany.mockResolvedValue([altered]);

    const { items } = await service.list(actor, CONVERSATION, {});

    expect(items[0]).toMatchObject({ body: null, bodyUnavailable: true });
  });
});

describe('MessagesService.edit and remove', () => {
  it('lets the author edit within 15 minutes, keeping the previous version', async () => {
    const { auditLogs, prisma, service, stored } = setup();
    const original = stored({ createdAt: new Date(Date.now() - 60_000) });
    prisma.message.findUnique.mockResolvedValue(original);

    const view = await service.edit(
      actor,
      'message-6',
      { body: 'Texte corrigé' },
      context,
    );

    expect(prisma.messageRevision.create).toHaveBeenCalledWith({
      data: {
        bodyCiphertext: original.bodyCiphertext,
        keyId: 'k1',
        messageId: 'message-6',
      },
    });
    expect(argOf<CreateArgs>(prisma.message.update).data).toMatchObject({
      editedAt: expect.any(Date) as Date,
      keyId: 'k1',
    });
    expect(view.body).toBe('Texte corrigé');
    expect(argOf(auditLogs.createAuditLog)).toEqual({
      action: 'MESSAGE_EDITED',
      entityId: 'message-6',
      entityType: 'MESSAGE',
      ipAddress: '203.0.113.7',
      metadata: { conversationId: CONVERSATION, seq: 6 },
      userAgent: 'jest',
      userId: ME,
    });
  });

  it('refuses an edit after 15 minutes, of a deleted message, or by another participant', async () => {
    const { prisma, service, stored } = setup();
    prisma.message.findUnique.mockResolvedValueOnce(
      stored({ createdAt: new Date(Date.now() - EDIT_WINDOW_MS - 1_000) }),
    );
    expect(
      codeOf(await errorOf(service.edit(actor, 'm', { body: 'x' }, context))),
    ).toBe('EDIT_WINDOW_CLOSED');

    prisma.message.findUnique.mockResolvedValueOnce(
      stored({ deletedAt: new Date() }),
    );
    expect(
      codeOf(await errorOf(service.edit(actor, 'm', { body: 'x' }, context))),
    ).toBe('MESSAGE_NOT_EDITABLE');

    prisma.message.findUnique.mockResolvedValueOnce(
      stored({ senderId: OTHER }),
    );
    const notAuthor = await errorOf(
      service.edit(actor, 'm', { body: 'x' }, context),
    );
    expect(notAuthor.getStatus()).toBe(403);
    expect(prisma.messageRevision.create).not.toHaveBeenCalled();
  });

  it('answers 404 for a message of a conversation the caller is not in', async () => {
    const { conversations, prisma, service, stored } = setup();
    prisma.message.findUnique.mockResolvedValue(stored());
    conversations.getParticipation.mockRejectedValue(new NotFoundException());

    const error = await errorOf(service.remove(actor, 'message-6', context));

    expect(codeOf(error)).toBe('MESSAGE_NOT_FOUND');
  });

  it('deletes logically: the text is no longer sent, the audit has no text', async () => {
    const { auditLogs, prisma, service, stored } = setup();
    prisma.message.findUnique.mockResolvedValue(stored());

    const view = await service.remove(actor, 'message-6', context);

    expect(prisma.message.update).toHaveBeenCalledWith({
      data: { deletedAt: expect.any(Date) as Date },
      include: messageDetailsInclude,
      where: { id: 'message-6' },
    });
    expect(view).toMatchObject({ body: null, deleted: true });
    expect(JSON.stringify(argOf(auditLogs.createAuditLog))).not.toContain(
      'Texte',
    );
    expect(argOf(auditLogs.createAuditLog)).toMatchObject({
      action: 'MESSAGE_DELETED',
    });

    // Already deleted: nothing written again.
    prisma.message.update.mockClear();
    prisma.message.findUnique.mockResolvedValue(
      stored({ deletedAt: new Date() }),
    );
    await service.remove(actor, 'message-6', context);
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});

describe('MessagesService read positions', () => {
  it('never moves back nor past the last message', async () => {
    const { prisma, service } = setup();
    prisma.conversationParticipant.findUniqueOrThrow.mockResolvedValue({
      conversation: { lastSeq: 5 },
      lastReadSeq: 5,
    });

    const state = await service.markRead(actor, CONVERSATION, 50);

    expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
      data: { lastReadAt: expect.any(Date) as Date, lastReadSeq: 5 },
      where: { id: `participant-${ME}`, lastReadSeq: { lt: 5 } },
    });
    expect(prisma.conversationReadMark.create).toHaveBeenCalledWith({
      data: {
        conversationId: CONVERSATION,
        readAt: expect.any(Date) as Date,
        seq: 5,
        userId: ME,
      },
    });
    expect(state).toEqual({
      conversationId: CONVERSATION,
      lastReadSeq: 5,
      unreadCount: 0,
    });

    await service.markRead(actor, CONVERSATION, 1);
    expect(
      argOf<{ data: unknown }>(prisma.conversationParticipant.updateMany, 1)
        .data,
    ).toEqual({ lastReadAt: expect.any(Date) as Date, lastReadSeq: 2 });
  });

  it('sums the unread messages in SQL, muted conversations aside', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ conversations: 3n, total: '17' }]);

    await expect(service.unreadCount(actor)).resolves.toEqual({
      conversations: 3,
      total: 17,
    });
    const sql = argOf<TemplateStringsArray>(prisma.$queryRaw).join('?');
    expect(sql).toContain('SUM(c.last_seq - p.last_read_seq)');
    expect(sql).toContain("p.status IN ('ACTIVE', 'PENDING')");
    expect(sql).toContain('p.muted_until <= UTC_TIMESTAMP(3)');
    // A group counts only for an ACTIVE member of its workspace.
    expect(sql).toContain("c.type <> 'GROUP' OR EXISTS");
    expect(sql).toContain("m.status = 'ACTIVE'");
  });
});

describe('MessagesController', () => {
  it('limits the sending to 30 messages per minute, counted per user', () => {
    const send = Object.getOwnPropertyDescriptor(
      MessagesController.prototype,
      'send',
    )?.value as object;
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', send)).toBe(30);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', send)).toBe(60_000);
    expect(
      Reflect.getMetadata('THROTTLER:TRACKERdefault', send),
    ).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, MessagesController)).toContain(
      VerifiedAccountGuard,
    );
  });

  it('limits typing to 20 calls per minute, counted per user', () => {
    const typing = Object.getOwnPropertyDescriptor(
      MessagesController.prototype,
      'typing',
    )?.value as object;
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', typing)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', typing)).toBe(60_000);
    expect(
      Reflect.getMetadata('THROTTLER:TRACKERdefault', typing),
    ).toBeUndefined();
  });
});

describe('MessagesService real-time events', () => {
  it('announces a new message after its transaction, identifiers only', async () => {
    const { events, prisma, service } = setup();

    await service.send(actor, CONVERSATION, sendDto());

    expect(events.messageCreated).toHaveBeenCalledWith(CONVERSATION, 6);
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      events.messageCreated.mock.invocationCallOrder[0],
    );
  });

  it('announces nothing for a message sent again, nor for a refused one', async () => {
    const { conversations, events, prisma, service, stored } = setup();
    const dto = sendDto();
    prisma.message.findUnique.mockResolvedValueOnce(
      stored({ clientMessageId: dto.clientMessageId }),
    );
    await service.send(actor, CONVERSATION, dto);

    conversations.getParticipation.mockResolvedValue(
      participation({ mine: ParticipantStatus.PENDING }),
    );
    await errorOf(service.send(actor, CONVERSATION, sendDto()));

    expect(events.messageCreated).not.toHaveBeenCalled();
  });

  it('announces an edit and a deletion, a second deletion no more', async () => {
    const { events, prisma, service, stored } = setup();
    prisma.message.findUnique.mockResolvedValue(stored());

    await service.edit(actor, 'message-6', { body: 'Corrigé' }, context);
    await service.remove(actor, 'message-6', context);
    prisma.message.findUnique.mockResolvedValue(
      stored({ deletedAt: new Date() }),
    );
    await service.remove(actor, 'message-6', context);

    expect(events.messageUpdated).toHaveBeenCalledWith(
      CONVERSATION,
      'message-6',
    );
    expect(events.messageDeleted).toHaveBeenCalledTimes(1);
  });

  it('announces a read position only when it moved', async () => {
    const { events, prisma, service } = setup();
    prisma.conversationParticipant.findUniqueOrThrow.mockResolvedValue({
      conversation: { lastSeq: 5 },
      lastReadSeq: 4,
    });

    await service.markRead(actor, CONVERSATION, 4);
    expect(events.readUpdated).toHaveBeenCalledWith(
      CONVERSATION,
      ME,
      4,
      expect.any(Date),
    );

    // Not moved: no mark, no event.
    prisma.conversationParticipant.updateMany.mockResolvedValue({ count: 0 });
    prisma.conversationReadMark.create.mockClear();
    await service.markRead(actor, CONVERSATION, 2);
    expect(events.readUpdated).toHaveBeenCalledTimes(1);
    expect(prisma.conversationReadMark.create).not.toHaveBeenCalled();
  });

  it('sends typing for an ACTIVE participant, never between blocked professionals', async () => {
    const { conversations, events, service, users } = setup();

    await service.typing(actor, CONVERSATION);
    expect(events.typing).toHaveBeenCalledWith(CONVERSATION, ME);
    expect(conversations.getParticipation).toHaveBeenLastCalledWith(
      actor,
      CONVERSATION,
    );

    users.blockRelation.mockResolvedValue({
      blockedByMe: false,
      blockedMe: true,
    });
    await service.typing(actor, CONVERSATION);
    expect(events.typing).toHaveBeenCalledTimes(1);

    // A group has no block rule.
    conversations.getParticipation.mockResolvedValue(
      participation({ type: ConversationType.GROUP }),
    );
    await service.typing(actor, CONVERSATION);
    expect(events.typing).toHaveBeenCalledTimes(2);
  });

  it('refuses typing to a non-participant (404)', async () => {
    const { conversations, events, service } = setup();
    conversations.getParticipation.mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 }),
    );

    await expect(service.typing(actor, CONVERSATION)).rejects.toThrow(
      'not found',
    );
    expect(events.typing).not.toHaveBeenCalled();
  });
});

describe('MessagesService attachments', () => {
  const withFiles = (body = '') => ({
    ...sendDto(body),
    attachmentIds: ['file-1', 'file-2'],
  });

  it('sends files without text as an ATTACHMENT message, attached under the lock', async () => {
    const { prisma, service } = setup();
    prisma.messageAttachment.count.mockResolvedValue(2);
    prisma.messageAttachment.updateMany.mockResolvedValue({ count: 2 });

    const { message } = await service.send(actor, CONVERSATION, withFiles());

    const data = argOf<CreateArgs>(prisma.message.create).data;
    expect(data).toMatchObject({ bodyCiphertext: null, kind: 'ATTACHMENT' });
    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
      data: { messageId: message.id },
      where: {
        conversationId: CONVERSATION,
        id: { in: ['file-1', 'file-2'] },
        messageId: null,
        uploaderId: ME,
      },
    });
    expect(message).toMatchObject({ body: null, kind: 'ATTACHMENT' });
  });

  it('refuses files of another sender, conversation, or already sent, and sends nothing', async () => {
    const { prisma, service } = setup();
    prisma.messageAttachment.count.mockResolvedValue(1);

    const error = await errorOf(
      service.send(actor, CONVERSATION, withFiles('Voici les clichés')),
    );

    expect(codeOf(error)).toBe('INVALID_ATTACHMENTS');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('rolls the message back when a file was taken meanwhile', async () => {
    const { prisma, service } = setup();
    prisma.messageAttachment.count.mockResolvedValue(2);
    prisma.messageAttachment.updateMany.mockResolvedValue({ count: 1 });

    const error = await errorOf(
      service.send(actor, CONVERSATION, withFiles('Voici les clichés')),
    );

    expect(codeOf(error)).toBe('INVALID_ATTACHMENTS');
  });

  it('still refuses an empty message without files', async () => {
    const { service } = setup();
    const error = await errorOf(service.send(actor, CONVERSATION, sendDto('')));
    expect(codeOf(error)).toBe('INVALID_MESSAGE_BODY');
  });
});

describe('MessagesService acknowledgements', () => {
  const urgent = (overrides: Partial<MessageWithDetails> = {}) => ({
    priority: 'URGENT' as const,
    requiresAck: true,
    senderId: OTHER,
    ...overrides,
  });

  it('records the acknowledgement of a recipient once, and tells the participants', async () => {
    const { events, prisma, service, stored } = setup();
    prisma.message.findUnique.mockResolvedValue(stored(urgent()));
    prisma.message.findUniqueOrThrow.mockResolvedValue(
      stored(
        urgent({
          acks: [
            {
              ackedAt: new Date('2026-10-17T12:41:00Z'),
              id: 'ack-1',
              messageId: 'message-6',
              user: { fullName: 'Dr Me' },
              userId: ME,
            },
          ],
        }),
      ),
    );

    const view = await service.ack(actor, 'message-6', context);

    expect(prisma.messageAck.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'message-6', userId: ME }],
      skipDuplicates: true,
    });
    expect(events.messageUpdated).toHaveBeenCalledWith(
      CONVERSATION,
      'message-6',
    );
    expect(view).toMatchObject({ ackedByMe: true, pendingAck: [] });

    // Again: nothing new, no event.
    events.messageUpdated.mockClear();
    prisma.messageAck.createMany.mockResolvedValue({ count: 0 });
    await service.ack(actor, 'message-6', context);
    expect(events.messageUpdated).not.toHaveBeenCalled();
  });

  it('is refused to the sender, and on a message that asks none', async () => {
    const { prisma, service, stored } = setup();

    prisma.message.findUnique.mockResolvedValue(
      stored(urgent({ senderId: ME })),
    );
    const own = await errorOf(service.ack(actor, 'message-6', context));
    expect(codeOf(own)).toBe('CANNOT_ACK_OWN_MESSAGE');

    prisma.message.findUnique.mockResolvedValue(
      stored({ requiresAck: false, senderId: OTHER }),
    );
    const notAsked = await errorOf(service.ack(actor, 'message-6', context));
    expect(codeOf(notAsked)).toBe('ACK_NOT_REQUIRED');
    expect(prisma.messageAck.createMany).not.toHaveBeenCalled();
  });

  it('shows the sender who acknowledged, and who has not yet', async () => {
    const { prisma, service, stored } = setup();
    prisma.message.findMany.mockResolvedValue([
      stored(urgent({ senderId: ME })),
    ]);

    const { items } = await service.list(actor, CONVERSATION, {});

    expect(items[0]).toMatchObject({
      ackedByMe: false,
      acks: [],
      pendingAck: [{ fullName: OTHER, userId: OTHER }],
    });
  });
});

describe('MessagesService case discussions', () => {
  it('traces each reading of a case discussion (once a day, in CaseRecordService)', async () => {
    const { caseRecord, conversations, service } = setup();
    const caseParticipation = participation({ type: ConversationType.CASE });
    conversations.getParticipation.mockResolvedValue(caseParticipation);

    await service.list(actor, CONVERSATION, {});

    expect(caseRecord.recordView).toHaveBeenCalledWith(
      actor,
      caseParticipation.conversation,
    );
  });
});

describe('MessagesService.readers', () => {
  const THIRD = 'user-third';
  const sentAt = new Date('2026-10-17T14:00:00Z');

  function groupParticipation(overrides: {
    shares?: Record<string, boolean>;
    lastReadSeq?: Record<string, number>;
    joinedAt?: Record<string, Date>;
  }): Participation {
    const base = participation({ type: ConversationType.GROUP });
    const rows = [ME, OTHER, THIRD].map((userId) => {
      const row = participantRow(userId);
      return {
        ...row,
        joinedAt: overrides.joinedAt?.[userId] ?? row.joinedAt,
        lastReadSeq: overrides.lastReadSeq?.[userId] ?? 0,
        user: {
          ...row.user,
          shareReadReceipts: overrides.shares?.[userId] ?? true,
        },
      };
    });
    return {
      conversation: { ...base.conversation, participants: rows },
      participant: rows[0],
    };
  }

  function setupReaders(group: Participation) {
    const context = setup();
    context.conversations.getParticipation.mockResolvedValue(group);
    context.prisma.message.findUnique.mockResolvedValue({
      conversationId: CONVERSATION,
      createdAt: sentAt,
      id: 'message-6',
      senderId: ME,
      seq: 6,
    });
    return context;
  }

  it('lists who saw a message and when (their first mark that reaches it), and who did not, never the sender', async () => {
    const { prisma, service } = setupReaders(
      groupParticipation({ lastReadSeq: { [ME]: 6, [OTHER]: 8, [THIRD]: 5 } }),
    );
    prisma.conversationReadMark.findMany.mockResolvedValue([
      { readAt: new Date('2026-10-17T14:32:00Z'), userId: OTHER },
      { readAt: new Date('2026-10-17T15:10:00Z'), userId: OTHER },
    ]);

    const readers = await service.readers(actor, 'message-6');

    expect(prisma.conversationReadMark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: CONVERSATION,
          seq: { gte: 6 },
          userId: { in: [OTHER] },
        },
      }),
    );
    expect(readers).toEqual({
      notSeen: [{ fullName: THIRD, userId: THIRD }],
      notShared: [],
      seen: [
        {
          fullName: OTHER,
          seenAt: new Date('2026-10-17T14:32:00Z'),
          userId: OTHER,
        },
      ],
    });
  });

  it('says "not shared" for whoever does not share read receipts, and for everyone when the caller does not', async () => {
    const theirs = setupReaders(
      groupParticipation({
        lastReadSeq: { [OTHER]: 8 },
        shares: { [OTHER]: false },
      }),
    );
    expect(await theirs.service.readers(actor, 'message-6')).toMatchObject({
      notShared: [{ userId: OTHER }],
      seen: [],
    });

    const mine = setupReaders(
      groupParticipation({
        lastReadSeq: { [OTHER]: 8 },
        shares: { [ME]: false },
      }),
    );
    expect(await mine.service.readers(actor, 'message-6')).toEqual({
      notSeen: [],
      notShared: [
        { fullName: OTHER, userId: OTHER },
        { fullName: THIRD, userId: THIRD },
      ],
      seen: [],
    });
  });

  it('leaves out those who joined after the message', async () => {
    const { service } = setupReaders(
      groupParticipation({
        joinedAt: { [THIRD]: new Date('2026-10-17T15:00:00Z') },
        lastReadSeq: { [THIRD]: 9 },
      }),
    );
    const readers = await service.readers(actor, 'message-6');
    expect(
      [...readers.seen, ...readers.notSeen].map(({ userId }) => userId),
    ).toEqual([OTHER]);
  });

  it('answers 404 outside the conversation (a case outside the scope included)', async () => {
    const { conversations, prisma, service } = setup();
    prisma.message.findUnique.mockResolvedValue({
      conversationId: CONVERSATION,
      createdAt: sentAt,
      id: 'message-6',
      senderId: ME,
      seq: 6,
    });
    conversations.getParticipation.mockRejectedValue(new NotFoundException());
    expect(codeOf(await errorOf(service.readers(actor, 'message-6')))).toBe(
      'MESSAGE_NOT_FOUND',
    );
  });
});
