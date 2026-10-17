import { randomBytes, randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';
import { DirectoryService } from './directory.service';
import { MessagesService } from './messages.service';
import { MessagingModule } from './messaging.module';

// Read receipts against a migrated test database (TEST_DATABASE_URL, a name
// ending in "_test"), as messaging.integration.spec.ts; skipped without it.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.slice(1)
  : '';
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

describeWithDatabase('read receipts against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let conversations: ConversationsService;
  let messages: MessagesService;
  let directory: DirectoryService;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created = { users: [] as string[], workspaces: [] as string[] };
  const actors = {} as Record<
    'admin' | 'doctor1' | 'doctor2',
    AuthenticatedUserPayload
  >;

  let counter = 0;
  async function user(key: keyof typeof actors, role: string) {
    counter += 1;
    const row = await prisma.user.create({
      data: {
        accountStatus: 'ACTIVE',
        email: `read-${suffix}-${counter}@healix.test`,
        fullName: `Dr Lecture ${suffix} ${counter}`,
        passwordHash: 'not-a-real-hash',
        phone: `read-${suffix}-${counter}`,
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

  const send = (actor: AuthenticatedUserPayload, id: string, body: string) =>
    messages.send(actor, id, { body, clientMessageId: randomUUID() });

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

    const admin = await user('admin', 'ESTABLISHMENT_ADMIN');
    const establishment = await prisma.establishment.create({
      data: {
        address: 'Alger',
        managerFullName: 'Direction',
        name: `Clinique Lecture ${suffix}`,
        ownerId: admin.id,
        phone: '0550000000',
        professionalEmail: `read-clinic-${suffix}@healix.test`,
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
      data: { role: 'OWNER', userId: admin.id, workspaceId: workspace.id },
    });
    for (const key of ['doctor1', 'doctor2'] as const) {
      const row = await user(key, 'AFFILIATED_DOCTOR');
      await prisma.doctorProfile.create({
        data: {
          establishmentId: establishment.id,
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
        data: { role: 'DOCTOR', userId: row.id, workspaceId: workspace.id },
      });
    }
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
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

  it('dates each message seen at the first reading that reached it, and keeps the positions across reloads', async () => {
    const { conversation } = await conversations.create(
      actors.doctor1,
      { participantId: actors.doctor2.sub, type: 'DIRECT' },
      context,
    );
    const first = (await send(actors.doctor1, conversation.id, 'Premier avis'))
      .message;
    await messages.markRead(actors.doctor2, conversation.id, first.seq);
    await wait(30);
    const second = (await send(actors.doctor1, conversation.id, 'Second avis'))
      .message;
    await messages.markRead(actors.doctor2, conversation.id, second.seq);

    const marks = await prisma.conversationReadMark.findMany({
      orderBy: { readAt: 'asc' },
      where: { conversationId: conversation.id, userId: actors.doctor2.sub },
    });
    expect(marks.map(({ seq }) => seq)).toEqual([first.seq, second.seq]);

    const firstReaders = await messages.readers(actors.doctor1, first.id);
    expect(firstReaders.seen).toEqual([
      expect.objectContaining({
        seenAt: marks[0].readAt,
        userId: actors.doctor2.sub,
      }),
    ]);
    const secondReaders = await messages.readers(actors.doctor1, second.id);
    expect(secondReaders.seen[0].seenAt).toEqual(marks[1].readAt);

    // From the database, not from an event: a reload shows it.
    const view = await conversations.getOne(actors.doctor1, conversation.id);
    expect(
      view.participants.find(({ userId }) => userId === actors.doctor2.sub),
    ).toMatchObject({ lastReadAt: marks[1].readAt, lastReadSeq: second.seq });
  });

  it('counts a reply as reading what came before it', async () => {
    const { conversation } = await conversations.create(
      actors.doctor1,
      { participantId: actors.admin.sub, type: 'DIRECT' },
      context,
    );
    const question = (await send(actors.doctor1, conversation.id, 'Dispo ?'))
      .message;
    const reply = (await send(actors.admin, conversation.id, 'Oui')).message;

    const readers = await messages.readers(actors.doctor1, question.id);
    expect(readers.seen).toEqual([
      expect.objectContaining({
        seenAt: reply.createdAt,
        userId: actors.admin.sub,
      }),
    ]);
  });

  it('hides read receipts both ways while one side does not share them, the unread count aside', async () => {
    const { conversation } = await conversations.create(
      actors.doctor2,
      { participantId: actors.admin.sub, type: 'DIRECT' },
      context,
    );
    const sent = (await send(actors.doctor2, conversation.id, 'Bilan prêt'))
      .message;
    await messages.markRead(actors.admin, conversation.id, sent.seq);

    await directory.updateSettings(actors.admin, { shareReadReceipts: false });
    try {
      const doctorView = await conversations.getOne(
        actors.doctor2,
        conversation.id,
      );
      expect(
        doctorView.participants.find(
          ({ userId }) => userId === actors.admin.sub,
        ),
      ).toMatchObject({ lastReadAt: null, lastReadSeq: null });
      expect(await messages.readers(actors.doctor2, sent.id)).toMatchObject({
        notShared: [{ userId: actors.admin.sub }],
        seen: [],
      });

      // Neither does the one who turned them off see the others'.
      const reply = (await send(actors.admin, conversation.id, 'Merci'))
        .message;
      await messages.markRead(actors.doctor2, conversation.id, reply.seq);
      const adminView = await conversations.getOne(
        actors.admin,
        conversation.id,
      );
      expect(
        adminView.participants.find(
          ({ userId }) => userId === actors.doctor2.sub,
        ),
      ).toMatchObject({ lastReadSeq: null });
      expect(await messages.readers(actors.admin, reply.id)).toMatchObject({
        notShared: [{ userId: actors.doctor2.sub }],
        seen: [],
      });
      // The unread counts do not depend on it.
      expect((await messages.unreadCount(actors.admin)).total).toBe(0);
    } finally {
      await directory.updateSettings(actors.admin, { shareReadReceipts: true });
    }

    const shown = await conversations.getOne(actors.doctor2, conversation.id);
    expect(
      shown.participants.find(({ userId }) => userId === actors.admin.sub)
        ?.lastReadSeq,
    ).toBeGreaterThanOrEqual(sent.seq);
  });
});
