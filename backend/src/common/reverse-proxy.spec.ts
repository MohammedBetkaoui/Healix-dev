import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

import { readCorsOptions } from './utils/cors';

@Controller('ping')
class PingController {
  @Get()
  ping(): string {
    return 'pong';
  }
}

// The same pieces as main.ts and app.module.ts: the global ThrottlerGuard,
// "trust proxy" from TRUST_PROXY, CORS from readCorsOptions.
async function createApp(
  trustProxy: string,
  env: Record<string, string> = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
    imports: [ThrottlerModule.forRoot([{ limit: 2, ttl: 60_000 }])],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', trustProxy);
  const cors = readCorsOptions(env);
  if (cors) {
    app.enableCors(cors);
  }
  await app.init();
  return app;
}

const ping = (app: INestApplication, forwardedFor: string) =>
  request(app.getHttpServer() as Parameters<typeof request>[0])
    .get('/ping')
    .set('X-Forwarded-For', forwardedFor);

describe('client IP behind the reverse proxy', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  // The test client connects from the loopback: it plays Caddy here.
  it('rate-limits each client of a trusted proxy separately', async () => {
    app = await createApp('loopback');

    await ping(app, '203.0.113.1').expect(200);
    await ping(app, '203.0.113.1').expect(200);
    await ping(app, '203.0.113.1').expect(429);
    // Another client, another counter.
    await ping(app, '203.0.113.2').expect(200);
  });

  it('ignores X-Forwarded-For from any other source', async () => {
    // Caddy's address on the edge network; the loopback is not it.
    app = await createApp('172.30.0.10');

    await ping(app, '203.0.113.1').expect(200);
    await ping(app, '203.0.113.2').expect(200);
    // A forged header does not buy a fresh counter: same sender, same limit.
    await ping(app, '203.0.113.3').expect(429);
  });
});

describe('CORS', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('is off behind the reverse proxy: no Access-Control-Allow-Origin for anyone', async () => {
    app = await createApp('loopback', {
      CORS_ENABLED: 'false',
      FRONTEND_URL: 'https://healix.example.dz',
    });

    for (const origin of [
      'https://healix.example.dz',
      'https://evil.example',
    ]) {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get('/ping')
        .set('Origin', origin);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('allows only FRONTEND_URL when enabled (frontend and API on two origins)', async () => {
    app = await createApp('loopback', {
      FRONTEND_URL: 'http://localhost:3000',
    });

    const preflight = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .options('/ping')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('readCorsOptions', () => {
  it('is null when disabled, whatever the case', () => {
    expect(readCorsOptions({ CORS_ENABLED: 'false' })).toBeNull();
    expect(readCorsOptions({ CORS_ENABLED: ' FALSE ' })).toBeNull();
  });

  it('keeps the previous default when nothing is set', () => {
    expect(readCorsOptions({})).toEqual({
      credentials: true,
      origin: 'http://localhost:3000',
    });
  });
});
