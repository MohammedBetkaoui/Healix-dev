/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// The rows of the in-memory table below are untyped on purpose: they stand in
// for Prisma, whatever the service asks for.
import { UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { type Request, type Response } from 'express';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthService } from '../auth/auth.service';
import { userJwtModuleOptions } from '../auth/auth.module';
import { refreshTokenMatches } from '../auth/refresh-token-hash';
import {
  DEFAULT_JWT_SECRETS,
  JwtSecretError,
} from '../common/security/jwt-secrets';
import { type PrismaService } from '../prisma/prisma.service';
import { type UsersService } from '../users/users.service';
import { adminJwtModuleOptions } from './admin-auth.module';
import { AdminAuthService } from './admin-auth.service';
import { type AdminAuthenticatedUserPayload } from './types/admin-authenticated-request.type';

type Row = Record<string, any>;

const ACCESS_SECRET = `admin-access-${'k7Qz'.repeat(8)}`;
const REFRESH_SECRET = `admin-refresh-${'p3Wx'.repeat(8)}`;
const PASSWORD = 'Admin-mdp-2026!';

const admin = (overrides: Row = {}): Row => ({
  accountStatus: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  email: 'admin@example.dz',
  fullName: 'Admin',
  id: 'admin-1',
  isEmailVerified: true,
  isPhoneVerified: true,
  passwordHash: '',
  phone: 'admin',
  role: 'SUPER_ADMIN',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

// The table of the refresh tokens, with the three calls the service makes.
function createStore() {
  const rows: Row[] = [];
  let sequence = 0;

  const refreshToken = {
    create: jest.fn(({ data }: { data: Row }) => {
      sequence += 1;
      const row = {
        createdAt: new Date(1_800_000_000_000 + sequence * 1_000),
        id: `rt-${sequence}`,
        revokedAt: null,
        ...data,
      };
      rows.push(row);
      return Promise.resolve(row);
    }),
    findMany: jest.fn(({ where }: { where: Row }) =>
      Promise.resolve(
        rows
          .filter(
            (row) =>
              row.userId === where.userId &&
              row.revokedAt === null &&
              row.expiresAt.getTime() > where.expiresAt.gt.getTime(),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    ),
    update: jest.fn(({ data, where }: { data: Row; where: Row }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error('unknown row');
      Object.assign(row, data);
      return Promise.resolve(row);
    }),
  };
  const prisma = {
    $transaction: jest.fn((work: (client: unknown) => unknown) =>
      Promise.resolve(work({ refreshToken })),
    ),
    refreshToken,
  };

  return { prisma, rows };
}

// A response that keeps the cookies it is given.
function createResponse() {
  const cookies: Record<string, string> = {};
  const response = {
    clearCookie: jest.fn((name: string) => {
      delete cookies[name];
    }),
    cookie: jest.fn((name: string, value: string) => {
      cookies[name] = value;
    }),
  };

  return { cookies, response: response as unknown as Response };
}

const configOf = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const VALID_ENV = {
  ADMIN_JWT_ACCESS_SECRET: ACCESS_SECRET,
  ADMIN_JWT_REFRESH_SECRET: REFRESH_SECRET,
  BCRYPT_SALT_ROUNDS: '10',
};

async function setup() {
  const store = createStore();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const users: Row[] = [admin({ passwordHash })];
  const usersService = {
    findAuthUserByEmail: jest.fn((email: string) =>
      Promise.resolve(users.find((user) => user.email === email) ?? null),
    ),
    findAuthUserById: jest.fn((id: string) =>
      Promise.resolve(users.find((user) => user.id === id) ?? null),
    ),
  };
  const audit = { createAuditLog: jest.fn(() => Promise.resolve()) };
  const jwtService = new JwtService({});
  const service = new AdminAuthService(
    store.prisma as unknown as PrismaService,
    usersService as unknown as UsersService,
    audit as unknown as AuditLogsService,
    jwtService,
    configOf(VALID_ENV),
  );

  // One browser: a login, then renewals, each with the cookie it was given.
  const login = async () => {
    const { cookies, response } = createResponse();
    await service.login(
      { email: 'admin@example.dz', password: PASSWORD },
      response,
    );
    return { cookies, response };
  };
  const refresh = async (refreshToken: string) => {
    const { cookies, response } = createResponse();
    const payload = jwtService.verify<AdminAuthenticatedUserPayload>(
      refreshToken,
      { secret: REFRESH_SECRET },
    );
    await service.refreshSession({ ...payload, refreshToken }, response);
    return cookies;
  };
  const logout = async (cookies: Record<string, string>) => {
    const { response } = createResponse();
    await service.logout({ cookies } as unknown as Request, response);
  };
  const isOpen = (id: string) =>
    store.rows.find((row) => row.id === id)?.revokedAt === null;

  return { jwtService, login, logout, refresh, service, store, isOpen };
}

describe('AdminAuthService refresh tokens', () => {
  it('refuses the old token of a session once it has renewed, even when another session is open', async () => {
    const { login, refresh, store } = await setup();
    const a = await login();
    const b = await login();
    const a1 = a.cookies.admin_refresh_token;
    const b1 = b.cookies.admin_refresh_token;

    const renewed = await refresh(a1);
    const a2 = renewed.admin_refresh_token;

    expect(a2).not.toBe(a1);
    // The session of A is its latest token, B has its own: nothing is left
    // that the old token of A could be taken for.
    await expect(refresh(a1)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(store.rows.filter((row) => row.revokedAt === null)).toHaveLength(2);

    // The sessions that are still current keep renewing.
    await expect(refresh(a2)).resolves.toHaveProperty('admin_refresh_token');
    await expect(refresh(b1)).resolves.toHaveProperty('admin_refresh_token');
  });

  it('does not let the token of a closed session renew another one', async () => {
    const { login, logout, refresh } = await setup();
    const a = await login();
    const b = await login();
    const a1 = a.cookies.admin_refresh_token;

    await logout(a.cookies);

    await expect(refresh(a1)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      refresh(b.cookies.admin_refresh_token),
    ).resolves.toHaveProperty('admin_refresh_token');
  });

  it('closes the session of the device that signs out, not the newest one', async () => {
    const { isOpen, login, logout, store } = await setup();
    const a = await login();
    await login();
    const sessionOfB = store.rows[1].id as string;
    const sessionOfA = store.rows[0].id as string;

    // A is the older of the two: the newest session is B.
    await logout(a.cookies);

    expect(isOpen(sessionOfA)).toBe(false);
    expect(isOpen(sessionOfB)).toBe(true);
  });

  it('keeps the other browser signed in after one signs out, and refuses the old cookie of the first', async () => {
    const { login, logout, refresh } = await setup();
    const first = await login();
    const second = await login();
    const oldCookieOfFirst = first.cookies.admin_refresh_token;

    await logout(first.cookies);

    await expect(
      refresh(second.cookies.admin_refresh_token),
    ).resolves.toHaveProperty('admin_refresh_token');
    // The cookie copied before the sign-out is replayed.
    await expect(refresh(oldCookieOfFirst)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('signs two logins of the same second with two different refresh tokens', async () => {
    const { jwtService, login } = await setup();
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);

    try {
      const first = await login();
      const second = await login();
      const claims = (token: string) =>
        jwtService.decode<
          AdminAuthenticatedUserPayload & { jti?: string; iat: number }
        >(token);
      const a = claims(first.cookies.admin_refresh_token);
      const b = claims(second.cookies.admin_refresh_token);

      expect(a.iat).toBe(b.iat);
      expect(first.cookies.admin_refresh_token).not.toBe(
        second.cookies.admin_refresh_token,
      );
      expect(a.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(b.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.jti).not.toBe(b.jti);
      // The access token keeps its format.
      expect(claims(first.cookies.admin_access_token)).not.toHaveProperty(
        'jti',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('hashes the refresh token from its SHA-256, like the users', async () => {
    const { login, store } = await setup();
    const { cookies } = await login();

    expect(
      await refreshTokenMatches(
        cookies.admin_refresh_token,
        store.rows[0].tokenHash as string,
      ),
    ).toBe(true);
    // The raw token is not what the hash was made of.
    expect(
      await bcrypt.compare(
        cookies.admin_refresh_token,
        store.rows[0].tokenHash as string,
      ),
    ).toBe(false);
  });
});

describe('JWT secrets at startup', () => {
  const noop = {} as never;
  // Each file that reads a secret, with the variables it reads: in production
  // each of them must stop the startup by itself.
  const SITES: Record<
    string,
    { reads: string[]; start: (config: ConfigService) => unknown }
  > = {
    AuthService: {
      reads: ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'],
      start: (config) =>
        new AuthService(noop, noop, noop, noop, noop, noop, noop, config, noop),
    },
    AdminAuthService: {
      reads: ['ADMIN_JWT_ACCESS_SECRET', 'ADMIN_JWT_REFRESH_SECRET'],
      start: (config) => new AdminAuthService(noop, noop, noop, noop, config),
    },
    'the JWT module of the users': {
      reads: ['JWT_ACCESS_SECRET'],
      start: (config) => userJwtModuleOptions(config),
    },
    'the JWT module of the admins': {
      reads: ['ADMIN_JWT_ACCESS_SECRET'],
      start: (config) => adminJwtModuleOptions(config),
    },
  };
  const STRONG: Record<string, string> = {
    ADMIN_JWT_ACCESS_SECRET: ACCESS_SECRET,
    ADMIN_JWT_REFRESH_SECRET: REFRESH_SECRET,
    JWT_ACCESS_SECRET: `user-access-${'m2Rv'.repeat(8)}`,
    JWT_REFRESH_SECRET: `user-refresh-${'s9Ty'.repeat(8)}`,
    NODE_ENV: 'production',
  };

  describe.each(Object.entries(SITES))('%s', (_name, site) => {
    const startUp = (env: Record<string, string>) => () =>
      site.start(configOf(env));

    it('starts in production with its secrets set', () => {
      expect(startUp(STRONG)).not.toThrow();
    });

    it('fails in production when a secret it reads is missing, and names it', () => {
      for (const name of site.reads) {
        const without = Object.fromEntries(
          Object.entries(STRONG).filter(([key]) => key !== name),
        );

        expect(startUp(without)).toThrow(JwtSecretError);
        expect(startUp(without)).toThrow(new RegExp(`${name} manque`));
      }
    });

    it('fails in production when a secret it reads is too short or is the default', () => {
      for (const name of site.reads) {
        expect(startUp({ ...STRONG, [name]: 'short' })).toThrow(/trop court/);
        expect(
          startUp({
            ...STRONG,
            [name]:
              DEFAULT_JWT_SECRETS[name as keyof typeof DEFAULT_JWT_SECRETS],
          }),
        ).toThrow(JwtSecretError);
      }
    });

    it('starts in development without any secret', () => {
      expect(startUp({})).not.toThrow();
      expect(startUp({ NODE_ENV: 'development' })).not.toThrow();
    });
  });
});
