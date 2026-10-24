import { UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Request, type Response } from 'express';

import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { type AdminAuthenticatedUserPayload } from '../admin-auth/types/admin-authenticated-request.type';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
  TEST_PASSWORD,
} from '../common/testing/integration-fixtures';
import { MailService, type MailMessage } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountModule } from './account.module';
import { AccountSessionsService } from './account-sessions.service';
import { AccountService } from './account.service';

// The sessions of a user and of a back-office admin on a migrated database:
// the refresh tokens are hashed, stored, matched, rotated and revoked by the
// real services and the real queries. TEST_DATABASE_URL names a database
// ending in "_test"; the spec is skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const SECRETS = {
  ADMIN_JWT_ACCESS_SECRET: `integration-admin-access-${'a7Kp'.repeat(8)}`,
  ADMIN_JWT_REFRESH_SECRET: `integration-admin-refresh-${'b3Mx'.repeat(8)}`,
  JWT_ACCESS_SECRET: `integration-user-access-${'c9Lw'.repeat(8)}`,
  JWT_REFRESH_SECRET: `integration-user-refresh-${'d2Nz'.repeat(8)}`,
};

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

const NEW_PASSWORD = 'Nouveau-mdp-integration-2026!';

describeWithDatabase('the sessions against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auth: AuthService;
  let adminAuth: AdminAuthService;
  let sessions: AccountSessionsService;
  let account: AccountService;
  let fixtures: IntegrationFixtures;
  const mails: MailMessage[] = [];
  const jwt = new JwtService({});

  const context = (userAgent: string) => ({
    ipAddress: '41.200.12.34',
    userAgent,
  });

  // The cookies a browser would keep.
  const cookieJar = () => {
    const cookies: Record<string, string> = {};
    const response = {
      clearCookie: (name: string) => {
        delete cookies[name];
      },
      cookie: (name: string, value: string) => {
        cookies[name] = value;
      },
    } as unknown as Response;
    return { cookies, response };
  };

  // --- Users --------------------------------------------------------------

  let userEmail = '';
  let userId = '';

  const signIn = async (userAgent: string, password = TEST_PASSWORD) => {
    const { cookies, response } = cookieJar();
    await auth.login(
      { accountType: 'INDEPENDENT_DOCTOR', email: userEmail, password },
      response,
      context(userAgent),
    );
    return cookies;
  };

  const renew = async (browser: Record<string, string>, userAgent: string) => {
    const refreshToken = browser.refresh_token;
    const payload = jwt.verify<AuthenticatedUserPayload>(refreshToken, {
      secret: SECRETS.JWT_REFRESH_SECRET,
    });
    const { cookies, response } = cookieJar();
    await auth.refreshSession(
      { ...payload, refreshToken },
      response,
      context(userAgent),
    );
    // The browser replaces its cookies with the ones it was given.
    Object.assign(browser, cookies);
    return refreshToken;
  };

  const openSessions = () =>
    prisma.refreshToken.count({
      where: { expiresAt: { gt: new Date() }, revokedAt: null, userId },
    });

  // --- Admins ---------------------------------------------------------------

  let adminEmail = '';
  let adminId = '';

  const adminSignIn = async (userAgent: string) => {
    const { cookies, response } = cookieJar();
    await adminAuth.login(
      { email: adminEmail, password: TEST_PASSWORD },
      response,
      context(userAgent),
    );
    return cookies;
  };

  const adminRenew = async (refreshToken: string) => {
    const payload = jwt.verify<AdminAuthenticatedUserPayload>(refreshToken, {
      secret: SECRETS.ADMIN_JWT_REFRESH_SECRET,
    });
    const { cookies, response } = cookieJar();
    await adminAuth.refreshSession(
      { ...payload, refreshToken },
      response,
      context(CHROME_WINDOWS),
    );
    return cookies;
  };

  const adminSessionIds = async () =>
    new Set(
      (
        await prisma.refreshToken.findMany({
          select: { id: true },
          where: { userId: adminId },
        })
      ).map((row) => row.id),
    );

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    process.env.BCRYPT_SALT_ROUNDS = '10';
    Object.assign(process.env, SECRETS);
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        AdminAuthModule,
        AccountModule,
      ],
    })
      .overrideProvider(MailService)
      .useValue({
        publicUrl: 'http://localhost:3000',
        send: (message: MailMessage) => {
          mails.push(message);
          return Promise.resolve();
        },
      })
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    adminAuth = moduleRef.get(AdminAuthService);
    sessions = moduleRef.get(AccountSessionsService);
    account = moduleRef.get(AccountService);
    fixtures = new IntegrationFixtures(prisma, 'sess');

    const doctor = await fixtures.independentDoctor({
      password: TEST_PASSWORD,
    });
    userEmail = doctor.user.email;
    userId = doctor.user.id;
    const admin = await fixtures.user('SUPER_ADMIN', {
      password: TEST_PASSWORD,
    });
    adminEmail = admin.email;
    adminId = admin.id;
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await moduleRef?.close();
  }, 60_000);

  describe('of a user', () => {
    it('refuses the old refresh token of a session that renewed, and still serves the other session', async () => {
      const a = await signIn(CHROME_WINDOWS);
      const b = await signIn(FIREFOX_LINUX);
      const oldA = await renew(a, CHROME_WINDOWS);

      expect(a.refresh_token).not.toBe(oldA);
      // The token A held before renewing is not a session any more, though
      // B's session is open and starts with the same bytes.
      await expect(
        auth.refreshSession(
          {
            ...jwt.verify<AuthenticatedUserPayload>(oldA, {
              secret: SECRETS.JWT_REFRESH_SECRET,
            }),
            refreshToken: oldA,
          },
          cookieJar().response,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // B and the renewed A keep renewing.
      await expect(renew(b, FIREFOX_LINUX)).resolves.toEqual(
        expect.any(String),
      );
      await expect(renew(a, CHROME_WINDOWS)).resolves.toEqual(
        expect.any(String),
      );
      expect(await openSessions()).toBe(2);

      // Each browser finds itself in the list, readable and masked.
      const list = await sessions.list(userId, a.refresh_token);
      expect(list).toHaveLength(2);
      expect(list.find((session) => session.current)).toMatchObject({
        browser: 'Chrome',
        ipAddress: '41.200.x.x',
        os: 'Windows',
      });
      expect(list.find((session) => !session.current)).toMatchObject({
        browser: 'Firefox',
        os: 'Linux',
      });
      expect(
        (await sessions.list(userId, b.refresh_token)).find(
          (session) => session.current,
        ),
      ).toMatchObject({ browser: 'Firefox' });
    });

    it('closes the other sessions from one of them, and keeps that one', async () => {
      await prisma.refreshToken.updateMany({
        data: { revokedAt: new Date() },
        where: { userId },
      });
      const a = await signIn(CHROME_WINDOWS);
      const b = await signIn(FIREFOX_LINUX);
      const c = await signIn(FIREFOX_LINUX);

      const result = await sessions.revokeOthers(userId, a.refresh_token);

      expect(result).toEqual({ revoked: 2 });
      await expect(renew(b, FIREFOX_LINUX)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(renew(c, FIREFOX_LINUX)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(renew(a, CHROME_WINDOWS)).resolves.toEqual(
        expect.any(String),
      );
      expect(await openSessions()).toBe(1);
      const audit = await prisma.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        where: { action: 'SESSIONS_REVOKED', userId },
      });
      expect(audit?.metadata).toEqual({ revokedSessions: 2 });
    });

    it('closes one session of the caller, never the session of another user', async () => {
      await prisma.refreshToken.updateMany({
        data: { revokedAt: new Date() },
        where: { userId },
      });
      const a = await signIn(CHROME_WINDOWS);
      const b = await signIn(FIREFOX_LINUX);
      const others = await fixtures.user('INDEPENDENT_DOCTOR');
      const foreign = await prisma.refreshToken.create({
        data: {
          expiresAt: new Date(Date.now() + 3_600_000),
          tokenHash: 'not-a-real-hash',
          userId: others.id,
        },
      });
      const listed = await sessions.list(userId, a.refresh_token);
      const sessionOfB = listed.find((session) => !session.current)!.id;

      await expect(
        sessions.revoke(userId, foreign.id, a.refresh_token),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (
          await prisma.refreshToken.findUniqueOrThrow({
            where: { id: foreign.id },
          })
        ).revokedAt,
      ).toBeNull();

      // Not its own session either: that is the sign-out.
      await expect(
        sessions.revoke(
          userId,
          listed.find((session) => session.current)!.id,
          a.refresh_token,
        ),
      ).rejects.toMatchObject({ status: 400 });

      await expect(
        sessions.revoke(userId, sessionOfB, a.refresh_token),
      ).resolves.toEqual({ revoked: 1 });
      await expect(renew(b, FIREFOX_LINUX)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(renew(a, CHROME_WINDOWS)).resolves.toEqual(
        expect.any(String),
      );
    });

    it('closes the other sessions when the password changes, and keeps the current one', async () => {
      await prisma.refreshToken.updateMany({
        data: { revokedAt: new Date() },
        where: { userId },
      });
      const a = await signIn(CHROME_WINDOWS);
      const b = await signIn(FIREFOX_LINUX);
      const c = await signIn(FIREFOX_LINUX);
      mails.length = 0;

      const result = await account.changePassword(
        userId,
        { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD },
        a.refresh_token,
        context(CHROME_WINDOWS),
      );

      expect(result).toMatchObject({
        keptCurrentSession: true,
        revokedSessions: 2,
      });
      await expect(renew(b, FIREFOX_LINUX)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(renew(c, FIREFOX_LINUX)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(renew(a, CHROME_WINDOWS)).resolves.toEqual(
        expect.any(String),
      );
      expect(await openSessions()).toBe(1);
      expect(mails).toHaveLength(1);

      // The new password opens a session, the old one does not.
      await expect(
        signIn(CHROME_WINDOWS, NEW_PASSWORD),
      ).resolves.toHaveProperty('refresh_token');
      await expect(
        signIn(CHROME_WINDOWS, TEST_PASSWORD),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a wrong current password and leaves the sessions and the password as they are', async () => {
      const before = await openSessions();
      const hash = (
        await prisma.user.findUniqueOrThrow({ where: { id: userId } })
      ).passwordHash;
      const a = await signIn(CHROME_WINDOWS, NEW_PASSWORD);

      await expect(
        account.changePassword(
          userId,
          {
            currentPassword: 'pas-le-bon-mot-de-passe',
            newPassword: 'Autre-mdp-2026!',
          },
          a.refresh_token,
        ),
      ).rejects.toMatchObject({
        response: { code: 'CURRENT_PASSWORD_INVALID' },
        status: 400,
      });

      expect(await openSessions()).toBe(before + 1);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
          .passwordHash,
      ).toBe(hash);
    });
  });

  describe('of a back-office admin', () => {
    it('refuses the old refresh token of a session that renewed, even though another is open', async () => {
      const a = await adminSignIn(CHROME_WINDOWS);
      const b = await adminSignIn(FIREFOX_LINUX);
      const oldA = a.admin_refresh_token;

      const renewed = await adminRenew(oldA);

      expect(renewed.admin_refresh_token).not.toBe(oldA);
      await expect(adminRenew(oldA)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(adminRenew(b.admin_refresh_token)).resolves.toHaveProperty(
        'admin_refresh_token',
      );
      await expect(
        adminRenew(renewed.admin_refresh_token),
      ).resolves.toHaveProperty('admin_refresh_token');
    });

    it('closes the session of the browser that signs out, not the other one', async () => {
      await prisma.refreshToken.updateMany({
        data: { revokedAt: new Date() },
        where: { userId: adminId },
      });
      const known = await adminSessionIds();
      const a = await adminSignIn(CHROME_WINDOWS);
      const b = await adminSignIn(FIREFOX_LINUX);
      const oldCookieOfA = a.admin_refresh_token;

      await adminAuth.logout(
        { cookies: { ...a } } as unknown as Request,
        cookieJar().response,
      );

      // The sessions this test opened, oldest first.
      const rows = (
        await prisma.refreshToken.findMany({
          orderBy: { createdAt: 'asc' },
          where: { userId: adminId },
        })
      ).filter((row) => !known.has(row.id));
      expect(rows).toHaveLength(2);
      // The first session is the one of A: A is closed, B is open.
      expect(rows[0].userAgent).toBe(CHROME_WINDOWS);
      expect(rows[0].revokedAt).toBeInstanceOf(Date);
      expect(rows[1].userAgent).toBe(FIREFOX_LINUX);
      expect(rows[1].revokedAt).toBeNull();

      await expect(adminRenew(oldCookieOfA)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(adminRenew(b.admin_refresh_token)).resolves.toHaveProperty(
        'admin_refresh_token',
      );
    });
  });
});
