import { randomBytes } from 'node:crypto';

import { type HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';
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
        fullName: `Messagerie ${counter}`,
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
});
