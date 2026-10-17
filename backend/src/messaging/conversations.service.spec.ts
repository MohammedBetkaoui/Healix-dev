import { randomBytes } from 'node:crypto';

import {
  ForbiddenException,
  type HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ConversationType, ParticipantStatus, Prisma } from '@prisma/client';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { type PatientAuditService } from '../patients/patient-audit.service';
import { type PatientsService } from '../patients/patients.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { type PrismaService } from '../prisma/prisma.service';
import { type WorkspaceContextService } from '../workspaces/workspace-context.service';
import { caseScopeWhere } from './conversation-access';
import {
  type ConversationWithParticipants,
  ConversationsService,
  groupWorkspaceMemberWhere,
} from './conversations.service';
import { MessageCrypto } from './message-crypto';
import { type MessagingEvents } from './messaging-events';
import { decodeCursor } from './messaging-rules';
import {
  type MessagingUsersService,
  peerProfileSelect,
  reachableUserWhere,
} from './messaging-users.service';

const ME = 'user-me';
const OTHER = 'user-other';
const THIRD = 'user-third';
const context = { ipAddress: '203.0.113.7', userAgent: 'jest' };
const actor: AuthenticatedUserPayload = {
  email: 'me@healix.test',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: ME,
  tokenType: 'access',
};

type ParticipantRow = ConversationWithParticipants['participants'][number];

function profile(userId: string) {
  return {
    discoverableByPeers: true,
    doctorProfile: {
      establishment: { name: 'Clinique El Nour' },
      speciality: 'Cardiologie',
      wilaya: 'Alger',
    },
    establishment: null,
    fullName: `Dr ${userId}`,
    id: userId,
    role: UserRole.AFFILIATED_DOCTOR,
    shareReadReceipts: true,
  };
}

function participant(
  userId: string,
  overrides: Partial<ParticipantRow> = {},
): ParticipantRow {
  return {
    conversationId: 'conversation-1',
    id: `participant-${userId}`,
    joinedAt: new Date('2026-10-01T08:00:00Z'),
    lastReadAt: null,
    lastReadSeq: 0,
    leftAt: null,
    mutedUntil: null,
    role: 'MEMBER',
    status: ParticipantStatus.ACTIVE,
    user: profile(userId),
    userId,
    ...overrides,
  };
}

function conversation(
  overrides: Partial<ConversationWithParticipants> = {},
  participants: ParticipantRow[] = [participant(ME), participant(OTHER)],
): ConversationWithParticipants {
  return {
    archivedAt: null,
    createdAt: new Date('2026-10-01T08:00:00Z'),
    createdById: ME,
    directKey: `${ME}:${OTHER}`,
    id: 'conversation-1',
    lastMessageAt: null,
    lastSeq: 0,
    participants,
    patient: null,
    patientId: null,
    title: null,
    type: ConversationType.DIRECT,
    updatedAt: new Date('2026-10-01T08:00:00Z'),
    workspaceId: null,
    ...overrides,
  };
}

function group(participants?: ParticipantRow[]) {
  return conversation(
    {
      directKey: null,
      title: 'Équipe de cardiologie',
      type: ConversationType.GROUP,
      workspaceId: 'workspace-a',
    },
    participants ?? [
      participant(ME, { role: 'OWNER' }),
      participant(OTHER),
      participant(THIRD, { joinedAt: new Date('2026-10-02T08:00:00Z') }),
    ],
  );
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

type CreateArgs = {
  data: {
    directKey?: string;
    participants: { create: unknown[] };
  };
};
type FindManyArgs = { orderBy: unknown; where: { AND: unknown[] } };

// The first argument of a mock's call, typed for the assertions.
function argOf<T = unknown>(mock: jest.Mock, call = 0): T {
  return (mock.mock.calls[call] as [T])[0];
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code: string }).code;

function setup() {
  const prisma = {
    // The lock on a patient's row (case discussions).
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    conversation: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    conversationParticipant: {
      update: jest.fn(),
      upsert: jest.fn(),
    },
    message: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      count: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({
        discoverableByPeers: true,
        id: OTHER,
      }),
    },
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof prisma) => unknown) => callback(prisma),
  );
  const users = {
    blockRelation: jest
      .fn()
      .mockResolvedValue({ blockedByMe: false, blockedMe: false }),
    shareWorkspace: jest.fn().mockResolvedValue(false),
  };
  const workspaceContext = {
    resolveWorkspaceForUser: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace-a' }),
  };
  const auditLogs = { createAuditLog: jest.fn() };
  const crypto = MessageCrypto.fromEnv(
    `k1:${randomBytes(32).toString('base64')}`,
  );
  const events = {
    conversationUpdated: jest.fn().mockResolvedValue(undefined),
    conversationUpdatedFor: jest.fn(),
    messageCreated: jest.fn().mockResolvedValue(undefined),
    messageDeleted: jest.fn().mockResolvedValue(undefined),
    messageUpdated: jest.fn().mockResolvedValue(undefined),
    readUpdated: jest.fn().mockResolvedValue(undefined),
    typing: jest.fn().mockResolvedValue(true),
  };
  const patients = {
    getPatientInScope: jest.fn(),
    getPatientScope: jest
      .fn()
      .mockResolvedValue({ where: {}, workspaceId: 'workspace-a' }),
  };
  const patientAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ConversationsService(
    prisma as unknown as PrismaService,
    users as unknown as MessagingUsersService,
    workspaceContext as unknown as WorkspaceContextService,
    auditLogs as unknown as AuditLogsService,
    crypto,
    events as unknown as MessagingEvents,
    patients as unknown as PatientsService,
    patientAudit as unknown as PatientAuditService,
  );
  return {
    auditLogs,
    crypto,
    events,
    patientAudit,
    patients,
    prisma,
    service,
    users,
    workspaceContext,
  };
}

describe('ConversationsService', () => {
  describe('DIRECT creation', () => {
    const direct = { participantId: OTHER, type: ConversationType.DIRECT };

    it('refuses a conversation with oneself', async () => {
      const { service } = setup();
      const error = await errorOf(
        service.create(actor, { ...direct, participantId: ME }, context),
      );
      expect(codeOf(error)).toBe('CANNOT_MESSAGE_SELF');
    });

    it('answers a neutral 404 to a user the recipient blocked, and creates nothing', async () => {
      const { prisma, service, users } = setup();
      users.blockRelation.mockResolvedValue({
        blockedByMe: false,
        blockedMe: true,
      });

      const error = await errorOf(service.create(actor, direct, context));

      expect(error.getStatus()).toBe(404);
      expect(codeOf(error)).toBe('RECIPIENT_NOT_FOUND');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('asks the blocker to unblock first', async () => {
      const { service, users } = setup();
      users.blockRelation.mockResolvedValue({
        blockedByMe: true,
        blockedMe: false,
      });
      const error = await errorOf(service.create(actor, direct, context));
      expect(codeOf(error)).toBe('CONTACT_BLOCKED');
    });

    it('only reaches a verified, usable professional (404 otherwise)', async () => {
      const { prisma, service } = setup();
      prisma.user.findFirst.mockResolvedValue(null);

      const error = await errorOf(service.create(actor, direct, context));

      expect(codeOf(error)).toBe('RECIPIENT_NOT_FOUND');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ id: OTHER }, reachableUserWhere] },
        }),
      );
      expect(reachableUserWhere).toEqual({
        accountStatus: { notIn: ['SUSPENDED', 'REJECTED'] },
        OR: [
          {
            establishment: { verificationStatus: 'VERIFIED' },
            role: 'ESTABLISHMENT_ADMIN',
          },
          {
            doctorProfile: { verificationStatus: 'VERIFIED' },
            role: { in: ['INDEPENDENT_DOCTOR', 'AFFILIATED_DOCTOR'] },
          },
        ],
      });
    });

    it('refuses a professional of another workspace who is not discoverable', async () => {
      const { prisma, service } = setup();
      prisma.user.findFirst.mockResolvedValue({
        discoverableByPeers: false,
        id: OTHER,
      });
      const error = await errorOf(service.create(actor, direct, context));
      expect(codeOf(error)).toBe('RECIPIENT_NOT_FOUND');
    });

    it('opens it at once within a workspace, even with a colleague who is not discoverable', async () => {
      const { prisma, service, users } = setup();
      users.shareWorkspace.mockResolvedValue(true);
      prisma.user.findFirst.mockResolvedValue({
        discoverableByPeers: false,
        id: OTHER,
      });
      prisma.conversation.create.mockResolvedValue(conversation());

      const { created } = await service.create(actor, direct, context);

      expect(created).toBe(true);
      const { data } = argOf<CreateArgs>(prisma.conversation.create);
      expect(data.participants.create[1]).toMatchObject({
        status: ParticipantStatus.ACTIVE,
        userId: OTHER,
      });
    });

    it('sends a request (PENDING) to a professional of another workspace, keyed by the sorted pair', async () => {
      const { auditLogs, prisma, service } = setup();
      prisma.user.findFirst.mockResolvedValue({
        discoverableByPeers: true,
        id: 'user-abe',
      });
      prisma.conversation.create.mockResolvedValue(
        conversation({}, [participant('user-zed'), participant('user-abe')]),
      );

      await service.create(
        { ...actor, sub: 'user-zed' },
        { ...direct, participantId: 'user-abe' },
        context,
      );

      const { data } = argOf<CreateArgs>(prisma.conversation.create);
      expect(data.directKey).toBe('user-abe:user-zed');
      expect(data.participants.create).toEqual([
        { role: 'MEMBER', status: 'ACTIVE', userId: 'user-zed' },
        { role: 'MEMBER', status: 'PENDING', userId: 'user-abe' },
      ]);
      expect(auditLogs.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONVERSATION_CREATED',
          metadata: {
            participantIds: ['user-abe'],
            request: true,
            type: 'DIRECT',
          },
        }),
        prisma,
      );
    });

    it('returns the existing conversation of the pair instead of a second one', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findUnique.mockResolvedValue(conversation());

      const { conversation: view, created } = await service.create(
        actor,
        direct,
        context,
      );

      expect(created).toBe(false);
      expect(view.id).toBe('conversation-1');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('counts opening an unanswered request as accepting it', async () => {
      const { prisma, service } = setup();
      const request = conversation({}, [
        participant(ME, { status: ParticipantStatus.PENDING }),
        participant(OTHER),
      ]);
      prisma.conversation.findUnique.mockResolvedValue(request);
      prisma.conversation.findFirst.mockResolvedValue(
        conversation({}, [participant(ME), participant(OTHER)]),
      );

      await service.create(actor, direct, context);

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        data: { leftAt: null, status: ParticipantStatus.ACTIVE },
        where: { id: `participant-${ME}` },
      });
    });

    it('returns the other side when both open it at the same time', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(conversation({ id: 'conversation-won' }));
      prisma.conversation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          clientVersion: 'test',
          code: 'P2002',
        }),
      );

      const { conversation: view, created } = await service.create(
        actor,
        direct,
        context,
      );

      expect(created).toBe(false);
      expect(view.id).toBe('conversation-won');
    });
  });

  it.each([ConversationType.REFERRAL, ConversationType.SUPPORT])(
    'refuses %s conversations (later lots)',
    async (type) => {
      const { prisma, service } = setup();
      const error = await errorOf(service.create(actor, { type }, context));
      expect(error.getStatus()).toBe(400);
      expect(codeOf(error)).toBe('CONVERSATION_TYPE_NOT_AVAILABLE');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    },
  );

  describe('GROUP creation', () => {
    const groupDto = (title: string, participantIds = [OTHER, THIRD]) => ({
      participantIds,
      title,
      type: ConversationType.GROUP,
    });

    it.each([
      ['empty', '   '],
      ['longer than 120 characters', 'x'.repeat(121)],
    ])('requires a title (%s refused)', async (_case, title) => {
      const { service } = setup();
      const error = await errorOf(
        service.create(actor, groupDto(title), context),
      );
      expect(codeOf(error)).toBe('INVALID_TITLE');
    });

    it('refuses members outside the creator workspace', async () => {
      const { prisma, service } = setup();
      prisma.user.count.mockResolvedValue(1);

      const error = await errorOf(
        service.create(actor, groupDto('Équipe'), context),
      );

      expect(codeOf(error)).toBe('INVALID_GROUP_MEMBERS');
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: { in: [OTHER, THIRD] } },
            reachableUserWhere,
            {
              workspaceMemberships: {
                some: { status: 'ACTIVE', workspaceId: 'workspace-a' },
              },
            },
          ],
        },
      });
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('creates it in the creator workspace, creator OWNER, with a sanitized title', async () => {
      const { auditLogs, prisma, service } = setup();
      prisma.user.count.mockResolvedValue(2);
      prisma.conversation.create.mockResolvedValue(group());

      await service.create(
        actor,
        groupDto('  Équipe   de garde  ', [OTHER, THIRD, ME]),
        context,
      );

      const { data } = argOf<CreateArgs>(prisma.conversation.create);
      expect(data).toMatchObject({
        title: 'Équipe de garde',
        type: 'GROUP',
        workspaceId: 'workspace-a',
      });
      expect(data.participants.create).toEqual([
        { role: 'OWNER', status: 'ACTIVE', userId: ME },
        { role: 'MEMBER', status: 'ACTIVE', userId: OTHER },
        { role: 'MEMBER', status: 'ACTIVE', userId: THIRD },
      ]);
      expect(auditLogs.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONVERSATION_CREATED',
          ipAddress: '203.0.113.7',
          userId: ME,
        }),
        prisma,
      );
    });
  });

  describe('access', () => {
    it.each([
      ['a non-participant', [participant(OTHER), participant(THIRD)]],
      [
        'a participant who left',
        [
          participant(ME, { status: ParticipantStatus.LEFT }),
          participant(OTHER),
        ],
      ],
      [
        'a participant who blocked the request',
        [
          participant(ME, { status: ParticipantStatus.BLOCKED }),
          participant(OTHER),
        ],
      ],
    ])('answers 404 to %s', async (_case, participants) => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(
        conversation({}, participants),
      );
      const error = await errorOf(service.getOne(actor, 'conversation-1'));
      expect(error.getStatus()).toBe(404);
      expect(codeOf(error)).toBe('CONVERSATION_NOT_FOUND');
    });

    it('lets a PENDING recipient read it, but not change it', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(
        conversation({}, [
          participant(ME, { status: ParticipantStatus.PENDING }),
          participant(OTHER),
        ]),
      );

      await expect(
        service.getOne(actor, 'conversation-1'),
      ).resolves.toMatchObject({ me: { status: 'PENDING' } });
      const error = await errorOf(
        service.update(actor, 'conversation-1', { archived: true }),
      );
      expect(error.getStatus()).toBe(404);
    });

    it('never opens the conversation types of later lots, nor a group outside its workspace', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(null);
      const error = await errorOf(service.getOne(actor, 'conversation-1'));
      expect(error.getStatus()).toBe(404);
      expect(
        argOf<{ where: unknown }>(prisma.conversation.findFirst).where,
      ).toEqual({
        AND: [
          {
            id: 'conversation-1',
            type: { in: ['DIRECT', 'GROUP', 'CASE'] },
          },
          {
            OR: [
              { type: { not: 'GROUP' } },
              {
                workspace: {
                  memberships: { some: { status: 'ACTIVE', userId: ME } },
                },
              },
            ],
          },
        ],
      });
    });
  });

  describe('views', () => {
    it('lists the newest first, with the decrypted preview, unread count and participants, never an e-mail or phone', async () => {
      const { crypto, prisma, service } = setup();
      const text = `Bonjour, pouvez-vous relire l'IRM de ce matin ? ${'détail '.repeat(30)}`;
      const encrypted = crypto.encrypt(text, 'conversation-1');
      const row = conversation({ lastMessageAt: new Date(), lastSeq: 7 }, [
        participant(ME, { lastReadSeq: 4 }),
        participant(OTHER, {
          user: {
            ...profile(OTHER),
            email: 'secret@healix.test',
            phone: '0550 00 00 00',
          } as unknown as ParticipantRow['user'],
        }),
      ]);
      prisma.conversation.findMany.mockResolvedValue([row]);
      prisma.message.findMany.mockResolvedValue([
        {
          bodyCiphertext: encrypted.ciphertext,
          conversationId: 'conversation-1',
          createdAt: new Date(),
          deletedAt: null,
          id: 'message-7',
          keyId: encrypted.keyId,
          kind: 'TEXT',
          senderId: OTHER,
          seq: 7,
        },
      ]);

      const page = await service.list(actor, {});
      const [item] = page.items;

      expect(argOf<FindManyArgs>(prisma.conversation.findMany).orderBy).toEqual(
        [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      );
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { OR: [{ conversationId: 'conversation-1', seq: 7 }] },
      });
      expect(item.unreadCount).toBe(3);
      expect(Array.from(item.lastMessage?.preview ?? '')).toHaveLength(120);
      expect(
        item.lastMessage?.preview?.startsWith('Bonjour, pouvez-vous'),
      ).toBe(true);
      expect(item.lastMessage?.preview?.endsWith('…')).toBe(true);
      expect(item.participants[1]).toEqual({
        establishmentName: 'Clinique El Nour',
        fullName: `Dr ${OTHER}`,
        joinedAt: new Date('2026-10-01T08:00:00Z'),
        lastReadAt: null,
        lastReadSeq: 0,
        role: 'MEMBER',
        speciality: 'Cardiologie',
        status: 'ACTIVE',
        userId: OTHER,
      });
      expect(JSON.stringify(page)).not.toMatch(/secret@healix|0550/);
      expect(Object.keys(peerProfileSelect)).not.toContain('email');
      expect(Object.keys(peerProfileSelect)).not.toContain('phone');
      expect(page.nextCursor).toBeNull();
    });

    it('shows a deleted last message without its text', async () => {
      const { crypto, prisma, service } = setup();
      const encrypted = crypto.encrypt('Texte supprimé', 'conversation-1');
      prisma.conversation.findMany.mockResolvedValue([
        conversation({ lastSeq: 1 }),
      ]);
      prisma.message.findMany.mockResolvedValue([
        {
          bodyCiphertext: encrypted.ciphertext,
          conversationId: 'conversation-1',
          createdAt: new Date(),
          deletedAt: new Date(),
          id: 'message-1',
          keyId: encrypted.keyId,
          kind: 'TEXT',
          senderId: OTHER,
          seq: 1,
        },
      ]);

      const [item] = (await service.list(actor, {})).items;

      expect(item.lastMessage).toMatchObject({ deleted: true, preview: null });
    });

    it('pages with a cursor on (lastMessageAt, id) and filters by status', async () => {
      const { prisma, service } = setup();
      const at = new Date('2026-10-10T10:00:00Z');
      prisma.conversation.findMany.mockResolvedValue([
        conversation({ id: 'c3', lastMessageAt: at }),
        conversation({ id: 'c2', lastMessageAt: at }),
        conversation({ id: 'c1', lastMessageAt: null }),
      ]);

      const page = await service.list(actor, { limit: 2, status: 'pending' });

      expect(page.items.map(({ id }) => id)).toEqual(['c3', 'c2']);
      expect(decodeCursor(page.nextCursor ?? '')).toEqual({
        id: 'c2',
        lastMessageAt: at,
      });
      const { where } = argOf<FindManyArgs>(prisma.conversation.findMany);
      expect(where.AND[1]).toEqual({
        participants: { some: { status: 'PENDING', userId: ME } },
      });

      await service.list(actor, { cursor: page.nextCursor ?? '' });
      const next = argOf<FindManyArgs>(prisma.conversation.findMany, 1).where;
      expect(next.AND[1]).toEqual({
        archivedAt: null,
        participants: { some: { status: 'ACTIVE', userId: ME } },
      });
      expect(next.AND[2]).toEqual(groupWorkspaceMemberWhere(ME));
      expect(next.AND[3]).toEqual({
        OR: [
          { lastMessageAt: { lt: at } },
          { id: { lt: 'c2' }, lastMessageAt: at },
          { lastMessageAt: null },
        ],
      });
    });
  });

  describe('PATCH', () => {
    it('renames a group for its OWNER only', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(
        group([participant(ME), participant(OTHER, { role: 'OWNER' })]),
      );
      const error = await errorOf(
        service.update(actor, 'conversation-1', { title: 'Nouveau nom' }),
      );
      expect(codeOf(error)).toBe('OWNER_ONLY');
    });

    it('gives no title to a DIRECT conversation', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(conversation());
      const error = await errorOf(
        service.update(actor, 'conversation-1', { title: 'Nom' }),
      );
      expect(codeOf(error)).toBe('GROUP_ONLY');
    });

    it('mutes for the caller only, archives the conversation, refuses an empty PATCH', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(conversation());
      const until = new Date(Date.now() + 3_600_000).toISOString();

      await service.update(actor, 'conversation-1', {
        archived: true,
        mutedUntil: until,
      });

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        data: { mutedUntil: new Date(until) },
        where: { id: `participant-${ME}` },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        data: { archivedAt: expect.any(Date) as Date },
        where: { id: 'conversation-1' },
      });
      const error = await errorOf(service.update(actor, 'conversation-1', {}));
      expect(codeOf(error)).toBe('NOTHING_TO_UPDATE');
    });

    it("lets only a group's OWNER archive it", async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(
        group([participant(ME), participant(OTHER, { role: 'OWNER' })]),
      );
      const error = await errorOf(
        service.update(actor, 'conversation-1', { archived: true }),
      );
      expect(codeOf(error)).toBe('OWNER_ONLY');
    });
  });

  describe('group members', () => {
    it('are added by the OWNER only, from the group workspace, and audited one by one', async () => {
      const { auditLogs, prisma, service } = setup();
      const row = group([
        participant(ME, { role: 'OWNER' }),
        participant(OTHER, { status: ParticipantStatus.LEFT }),
      ]);
      prisma.conversation.findFirst.mockResolvedValue({ ...row, lastSeq: 12 });
      prisma.user.count.mockResolvedValue(2);

      await service.addParticipants(
        actor,
        'conversation-1',
        [OTHER, THIRD],
        context,
      );

      expect(prisma.conversationParticipant.upsert).toHaveBeenCalledTimes(2);
      expect(
        argOf<{ update: unknown }>(prisma.conversationParticipant.upsert)
          .update,
      ).toMatchObject({ lastReadSeq: 12, leftAt: null, status: 'ACTIVE' });
      expect(auditLogs.createAuditLog).toHaveBeenCalledTimes(2);
      expect(argOf(auditLogs.createAuditLog, 1)).toMatchObject({
        action: 'CONVERSATION_MEMBER_ADDED',
        metadata: { memberId: THIRD },
      });
    });

    it('cannot be added by a plain member, nor to a DIRECT conversation', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValueOnce(
        group([participant(ME)]),
      );
      expect(
        codeOf(
          await errorOf(
            service.addParticipants(actor, 'conversation-1', [THIRD], context),
          ),
        ),
      ).toBe('OWNER_ONLY');

      prisma.conversation.findFirst.mockResolvedValueOnce(conversation());
      expect(
        codeOf(
          await errorOf(
            service.addParticipants(actor, 'conversation-1', [THIRD], context),
          ),
        ),
      ).toBe('GROUP_ONLY');
    });

    it('are removed by the OWNER only', async () => {
      const { auditLogs, prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(group());

      await service.removeParticipant(actor, 'conversation-1', OTHER, context);

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        data: {
          leftAt: expect.any(Date) as Date,
          role: 'MEMBER',
          status: 'LEFT',
        },
        where: { id: `participant-${OTHER}` },
      });
      expect(argOf(auditLogs.createAuditLog)).toMatchObject({
        action: 'CONVERSATION_MEMBER_REMOVED',
        metadata: { memberId: OTHER },
      });

      prisma.conversation.findFirst.mockResolvedValue(
        group([participant(ME), participant(OTHER, { role: 'OWNER' })]),
      );
      const error = await errorOf(
        service.removeParticipant(actor, 'conversation-1', OTHER, context),
      );
      expect(codeOf(error)).toBe('OWNER_ONLY');
    });

    it('can leave; a leaving OWNER hands the group to the longest-standing member', async () => {
      const { auditLogs, prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(group());

      const result = await service.removeParticipant(
        actor,
        'conversation-1',
        ME,
        context,
      );

      expect(result).toEqual({ id: 'conversation-1', status: 'LEFT' });
      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        data: { role: 'OWNER' },
        where: { id: `participant-${OTHER}` },
      });
      expect(argOf(auditLogs.createAuditLog)).toMatchObject({
        action: 'CONVERSATION_LEFT',
        metadata: { newOwnerId: OTHER },
      });
    });
  });

  describe('contact requests', () => {
    const pending = () =>
      conversation({}, [
        participant(ME, { status: ParticipantStatus.PENDING }),
        participant(OTHER),
      ]);

    it('accept makes the recipient ACTIVE', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(pending());
      await service.accept(actor, 'conversation-1');
      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        data: { status: 'ACTIVE' },
        where: { id: `participant-${ME}` },
      });
    });

    it('decline makes the recipient LEFT', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(pending());
      await expect(service.decline(actor, 'conversation-1')).resolves.toEqual({
        id: 'conversation-1',
        status: 'LEFT',
      });
      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        data: { leftAt: expect.any(Date) as Date, status: 'LEFT' },
        where: { id: `participant-${ME}` },
      });
    });

    it('answers 409 when there is no request to answer', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(conversation());
      const error = await errorOf(service.accept(actor, 'conversation-1'));
      expect(codeOf(error)).toBe('CONVERSATION_NOT_PENDING');
    });
  });

  describe('real-time events', () => {
    it('announce a new conversation after its transaction, not an existing one', async () => {
      const { events, prisma, service } = setup();
      prisma.conversation.create.mockResolvedValue(conversation());

      await service.create(
        actor,
        { participantId: OTHER, type: ConversationType.DIRECT },
        context,
      );
      expect(events.conversationUpdated).toHaveBeenCalledWith('conversation-1');
      expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
        events.conversationUpdated.mock.invocationCallOrder[0],
      );

      events.conversationUpdated.mockClear();
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      await service.create(
        actor,
        { participantId: OTHER, type: ConversationType.DIRECT },
        context,
      );
      expect(events.conversationUpdated).not.toHaveBeenCalled();
    });

    it('tell everyone about a title or an archive, only the caller about muting', async () => {
      const { events, prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(conversation());

      await service.update(actor, 'conversation-1', { archived: true });
      expect(events.conversationUpdated).toHaveBeenCalledWith('conversation-1');

      await service.update(actor, 'conversation-1', { mutedUntil: null });
      expect(events.conversationUpdatedFor).toHaveBeenCalledWith(
        [ME],
        'conversation-1',
      );
      expect(events.conversationUpdated).toHaveBeenCalledTimes(1);
    });

    it('tell the members and the one who left or was removed', async () => {
      const { events, prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(group());

      await service.removeParticipant(actor, 'conversation-1', OTHER, context);

      expect(events.conversationUpdated).toHaveBeenCalledWith(
        'conversation-1',
        { also: [OTHER] },
      );
    });

    it('tell both sides when a request is accepted or declined', async () => {
      const { events, prisma, service } = setup();
      const pending = conversation({}, [
        participant(ME, { status: ParticipantStatus.PENDING }),
        participant(OTHER),
      ]);
      prisma.conversation.findFirst.mockResolvedValue(pending);

      await service.decline(actor, 'conversation-1');
      expect(events.conversationUpdated).toHaveBeenCalledWith(
        'conversation-1',
        { also: [ME] },
      );

      await service.accept(actor, 'conversation-1');
      expect(events.conversationUpdated).toHaveBeenLastCalledWith(
        'conversation-1',
      );
    });
  });

  describe('CASE discussions', () => {
    const PATIENT = {
      birthDate: new Date('1980-05-01T00:00:00Z'),
      firstName: 'Amina',
      firstNameAr: 'أمينة',
      id: 'patient-1',
      lastName: 'Benali',
      lastNameAr: 'بن علي',
      workspaceId: 'workspace-a',
    };
    const caseDto = (participantIds?: string[]) => ({
      participantIds,
      patientId: 'patient-1',
      type: ConversationType.CASE,
    });

    function caseConversation(
      participants: ParticipantRow[] = [
        participant(ME, { role: 'OWNER' }),
        participant(OTHER),
      ],
      overrides: Partial<ConversationWithParticipants> = {},
    ) {
      return conversation(
        {
          directKey: null,
          patient: {
            birthDate: PATIENT.birthDate,
            firstName: PATIENT.firstName,
            firstNameAr: PATIENT.firstNameAr,
            id: PATIENT.id,
            lastName: PATIENT.lastName,
            lastNameAr: PATIENT.lastNameAr,
          },
          patientId: 'patient-1',
          title: 'Cas — BENALI Amina',
          type: ConversationType.CASE,
          workspaceId: 'workspace-a',
          ...overrides,
        },
        participants,
      );
    }

    it('answers PATIENT_NOT_FOUND for a patient outside the caller scope', async () => {
      const { patients, prisma, service } = setup();
      patients.getPatientInScope.mockRejectedValue(
        new NotFoundException('Patient introuvable.'),
      );

      const error = await errorOf(service.create(actor, caseDto(), context));

      expect(error.getStatus()).toBe(404);
      expect(codeOf(error)).toBe('PATIENT_NOT_FOUND');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('creates the patient discussion in its workspace, titled after the patient, traced in the patient audit', async () => {
      const { patientAudit, patients, prisma, service } = setup();
      patients.getPatientInScope.mockResolvedValue(PATIENT);
      prisma.user.count.mockResolvedValue(1);
      prisma.conversation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValue(caseConversation());
      prisma.conversation.create.mockResolvedValue({ id: 'conversation-1' });

      const { conversation: view, created } = await service.create(
        actor,
        caseDto([OTHER]),
        context,
      );

      expect(created).toBe(true);
      // The patient's row is locked before looking for an open discussion.
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(argOf<CreateArgs>(prisma.conversation.create).data).toMatchObject({
        participants: {
          create: [
            { role: 'OWNER', status: 'ACTIVE', userId: ME },
            { role: 'MEMBER', status: 'ACTIVE', userId: OTHER },
          ],
        },
        patientId: 'patient-1',
        title: 'Cas — BENALI Amina',
        type: 'CASE',
        workspaceId: 'workspace-a',
      });
      expect(patientAudit.log).toHaveBeenCalledWith(
        actor,
        'CASE_CONVERSATION_CREATED',
        'conversation-1',
        { participantIds: [OTHER], patientId: 'patient-1' },
      );
      expect(view.patient).toMatchObject({
        id: 'patient-1',
        lastNameAr: 'بن علي',
      });
    });

    it('reopens the open discussion of the patient rather than a second one, adding the caller', async () => {
      const { patientAudit, patients, prisma, service } = setup();
      patients.getPatientInScope.mockResolvedValue(PATIENT);
      prisma.conversation.findFirst
        .mockResolvedValueOnce(
          caseConversation([participant(OTHER, { role: 'OWNER' })]),
        )
        .mockResolvedValue(caseConversation());

      const { created } = await service.create(actor, caseDto(), context);

      expect(created).toBe(false);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(prisma.conversationParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: 'ACTIVE',
            userId: ME,
          }) as unknown,
        }),
      );
      expect(patientAudit.log).not.toHaveBeenCalled();
    });

    it('refuses colleagues outside the patient workspace', async () => {
      const { patients, prisma, service } = setup();
      patients.getPatientInScope.mockResolvedValue(PATIENT);
      prisma.user.count.mockResolvedValue(0);

      const error = await errorOf(
        service.create(actor, caseDto([THIRD]), context),
      );

      expect(codeOf(error)).toBe('INVALID_CASE_MEMBERS');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('is closed, in reading as in writing, to a participant who no longer has its patient in scope', async () => {
      const { patients, prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(caseConversation());

      patients.getPatientInScope.mockResolvedValue(PATIENT);
      await expect(
        service.getOne(actor, 'conversation-1'),
      ).resolves.toMatchObject({ id: 'conversation-1' });

      patients.getPatientInScope.mockRejectedValue(
        new NotFoundException('Patient introuvable.'),
      );
      const error = await errorOf(service.getOne(actor, 'conversation-1'));
      expect(codeOf(error)).toBe('CONVERSATION_NOT_FOUND');
      const writing = await errorOf(
        service.update(actor, 'conversation-1', { archived: true }),
      );
      expect(codeOf(writing)).toBe('CONVERSATION_NOT_FOUND');
    });

    it('lists the case discussions of the caller scope only, none without a workspace', async () => {
      const { patients, prisma, service } = setup();
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.list(actor, {});
      expect(
        argOf<FindManyArgs>(prisma.conversation.findMany).where.AND[4],
      ).toEqual(caseScopeWhere('workspace-a'));

      patients.getPatientScope.mockRejectedValue(new ForbiddenException());
      await service.list(actor, {});
      expect(
        argOf<FindManyArgs>(prisma.conversation.findMany, 1).where.AND[4],
      ).toEqual({ OR: [{ type: { not: 'CASE' } }] });
    });

    it('keeps one open discussion per patient: an archived one does not come back over another', async () => {
      const { patients, prisma, service } = setup();
      patients.getPatientInScope.mockResolvedValue(PATIENT);
      prisma.conversation.findFirst.mockResolvedValue(
        caseConversation(undefined, { archivedAt: new Date() }),
      );
      prisma.conversation.count.mockResolvedValue(1);

      const error = await errorOf(
        service.update(actor, 'conversation-1', { archived: false }),
      );

      expect(codeOf(error)).toBe('CASE_ALREADY_OPEN');
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });
  });
});

describe('ConversationsService read positions in the view', () => {
  const readAt = new Date('2026-10-17T14:32:00Z');
  const withReader = (
    meShares: boolean,
    otherShares: boolean,
  ): ConversationWithParticipants =>
    conversation({ lastSeq: 9 }, [
      participant(ME, {
        lastReadAt: readAt,
        lastReadSeq: 9,
        user: { ...profile(ME), shareReadReceipts: meShares },
      }),
      participant(OTHER, {
        lastReadAt: readAt,
        lastReadSeq: 7,
        user: { ...profile(OTHER), shareReadReceipts: otherShares },
      }),
    ]);

  it('gives each ACTIVE participant how far they read, and when', async () => {
    const { prisma, service } = setup();
    prisma.conversation.findFirst.mockResolvedValue(withReader(true, true));

    const view = await service.getOne(actor, 'conversation-1');

    expect(view.participants.find((p) => p.userId === OTHER)).toMatchObject({
      lastReadAt: readAt,
      lastReadSeq: 7,
    });
    expect(view.me).toMatchObject({ lastReadAt: readAt, lastReadSeq: 9 });
  });

  it('hides them both ways when either side does not share read receipts', async () => {
    const { prisma, service } = setup();

    prisma.conversation.findFirst.mockResolvedValue(withReader(true, false));
    const hiddenByOther = await service.getOne(actor, 'conversation-1');
    expect(
      hiddenByOther.participants.find((p) => p.userId === OTHER),
    ).toMatchObject({ lastReadAt: null, lastReadSeq: null });

    prisma.conversation.findFirst.mockResolvedValue(withReader(false, true));
    const hiddenByMe = await service.getOne(actor, 'conversation-1');
    expect(
      hiddenByMe.participants.find((p) => p.userId === OTHER),
    ).toMatchObject({ lastReadAt: null, lastReadSeq: null });
    // One's own position stays shown, and the unread count does not change.
    expect(hiddenByMe.participants.find((p) => p.userId === ME)).toMatchObject({
      lastReadSeq: 9,
    });
    expect(hiddenByMe.unreadCount).toBe(0);
  });
});
