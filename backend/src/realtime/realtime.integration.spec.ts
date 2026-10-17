import { randomBytes, randomUUID } from 'node:crypto';
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { type RequestHandler } from 'express';
import { io, type Socket } from 'socket.io-client';

import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeModule } from './realtime.module';
import { REALTIME_PATH } from './realtime.types';

// A real server (app.listen(0)) and real sockets (socket.io-client), against
// the migrated test database of TEST_DATABASE_URL (name ending in "_test");
// skipped without it. Each run creates its own users, then removes them.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.slice(1)
  : '';
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const ORIGIN = 'http://app.healix.test';
const ACCESS_SECRET = randomBytes(32).toString('hex');

// As in main.ts; cookie-parser comes without type declarations.
const parseCookies = cookieParser as unknown as () => RequestHandler;

type Role = 'ESTABLISHMENT_ADMIN' | 'AFFILIATED_DOCTOR' | 'INDEPENDENT_DOCTOR';
type TestUser = { id: string; role: Role; email: string };

describeWithDatabase('real-time notifications against a server', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl = '';
  const jwt = new JwtService();
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created = { users: [] as string[], workspaces: [] as string[] };
  const sockets: Socket[] = [];
  const users = {} as Record<
    'doctorA' | 'doctorB' | 'doctorC' | 'unverified' | 'suspended',
    TestUser
  >;

  const token = (user: TestUser, expiresIn: number | `${number}m` = '15m') =>
    jwt.sign(
      { email: user.email, role: user.role, sub: user.id, tokenType: 'access' },
      { expiresIn, secret: ACCESS_SECRET },
    );

  function open(
    cookieToken: string | null,
    headers: Record<string, string> = { Origin: ORIGIN },
  ): Socket {
    const socket = io(baseUrl, {
      extraHeaders: {
        ...headers,
        ...(cookieToken ? { Cookie: `access_token=${cookieToken}` } : {}),
      },
      forceNew: true,
      path: REALTIME_PATH,
      reconnection: false,
      transports: ['websocket'],
    });
    sockets.push(socket);
    return socket;
  }

  const connected = (socket: Socket) =>
    new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (error) => reject(error));
    });

  const refusal = (socket: Socket) =>
    new Promise<string>((resolve, reject) => {
      socket.once('connect', () => reject(new Error('connection accepted')));
      socket.once('connect_error', (error) => resolve(error.message));
    });

  // The reason of session.closed, then the disconnection.
  const closed = (socket: Socket) =>
    new Promise<{ reason: string; disconnect: string }>((resolve) => {
      let reason = '';
      socket.once('session.closed', (payload: { reason: string }) => {
        reason = payload.reason;
      });
      socket.once('disconnect', (disconnect) =>
        resolve({ disconnect, reason }),
      );
    });

  let counter = 0;
  async function user(
    key: keyof typeof users,
    options: {
      accountStatus?: string;
      verification?: string;
      workspaceId?: string;
    } = {},
  ) {
    counter += 1;
    const row = await prisma.user.create({
      data: {
        accountStatus: (options.accountStatus ?? 'ACTIVE') as never,
        email: `rt-${suffix}-${counter}@healix.test`,
        fullName: `Temps réel ${suffix} ${counter}`,
        passwordHash: 'not-a-real-hash',
        phone: `rt-${suffix}-${counter}`,
        role: 'INDEPENDENT_DOCTOR',
      },
    });
    created.users.push(row.id);
    const profile = await prisma.doctorProfile.create({
      data: {
        professionalAddress: 'Alger',
        speciality: 'Cardiologie',
        subscriptionStatus: 'NO_PLAN',
        userId: row.id,
        verificationStatus: (options.verification ?? 'VERIFIED') as never,
        wilaya: 'Alger',
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: `Cabinet ${counter}`,
        ownerDoctorProfileId: profile.id,
        type: 'PRIVATE_PRACTICE',
      },
    });
    created.workspaces.push(workspace.id);
    await prisma.workspaceMembership.create({
      data: { role: 'OWNER', userId: row.id, workspaceId: workspace.id },
    });
    users[key] = { email: row.email, id: row.id, role: 'INDEPENDENT_DOCTOR' };
    return users[key];
  }

  beforeAll(async () => {
    if (!databaseName.endsWith('_test')) {
      throw new Error(
        `TEST_DATABASE_URL must name a database ending in "_test", not "${databaseName}".`,
      );
    }
    Object.assign(process.env, {
      ADMIN_JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
      ADMIN_JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
      DATABASE_URL: testDatabaseUrl,
      FRONTEND_URL: ORIGIN,
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
      MESSAGING_KEYS: `k1:${randomBytes(32).toString('base64')}`,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        MessagingModule,
        RealtimeModule,
      ],
    }).compile();
    // The same pieces as main.ts.
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useWebSocketAdapter(new IoAdapter(app));
    app.use(parseCookies());
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as Server;
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);

    await user('doctorA');
    await user('doctorB');
    await user('doctorC');
    await user('unverified', { verification: 'PENDING_VERIFICATION' });
    await user('suspended', { accountStatus: 'SUSPENDED' });
  }, 60_000);

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

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
    await app?.close();
  });

  describe('handshake', () => {
    it('refuses a connection without cookie', async () => {
      await expect(refusal(open(null))).resolves.toBe('unauthorized');
    });

    it('refuses an invalid cookie, and an expired one with token_expired', async () => {
      await expect(refusal(open('not-a-jwt'))).resolves.toBe('unauthorized');
      const forged = jwt.sign(
        {
          role: 'INDEPENDENT_DOCTOR',
          sub: users.doctorA.id,
          tokenType: 'access',
        },
        { expiresIn: '15m', secret: 'another-secret' },
      );
      await expect(refusal(open(forged))).resolves.toBe('unauthorized');
      const refresh = jwt.sign(
        {
          role: 'INDEPENDENT_DOCTOR',
          sub: users.doctorA.id,
          tokenType: 'refresh',
        },
        { expiresIn: '15m', secret: ACCESS_SECRET },
      );
      await expect(refusal(open(refresh))).resolves.toBe('unauthorized');
      const expired = jwt.sign(
        {
          exp: Math.floor(Date.now() / 1000) - 10,
          role: 'INDEPENDENT_DOCTOR',
          sub: users.doctorA.id,
          tokenType: 'access',
        },
        { secret: ACCESS_SECRET },
      );
      await expect(refusal(open(expired))).resolves.toBe('token_expired');
    });

    it('refuses another Origin, or none, before reading the cookie', async () => {
      const valid = token(users.doctorA);
      await expect(
        refusal(open(valid, { Origin: 'https://evil.example' })),
      ).resolves.toBe('origin_not_allowed');
      await expect(refusal(open(valid, {}))).resolves.toBe(
        'origin_not_allowed',
      );
    });

    it('refuses an unverified or suspended account', async () => {
      await expect(refusal(open(token(users.unverified)))).resolves.toBe(
        'unauthorized',
      );
      await expect(refusal(open(token(users.suspended)))).resolves.toBe(
        'unauthorized',
      );
    });

    it('accepts a verified professional with a valid cookie and the right Origin', async () => {
      await expect(connected(open(token(users.doctorA)))).resolves.toBe(
        undefined,
      );
    });
  });

  describe('closing', () => {
    it('closes the socket when the access token expires', async () => {
      const socket = open(token(users.doctorA, 2));
      await connected(socket);

      await expect(closed(socket)).resolves.toEqual({
        disconnect: 'io server disconnect',
        reason: 'token_expired',
      });
    }, 10_000);

    it('closes every socket of the user at logout', async () => {
      const first = open(token(users.doctorB));
      const second = open(token(users.doctorB));
      const other = open(token(users.doctorC));
      await Promise.all([
        connected(first),
        connected(second),
        connected(other),
      ]);
      const closing = Promise.all([closed(first), closed(second)]);

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        headers: { Cookie: `access_token=${token(users.doctorB)}` },
        method: 'POST',
      });

      expect(response.status).toBe(201);
      await expect(closing).resolves.toEqual([
        { disconnect: 'io server disconnect', reason: 'session_ended' },
        { disconnect: 'io server disconnect', reason: 'session_ended' },
      ]);
      expect(other.connected).toBe(true);
    });

    it('keeps 5 sockets per user: a sixth closes the oldest', async () => {
      const opened: Socket[] = [];
      for (let index = 0; index < 5; index += 1) {
        const socket = open(token(users.doctorC));
        await connected(socket);
        opened.push(socket);
      }
      const oldest = closed(opened[0]);

      const sixth = open(token(users.doctorC));
      await connected(sixth);

      await expect(oldest).resolves.toMatchObject({
        reason: 'too_many_sockets',
      });
      expect(
        [...opened.slice(1), sixth].every(({ connected }) => connected),
      ).toBe(true);
    });

    it('accepts no message from the client, and closes after 5 of them', async () => {
      const socket = open(token(users.doctorA));
      await connected(socket);
      const closing = closed(socket);

      for (let index = 0; index < 6; index += 1) {
        socket.emit('message.created', { conversationId: 'x', seq: index });
      }

      await expect(closing).resolves.toMatchObject({
        reason: 'protocol_violation',
      });
    });
  });

  describe('events of the messaging', () => {
    const api = (as: TestUser, method: string, path: string, body?: object) =>
      fetch(`${baseUrl}/api${path}`, {
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${token(as)}`,
        },
        method,
      });

    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const next = (socket: Socket, event: string) =>
      new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${event}`)), 3_000);
        socket.once(event, (payload: unknown) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });

    // B writes to A (another workspace: a contact request).
    const openDirect = async () => {
      const response = await api(
        users.doctorB,
        'POST',
        '/messaging/conversations',
        {
          participantId: users.doctorA.id,
          type: 'DIRECT',
        },
      );
      return ((await response.json()) as { id: string }).id;
    };

    it('tells A when B writes to them, and nobody else, with identifiers only', async () => {
      const recipient = open(token(users.doctorA));
      const outsider = open(token(users.doctorC));
      await Promise.all([connected(recipient), connected(outsider)]);
      const seenByOutsider: string[] = [];
      outsider.onAny((event: string) => seenByOutsider.push(event));

      const announced = next(recipient, 'conversation.updated');
      const conversationId = await openDirect();
      await expect(announced).resolves.toEqual({ conversationId });

      const created = next(recipient, 'message.created');
      const sent = await api(
        users.doctorB,
        'POST',
        `/messaging/conversations/${conversationId}/messages`,
        { body: 'Demande d’avis sur une IRM', clientMessageId: randomUUID() },
      );
      expect(sent.status).toBe(201);
      await expect(created).resolves.toEqual({ conversationId, seq: 1 });

      await wait(300);
      expect(seenByOutsider).toEqual([]);
    });

    it('sends typing to the other participant at most every 3 s', async () => {
      const conversationId = await openDirect();
      await api(
        users.doctorA,
        'POST',
        `/messaging/conversations/${conversationId}/accept`,
      );
      const recipient = open(token(users.doctorA));
      const typist = open(token(users.doctorB));
      await Promise.all([connected(recipient), connected(typist)]);
      const received: unknown[] = [];
      const ownEcho: unknown[] = [];
      recipient.on('typing', (payload: unknown) => received.push(payload));
      typist.on('typing', (payload: unknown) => ownEcho.push(payload));
      const typing = () =>
        api(
          users.doctorB,
          'POST',
          `/messaging/conversations/${conversationId}/typing`,
        );

      expect((await typing()).status).toBe(204);
      expect((await typing()).status).toBe(204);
      await wait(400);
      expect(received).toEqual([{ conversationId, userId: users.doctorB.id }]);

      await wait(3_000);
      await typing();
      await wait(400);
      expect(received).toHaveLength(2);
      // Never sent back to the one typing.
      expect(ownEcho).toEqual([]);
    }, 15_000);
  });
});
