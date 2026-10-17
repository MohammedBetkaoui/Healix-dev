import { randomBytes, randomUUID } from 'node:crypto';

import { type HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';
import { DirectoryService } from './directory.service';
import { MessagesService } from './messages.service';
import { MessagingModule } from './messaging.module';

// Runs the messaging against a migrated test database: TEST_DATABASE_URL,
// whose name must end in "_test" (as the dashboard's). Skipped without it.
// Each run creates its own users and workspaces, then removes them.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.slice(1)
  : '';
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };

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

describeWithDatabase('messaging against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let conversations: ConversationsService;
  let messages: MessagesService;
  let directory: DirectoryService;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created = { users: [] as string[], workspaces: [] as string[] };
  const actors = {} as Record<
    | 'adminA'
    | 'doctorA1'
    | 'doctorA2'
    | 'adminB'
    | 'doctorB1'
    | 'hiddenB'
    | 'independentC'
    | 'unverified',
    AuthenticatedUserPayload
  >;

  let counter = 0;
  async function user(
    key: keyof typeof actors,
    role: string,
    options: { discoverable?: boolean } = {},
  ) {
    counter += 1;
    const row = await prisma.user.create({
      data: {
        accountStatus: 'ACTIVE',
        discoverableByPeers: options.discoverable ?? true,
        email: `msg-${suffix}-${counter}@healix.test`,
        fullName: `Messagerie ${suffix} ${counter}`,
        passwordHash: 'not-a-real-hash',
        phone: `msg-${suffix}-${counter}`,
        role: role as never,
      },
    });
    created.users.push(row.id);
    actors[key] = {
      email: row.email,
      role: role as AuthenticatedUserPayload['role'],
      sub: row.id,
      tokenType: 'access',
    };
    return row;
  }

  async function establishmentWorkspace(ownerId: string, name: string) {
    const establishment = await prisma.establishment.create({
      data: {
        address: 'Alger',
        managerFullName: 'Direction',
        name: `${name} ${suffix}`,
        ownerId,
        phone: '0550000000',
        professionalEmail: `clinic-${suffix}-${ownerId}@healix.test`,
        subscriptionStatus: 'NO_PLAN',
        type: 'CLINIC',
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        establishmentId: establishment.id,
        name: establishment.name,
        type: 'ESTABLISHMENT',
      },
    });
    created.workspaces.push(workspace.id);
    await prisma.workspaceMembership.create({
      data: { role: 'OWNER', userId: ownerId, workspaceId: workspace.id },
    });
    return { establishment, workspace };
  }

  async function affiliatedDoctor(
    key: keyof typeof actors,
    establishmentId: string,
    workspaceId: string,
    options: { discoverable?: boolean } = {},
  ) {
    const row = await user(key, 'AFFILIATED_DOCTOR', options);
    await prisma.doctorProfile.create({
      data: {
        establishmentId,
        isIndependent: false,
        professionalAddress: 'Alger',
        speciality: 'Cardiologie',
        subscriptionStatus: 'NO_PLAN',
        userId: row.id,
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
    await prisma.workspaceMembership.create({
      data: { role: 'DOCTOR', userId: row.id, workspaceId },
    });
    return row;
  }

  beforeAll(async () => {
    if (!databaseName.endsWith('_test')) {
      throw new Error(
        `TEST_DATABASE_URL must name a database ending in "_test", not "${databaseName}".`,
      );
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.MESSAGING_KEYS = `k1:${randomBytes(32).toString('base64')}`;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        MessagingModule,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    conversations = moduleRef.get(ConversationsService);
    messages = moduleRef.get(MessagesService);
    directory = moduleRef.get(DirectoryService);

    // Workspace A: an establishment and two affiliated doctors.
    const adminA = await user('adminA', 'ESTABLISHMENT_ADMIN');
    const a = await establishmentWorkspace(adminA.id, 'Clinique A');
    await affiliatedDoctor('doctorA1', a.establishment.id, a.workspace.id);
    await affiliatedDoctor('doctorA2', a.establishment.id, a.workspace.id);

    // Workspace B: another establishment, one listed doctor, one not.
    const adminB = await user('adminB', 'ESTABLISHMENT_ADMIN');
    const b = await establishmentWorkspace(adminB.id, 'Clinique B');
    await affiliatedDoctor('doctorB1', b.establishment.id, b.workspace.id);
    await affiliatedDoctor('hiddenB', b.establishment.id, b.workspace.id, {
      discoverable: false,
    });

    // Workspace C: an independent doctor.
    const independent = await user('independentC', 'INDEPENDENT_DOCTOR');
    const profile = await prisma.doctorProfile.create({
      data: {
        professionalAddress: 'Oran',
        speciality: 'Neurologie',
        subscriptionStatus: 'NO_PLAN',
        userId: independent.id,
        verificationStatus: 'VERIFIED',
        wilaya: 'Oran',
      },
    });
    const workspaceC = await prisma.workspace.create({
      data: {
        name: 'Cabinet C',
        ownerDoctorProfileId: profile.id,
        type: 'PRIVATE_PRACTICE',
      },
    });
    created.workspaces.push(workspaceC.id);
    await prisma.workspaceMembership.create({
      data: {
        role: 'OWNER',
        userId: independent.id,
        workspaceId: workspaceC.id,
      },
    });

    // A doctor whose verification is still pending.
    const unverified = await user('unverified', 'INDEPENDENT_DOCTOR');
    await prisma.doctorProfile.create({
      data: {
        professionalAddress: 'Oran',
        speciality: 'Neurologie',
        subscriptionStatus: 'NO_PLAN',
        userId: unverified.id,
        verificationStatus: 'PENDING_VERIFICATION',
        wilaya: 'Oran',
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      // Conversations first (their participants and messages go with them):
      // a conversation and a message keep their author.
      await prisma.conversation.deleteMany({
        where: { createdById: { in: created.users } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: created.users } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: created.workspaces } },
      });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    }
    await moduleRef?.close();
  });

  describe('isolation between two workspaces', () => {
    it('builds a group from the creator workspace only', async () => {
      const error = await errorOf(
        conversations.create(
          actors.adminA,
          {
            participantIds: [actors.doctorA1.sub, actors.doctorB1.sub],
            title: 'Équipe mixte',
            type: 'GROUP',
          },
          context,
        ),
      );
      expect(codeOf(error)).toBe('INVALID_GROUP_MEMBERS');

      const { conversation, created: isNew } = await conversations.create(
        actors.adminA,
        {
          participantIds: [actors.doctorA1.sub, actors.doctorA2.sub],
          title: 'Équipe A',
          type: 'GROUP',
        },
        context,
      );
      expect(isNew).toBe(true);
      expect(conversation.participants).toHaveLength(3);

      // Workspace B sees nothing of it, not even its existence.
      const listB = await conversations.list(actors.doctorB1, {});
      expect(listB.items.map(({ id }) => id)).not.toContain(conversation.id);
      const notFound = await errorOf(
        conversations.getOne(actors.doctorB1, conversation.id),
      );
      expect(notFound.getStatus()).toBe(404);

      // The members of A see it.
      const listA = await conversations.list(actors.doctorA2, {});
      expect(listA.items.map(({ id }) => id)).toContain(conversation.id);
    });

    it('opens a DIRECT conversation at once within a workspace', async () => {
      const { conversation } = await conversations.create(
        actors.doctorA1,
        { participantId: actors.doctorA2.sub, type: 'DIRECT' },
        context,
      );
      expect(conversation.participants.map(({ status }) => status)).toEqual([
        'ACTIVE',
        'ACTIVE',
      ]);

      // The same pair, from the other side: the same conversation.
      const again = await conversations.create(
        actors.doctorA2,
        { participantId: actors.doctorA1.sub, type: 'DIRECT' },
        context,
      );
      expect(again).toMatchObject({
        conversation: { id: conversation.id },
        created: false,
      });
    });

    it('turns a DIRECT conversation with another workspace into a request', async () => {
      const { conversation } = await conversations.create(
        actors.doctorA1,
        { participantId: actors.doctorB1.sub, type: 'DIRECT' },
        context,
      );
      const recipient = conversation.participants.find(
        ({ userId }) => userId === actors.doctorB1.sub,
      );
      expect(recipient?.status).toBe('PENDING');

      const pending = await conversations.list(actors.doctorB1, {
        status: 'pending',
      });
      expect(pending.items.map(({ id }) => id)).toContain(conversation.id);
      const active = await conversations.list(actors.doctorB1, {});
      expect(active.items.map(({ id }) => id)).not.toContain(conversation.id);
    });

    it('reaches neither a hidden professional of another workspace nor an unverified one', async () => {
      for (const target of [actors.hiddenB, actors.unverified]) {
        const error = await errorOf(
          conversations.create(
            actors.independentC,
            { participantId: target.sub, type: 'DIRECT' },
            context,
          ),
        );
        expect(codeOf(error)).toBe('RECIPIENT_NOT_FOUND');
      }

      // Hidden from other workspaces, not from colleagues.
      const colleague = await conversations.create(
        actors.doctorB1,
        { participantId: actors.hiddenB.sub, type: 'DIRECT' },
        context,
      );
      expect(colleague.created).toBe(true);
    });
  });

  // A group of workspace A: three senders.
  async function teamA(title: string) {
    const { conversation } = await conversations.create(
      actors.adminA,
      {
        participantIds: [actors.doctorA1.sub, actors.doctorA2.sub],
        title,
        type: 'GROUP',
      },
      context,
    );
    return conversation.id;
  }

  const sendAs = (
    actor: AuthenticatedUserPayload,
    conversationId: string,
    body: string,
    clientMessageId: string = randomUUID(),
  ) => messages.send(actor, conversationId, { body, clientMessageId });

  describe('sequence numbers', () => {
    it('numbers 20 concurrent messages 1 to 20, without gap nor duplicate', async () => {
      const conversationId = await teamA('Concurrence');
      const senders = [actors.adminA, actors.doctorA1, actors.doctorA2];

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          sendAs(senders[index % 3], conversationId, `Message ${index + 1}`),
        ),
      );

      expect(results.every(({ created }) => created)).toBe(true);
      expect(
        results.map(({ message }) => message.seq).sort((a, b) => a - b),
      ).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
      const stored = await prisma.message.findMany({
        orderBy: { seq: 'asc' },
        select: { seq: true },
        where: { conversationId },
      });
      expect(stored.map(({ seq }) => seq)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      expect(conversation.lastSeq).toBe(20);

      // The history reads them back, decrypted, in order.
      const page = await messages.list(actors.doctorA1, conversationId, {
        limit: 5,
      });
      expect(page.items.map(({ seq }) => seq)).toEqual([16, 17, 18, 19, 20]);
      expect(page.hasMore).toBe(true);
      const catchUp = await messages.list(actors.doctorA1, conversationId, {
        afterSeq: 18,
      });
      expect(catchUp.items.map(({ seq }) => seq)).toEqual([19, 20]);
      expect(
        catchUp.items.every(({ body }) => body?.startsWith('Message')),
      ).toBe(true);
    }, 60_000);

    it('stores the text encrypted, never in clear', async () => {
      const conversationId = await teamA('Chiffrement');
      await sendAs(actors.adminA, conversationId, 'Résultat confidentiel');

      const [row] = await prisma.message.findMany({
        where: { conversationId },
      });

      expect(row.keyId).toBe('k1');
      expect(
        Buffer.from(row.bodyCiphertext ?? []).toString('utf8'),
      ).not.toContain('confidentiel');
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      expect(conversation.lastMessageAt?.getTime()).toBe(
        row.createdAt.getTime(),
      );
    });
  });

  describe('clientMessageId', () => {
    it('sends a message once, however often and however fast it is sent again', async () => {
      const conversationId = await teamA('Idempotence');
      const clientMessageId = randomUUID();

      const first = await sendAs(
        actors.doctorA1,
        conversationId,
        'Une seule fois',
        clientMessageId,
      );
      const again = await sendAs(
        actors.doctorA1,
        conversationId,
        'Une seule fois',
        clientMessageId,
      );
      expect(first.created).toBe(true);
      expect(again).toMatchObject({
        created: false,
        message: { id: first.message.id, seq: 1 },
      });

      // Five copies at the same moment: one message, no number lost.
      const burstId = randomUUID();
      const burst = await Promise.all(
        Array.from({ length: 5 }, () =>
          sendAs(actors.doctorA2, conversationId, 'Rafale', burstId),
        ),
      );
      expect(burst.filter(({ created }) => created)).toHaveLength(1);
      expect(new Set(burst.map(({ message }) => message.id)).size).toBe(1);
      const count = await prisma.message.count({ where: { conversationId } });
      expect(count).toBe(2);
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      expect(conversation.lastSeq).toBe(2);
    }, 60_000);
  });

  describe('contact requests', () => {
    it('carry a single message until the recipient accepts', async () => {
      const { conversation } = await conversations.create(
        actors.independentC,
        { participantId: actors.doctorB1.sub, type: 'DIRECT' },
        context,
      );
      await sendAs(actors.independentC, conversation.id, 'Demande d’avis');
      const second = await errorOf(
        sendAs(actors.independentC, conversation.id, 'Relance'),
      );
      expect(codeOf(second)).toBe('CONVERSATION_PENDING');

      // The recipient reads the request, accepts, then both write.
      const request = await messages.list(actors.doctorB1, conversation.id, {});
      expect(request.items.map(({ body }) => body)).toEqual(['Demande d’avis']);
      const early = await errorOf(
        sendAs(actors.doctorB1, conversation.id, 'Réponse'),
      );
      expect(codeOf(early)).toBe('CONVERSATION_PENDING');
      await conversations.accept(actors.doctorB1, conversation.id);
      await sendAs(actors.doctorB1, conversation.id, 'Réponse');
      await sendAs(actors.independentC, conversation.id, 'Merci');
    });
  });

  describe('unread messages', () => {
    it('counts lastSeq - lastReadSeq, never moves back, and leaves muted conversations out of the badge', async () => {
      const conversationId = await teamA('Non-lus');
      const before = await messages.unreadCount(actors.doctorA2);
      for (const index of [1, 2, 3, 4]) {
        await sendAs(actors.doctorA1, conversationId, `Point ${index}`);
      }

      const view = await conversations.getOne(actors.doctorA2, conversationId);
      expect(view.unreadCount).toBe(4);
      // The sender has read their own messages.
      const senderView = await conversations.getOne(
        actors.doctorA1,
        conversationId,
      );
      expect(senderView.unreadCount).toBe(0);
      expect((await messages.unreadCount(actors.doctorA2)).total).toBe(
        before.total + 4,
      );

      await expect(
        messages.markRead(actors.doctorA2, conversationId, 3),
      ).resolves.toEqual({ conversationId, lastReadSeq: 3, unreadCount: 1 });
      // Backwards: ignored. Beyond the last message: stops at it.
      await expect(
        messages.markRead(actors.doctorA2, conversationId, 1),
      ).resolves.toMatchObject({ lastReadSeq: 3 });
      await expect(
        messages.markRead(actors.doctorA2, conversationId, 99),
      ).resolves.toEqual({ conversationId, lastReadSeq: 4, unreadCount: 0 });

      await sendAs(actors.doctorA1, conversationId, 'Encore un');
      expect((await messages.unreadCount(actors.doctorA2)).total).toBe(
        before.total + 1,
      );
      await conversations.update(actors.doctorA2, conversationId, {
        mutedUntil: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect((await messages.unreadCount(actors.doctorA2)).total).toBe(
        before.total,
      );
    });
  });

  describe('directory and blocks', () => {
    const listed = async (viewer: AuthenticatedUserPayload) =>
      new Map(
        (await directory.search(viewer, { search: suffix })).map((entry) => [
          entry.id,
          entry,
        ]),
      );

    it('lists the verified, discoverable professionals, never an e-mail nor a phone', async () => {
      const entries = await listed(actors.doctorA1);

      expect(entries.has(actors.doctorA1.sub)).toBe(false);
      expect(entries.has(actors.hiddenB.sub)).toBe(false);
      expect(entries.has(actors.unverified.sub)).toBe(false);
      expect(entries.get(actors.doctorA2.sub)?.sameWorkspace).toBe(true);
      expect(entries.get(actors.doctorB1.sub)).toMatchObject({
        establishmentName: expect.stringContaining('Clinique B') as string,
        sameWorkspace: false,
        speciality: 'Cardiologie',
      });
      expect(JSON.stringify([...entries.values()])).not.toMatch(
        /@healix\.test|msg-/,
      );
      const byWilaya = await directory.search(actors.doctorA1, {
        search: suffix,
        wilaya: 'Oran',
      });
      expect(byWilaya.map(({ id }) => id)).toEqual([actors.independentC.sub]);
    });

    it('stops a blocked user from writing or opening a conversation, with a neutral 404', async () => {
      // independentC and doctorB1 talk since the request was accepted.
      const { conversation } = await conversations.create(
        actors.independentC,
        { participantId: actors.doctorB1.sub, type: 'DIRECT' },
        context,
      );
      await directory.block(actors.doctorB1, actors.independentC.sub, context);

      const send = await errorOf(
        sendAs(actors.independentC, conversation.id, 'Encore moi'),
      );
      expect(send.getStatus()).toBe(404);
      const open = await errorOf(
        conversations.create(
          actors.independentC,
          { participantId: actors.doctorB1.sub, type: 'DIRECT' },
          context,
        ),
      );
      expect(open.getStatus()).toBe(404);
      const blocker = await errorOf(
        sendAs(actors.doctorB1, conversation.id, 'Réponse'),
      );
      expect(codeOf(blocker)).toBe('CONTACT_BLOCKED');
      // The blocked user no longer finds the blocker in the directory.
      expect((await listed(actors.independentC)).has(actors.doctorB1.sub)).toBe(
        false,
      );
      expect(
        (await directory.listBlocks(actors.doctorB1)).map(
          ({ userId }) => userId,
        ),
      ).toEqual([actors.independentC.sub]);

      await directory.unblock(
        actors.doctorB1,
        actors.independentC.sub,
        context,
      );
      await expect(
        sendAs(
          actors.independentC,
          conversation.id,
          'Merci de m’avoir débloqué',
        ),
      ).resolves.toMatchObject({ created: true });
    });

    it('takes a pending request out of the list of the user who blocks its sender', async () => {
      const { conversation } = await conversations.create(
        actors.adminB,
        { participantId: actors.adminA.sub, type: 'DIRECT' },
        context,
      );
      expect(
        (
          await conversations.list(actors.adminA, { status: 'pending' })
        ).items.map(({ id }) => id),
      ).toContain(conversation.id);

      await directory.block(actors.adminA, actors.adminB.sub, context);

      expect(
        (
          await conversations.list(actors.adminA, { status: 'pending' })
        ).items.map(({ id }) => id),
      ).not.toContain(conversation.id);
    });

    it('lets a professional leave the directory', async () => {
      await directory.updateSettings(actors.doctorA2, {
        discoverableByPeers: false,
      });
      expect((await listed(actors.independentC)).has(actors.doctorA2.sub)).toBe(
        false,
      );
      // Still reachable by a colleague of the same workspace.
      const colleague = await conversations.create(
        actors.adminA,
        { participantId: actors.doctorA2.sub, type: 'DIRECT' },
        context,
      );
      expect(colleague.conversation.id).toBeTruthy();
    });
  });

  describe('workspace members', () => {
    it('lists the colleagues of the caller workspace, listed in the directory or not', async () => {
      // doctorA2 left the directory in the previous test.
      const members = await directory.workspaceMembers(actors.adminA);
      const ids = members.map(({ id }) => id);

      expect(ids).toEqual(
        expect.arrayContaining([actors.doctorA1.sub, actors.doctorA2.sub]),
      );
      expect(ids).not.toContain(actors.adminA.sub);
      expect(ids).not.toContain(actors.doctorB1.sub);
      expect(JSON.stringify(members)).not.toMatch(/@healix\.test|msg-/);

      const searched = await directory.workspaceMembers(actors.adminA, '');
      expect(searched.length).toBe(members.length);
      await expect(
        directory.workspaceMembers(actors.independentC),
      ).resolves.toEqual([]);
    });
  });

  describe('a group outside its workspace', () => {
    it('is closed to a member suspended from, then removed from, the workspace', async () => {
      const conversationId = await teamA('Équipe hors espace');
      await sendAs(actors.doctorA1, conversationId, 'Réunion à 14 h');
      const membership = await prisma.workspaceMembership.findFirstOrThrow({
        where: { userId: actors.doctorA2.sub },
      });

      const closed = async () => {
        expect(
          (
            await errorOf(conversations.getOne(actors.doctorA2, conversationId))
          ).getStatus(),
        ).toBe(404);
        expect(
          (
            await errorOf(messages.list(actors.doctorA2, conversationId, {}))
          ).getStatus(),
        ).toBe(404);
        expect(
          (
            await errorOf(
              sendAs(actors.doctorA2, conversationId, 'Toujours là ?'),
            )
          ).getStatus(),
        ).toBe(404);
        expect(
          (
            await errorOf(messages.markRead(actors.doctorA2, conversationId, 1))
          ).getStatus(),
        ).toBe(404);
        const listed = await conversations.list(actors.doctorA2, {});
        expect(listed.items.map(({ id }) => id)).not.toContain(conversationId);
      };

      // Readable while a member.
      await expect(
        messages.list(actors.doctorA2, conversationId, {}),
      ).resolves.toMatchObject({ items: [{ body: 'Réunion à 14 h' }] });
      const unreadAsMember = await messages.unreadCount(actors.doctorA2);

      await prisma.workspaceMembership.update({
        data: { status: 'SUSPENDED' },
        where: { id: membership.id },
      });
      await closed();
      // The badge no longer counts the groups of workspace A, this one's
      // unread message included; only DIRECT conversations remain.
      const unreadSuspended = await messages.unreadCount(actors.doctorA2);
      expect(unreadSuspended.total).toBeLessThanOrEqual(
        unreadAsMember.total - 1,
      );
      const directUnread = await prisma.conversationParticipant.findMany({
        select: {
          conversation: { select: { lastSeq: true } },
          lastReadSeq: true,
        },
        where: {
          conversation: { type: 'DIRECT' },
          OR: [{ mutedUntil: null }, { mutedUntil: { lte: new Date() } }],
          status: { in: ['ACTIVE', 'PENDING'] },
          userId: actors.doctorA2.sub,
        },
      });
      expect(unreadSuspended.total).toBe(
        directUnread.reduce(
          (sum, entry) => sum + entry.conversation.lastSeq - entry.lastReadSeq,
          0,
        ),
      );

      await prisma.workspaceMembership.delete({ where: { id: membership.id } });
      await closed();

      // Back in the workspace: the group opens again.
      await prisma.workspaceMembership.create({
        data: {
          role: membership.role,
          userId: membership.userId,
          workspaceId: membership.workspaceId,
        },
      });
      await expect(
        conversations.getOne(actors.doctorA2, conversationId),
      ).resolves.toMatchObject({ id: conversationId });
      // The members who stayed keep it.
      await expect(
        conversations.getOne(actors.doctorA1, conversationId),
      ).resolves.toMatchObject({ id: conversationId });
    });
  });
});
