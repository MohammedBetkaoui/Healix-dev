import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { type RequestHandler } from 'express';
import request from 'supertest';

import { AdminAuthController } from '../../admin-auth/admin-auth.controller';
import { AdminAuthService } from '../../admin-auth/admin-auth.service';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { PasswordResetService } from '../../auth/password-reset/password-reset.service';
import { UserRole } from '../enums/user-role.enum';
import {
  AppThrottlerGuard,
  DEFAULT_THROTTLE_ANON_LIMIT,
  DEFAULT_THROTTLE_USER_LIMIT,
  readThrottleLimits,
} from './app-throttler.guard';

const secrets = {
  ADMIN_JWT_ACCESS_SECRET: 'admin-access-secret',
  JWT_ACCESS_SECRET: 'user-access-secret',
};
// Small limits, all different from the routes' own (3 and 5 per IP).
const smallLimits = { THROTTLE_ANON_LIMIT: '2', THROTTLE_USER_LIMIT: '8' };

// As in main.ts; cookie-parser comes without type declarations.
const parseCookies = cookieParser as unknown as () => RequestHandler;

@Controller('ping')
class PingController {
  @Get()
  ping(): string {
    return 'pong';
  }
}

// As in app.module.ts, with the real auth controllers (their own limits) and
// their services stubbed.
async function createApp(
  env: Record<string, string>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController, AuthController, AdminAuthController],
    imports: [
      JwtModule.register({}),
      ThrottlerModule.forRoot([
        { limit: DEFAULT_THROTTLE_ANON_LIMIT, ttl: 60_000 },
      ]),
    ],
    providers: [
      { provide: APP_GUARD, useClass: AppThrottlerGuard },
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      { provide: AuthService, useValue: { login: () => ({}) } },
      { provide: AdminAuthService, useValue: { login: () => ({}) } },
      {
        provide: PasswordResetService,
        useValue: { requestReset: () => ({}), resetPassword: () => ({}) },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(parseCookies());
  await app.init();
  return app;
}

const jwt = new JwtService();

function userToken(
  sub: string,
  {
    secret = secrets.JWT_ACCESS_SECRET,
    ...claims
  }: Record<string, unknown> = {},
): string {
  return jwt.sign(
    {
      email: `${sub}@example.dz`,
      exp: Math.floor(Date.now() / 1000) + 900,
      role: UserRole.INDEPENDENT_DOCTOR,
      sub,
      tokenType: 'access',
      ...claims,
    },
    { secret: secret as string },
  );
}

function adminToken(sub: string): string {
  return jwt.sign(
    {
      email: `${sub}@example.dz`,
      role: UserRole.SUPER_ADMIN,
      sub,
      tokenType: 'admin-access',
    },
    { expiresIn: '10m', secret: secrets.ADMIN_JWT_ACCESS_SECRET },
  );
}

describe('AppThrottlerGuard', () => {
  let app: INestApplication;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const ping = (headers: Record<string, string> = {}) =>
    request(server()).get('/ping').set(headers);
  const asUser = (sub: string) => ({
    Cookie: `access_token=${userToken(sub)}`,
  });

  async function expectStatuses(
    send: () => request.Test,
    count: number,
    status: number,
  ) {
    for (let index = 0; index < count; index += 1) {
      const response = await send();
      expect(response.status).toBe(status);
    }
  }

  afterEach(async () => {
    await app.close();
  });

  it('keeps one counter per user behind a shared IP', async () => {
    app = await createApp({ ...secrets, ...smallLimits });

    // Every request comes from the loopback: one IP for both users.
    await expectStatuses(() => ping(asUser('user-a')), 8, 200);
    await expectStatuses(() => ping(asUser('user-a')), 1, 429);
    await expectStatuses(() => ping(asUser('user-b')), 8, 200);
    // Nor do they use up the anonymous counter of the IP.
    await expectStatuses(() => ping(), 2, 200);
  });

  it('does not stop a signed-in user at 20 requests', async () => {
    app = await createApp(secrets);

    await expectStatuses(() => ping(asUser('user-a')), 25, 200);
    const response = await ping(asUser('user-a'));
    expect(response.headers['x-ratelimit-limit']).toBe(
      String(DEFAULT_THROTTLE_USER_LIMIT),
    );
    expect((await ping()).headers['x-ratelimit-limit']).toBe(
      String(DEFAULT_THROTTLE_ANON_LIMIT),
    );
  });

  it('limits an anonymous caller to THROTTLE_ANON_LIMIT, with Retry-After', async () => {
    app = await createApp({ ...secrets, ...smallLimits });

    await expectStatuses(() => ping(), 2, 200);
    const response = await ping();

    expect(response.status).toBe(429);
    const retryAfter = Number(response.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('treats an invalid, expired or other kind of token as no token', async () => {
    app = await createApp({ ...secrets, THROTTLE_ANON_LIMIT: '4' });

    const tokens = [
      userToken('user-a', { secret: 'another-secret' }),
      userToken('user-b', { exp: Math.floor(Date.now() / 1000) - 60 }),
      userToken('user-c', { tokenType: 'refresh' }),
      'not-a-jwt',
    ];
    for (const token of tokens) {
      await expectStatuses(
        () => ping({ Cookie: `access_token=${token}` }),
        1,
        200,
      );
    }
    // All four went to the IP's counter.
    await expectStatuses(() => ping(), 1, 429);
  });

  it('identifies an admin, from the cookie or the Authorization header', async () => {
    app = await createApp({
      ...secrets,
      THROTTLE_ANON_LIMIT: '1',
      THROTTLE_USER_LIMIT: '3',
    });

    const cookie = { Cookie: `admin_access_token=${adminToken('admin-a')}` };
    await expectStatuses(() => ping(cookie), 3, 200);
    await expectStatuses(() => ping(cookie), 1, 429);

    const bearer = { Authorization: `Bearer ${adminToken('admin-b')}` };
    await expectStatuses(() => ping(bearer), 3, 200);
    await expectStatuses(() => ping(bearer), 1, 429);

    const user = { Authorization: `Bearer ${userToken('user-a')}` };
    await expectStatuses(() => ping(user), 3, 200);
  });

  it.each([
    ['/auth/login', 5],
    ['/auth/forgot-password', 3],
    ['/auth/reset-password', 5],
    ['/admin/auth/login', 5],
  ])('keeps %s at %i per IP, even with valid tokens', async (path, limit) => {
    app = await createApp({ ...secrets, ...smallLimits });

    // A different signed-in caller each time: the counter is still the IP's.
    for (let index = 0; index < limit; index += 1) {
      const response = await request(server())
        .post(path)
        .set(asUser(`user-${index}`))
        .send({});
      expect(response.status).toBeLessThan(300);
    }
    const blocked = await request(server())
      .post(path)
      .set('Cookie', `admin_access_token=${adminToken('admin-a')}`)
      .send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

describe('readThrottleLimits', () => {
  it('falls back to 600 per user and 120 per anonymous IP', () => {
    expect(readThrottleLimits({})).toEqual({ anonymous: 120, user: 600 });
    expect(
      readThrottleLimits({ THROTTLE_ANON_LIMIT: ' ', THROTTLE_USER_LIMIT: '' }),
    ).toEqual({ anonymous: 120, user: 600 });
  });

  it('reads both limits', () => {
    expect(
      readThrottleLimits({
        THROTTLE_ANON_LIMIT: '60',
        THROTTLE_USER_LIMIT: ' 1000 ',
      }),
    ).toEqual({ anonymous: 60, user: 1000 });
  });

  it.each(['0', '-5', '1.5', 'abc'])('refuses %p', (value) => {
    expect(() => readThrottleLimits({ THROTTLE_USER_LIMIT: value })).toThrow(
      'THROTTLE_USER_LIMIT doit être un entier positif.',
    );
  });
});
