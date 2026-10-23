/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// The rows of the in-memory table below are untyped on purpose: they stand in
// for Prisma, whatever the service asks for.
import { UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { type Request, type Response } from 'express';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { type PrismaService } from '../prisma/prisma.service';
import { type RealtimeService } from '../realtime/realtime.service';
import { type UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { type AuthenticatedUserPayload } from './types/authenticated-request.type';

type Row = Record<string, any>;

const ACCESS_SECRET = `user-access-${'m2Rv'.repeat(8)}`;
const REFRESH_SECRET = `user-refresh-${'s9Ty'.repeat(8)}`;
const PASSWORD = 'Medecin-mdp-2026!';

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

async function setup() {
  const store = createStore();
  const user: Row = {
    accountStatus: 'ACTIVE',
    email: 'doctor@example.dz',
    fullName: 'Samir Kaci',
    id: 'user-1',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    phone: '0550000001',
    role: 'INDEPENDENT_DOCTOR',
  };
  const usersService = {
    findAuthUserByEmail: jest.fn(() => Promise.resolve(user)),
    findAuthUserById: jest.fn(() => Promise.resolve(user)),
  };
  const audit = {
    logLoginSuccess: jest.fn(() => Promise.resolve()),
    logLogout: jest.fn(() => Promise.resolve()),
  };
  const realtime = { disconnectUser: jest.fn(() => Promise.resolve()) };
  const jwtService = new JwtService({});
  const config = {
    get: (key: string) =>
      ({
        BCRYPT_SALT_ROUNDS: '10',
        JWT_ACCESS_SECRET: ACCESS_SECRET,
        JWT_REFRESH_SECRET: REFRESH_SECRET,
      })[key],
  } as unknown as ConfigService;
  const none = {} as never;
  const service = new AuthService(
    store.prisma as unknown as PrismaService,
    usersService as unknown as UsersService,
    none,
    none,
    audit as unknown as AuditLogsService,
    none,
    jwtService,
    config,
    realtime as unknown as RealtimeService,
  );

  const login = async () => {
    const { cookies, response } = createResponse();
    await service.login(
      {
        accountType: 'INDEPENDENT_DOCTOR',
        email: user.email,
        password: PASSWORD,
      },
      response,
    );
    return { cookies };
  };
  const refresh = async (refreshToken: string) => {
    const { cookies, response } = createResponse();
    const payload = jwtService.verify<AuthenticatedUserPayload>(refreshToken, {
      secret: REFRESH_SECRET,
    });
    await service.refreshSession({ ...payload, refreshToken }, response);
    return cookies;
  };
  const logout = async (cookies: Record<string, string>) => {
    const { response } = createResponse();
    await service.logout({ cookies } as unknown as Request, response);
  };

  return { jwtService, login, logout, refresh, store };
}

describe('AuthService refresh tokens', () => {
  it('refuses the old token of a session once it has renewed, even when another session is open', async () => {
    const { login, refresh } = await setup();
    const a = await login();
    const b = await login();
    const a1 = a.cookies.refresh_token;

    const a2 = (await refresh(a1)).refresh_token;

    expect(a2).not.toBe(a1);
    await expect(refresh(a1)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(refresh(a2)).resolves.toHaveProperty('refresh_token');
    await expect(refresh(b.cookies.refresh_token)).resolves.toHaveProperty(
      'refresh_token',
    );
  });

  it('closes the session of the device that signs out, and refuses its old cookie', async () => {
    const { login, logout, refresh, store } = await setup();
    const first = await login();
    const second = await login();

    await logout(first.cookies);

    expect(store.rows.map((row) => row.revokedAt !== null)).toEqual([
      true,
      false,
    ]);
    await expect(refresh(first.cookies.refresh_token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(refresh(second.cookies.refresh_token)).resolves.toHaveProperty(
      'refresh_token',
    );
  });

  it('signs two logins of the same second with two different refresh tokens', async () => {
    const { jwtService, login } = await setup();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now());

    try {
      const first = await login();
      const second = await login();
      const claims = (token: string) =>
        jwtService.decode<
          AuthenticatedUserPayload & { iat: number; jti?: string }
        >(token);
      const a = claims(first.cookies.refresh_token);
      const b = claims(second.cookies.refresh_token);

      expect(a.iat).toBe(b.iat);
      expect(first.cookies.refresh_token).not.toBe(
        second.cookies.refresh_token,
      );
      expect(a.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.jti).not.toBe(b.jti);
      expect(claims(first.cookies.access_token)).not.toHaveProperty('jti');
    } finally {
      spy.mockRestore();
    }
  });
});
