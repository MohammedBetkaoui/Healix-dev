import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { type PrismaService } from '../prisma/prisma.service';
import {
  allowedOrigin,
  readCookie,
  RealtimeAuthenticator,
  RealtimeRefusal,
} from './realtime-auth';
import { closeSocket, RealtimeService } from './realtime.service';
import { type RealtimeServer } from './realtime.types';

const SECRET = 'access-secret-for-tests';
const ORIGIN = 'http://localhost:3000';

describe('allowedOrigin', () => {
  it('is APP_PUBLIC_URL in production, FRONTEND_URL otherwise, as an origin', () => {
    expect(
      allowedOrigin({
        APP_PUBLIC_URL: 'https://healix.example.dz/',
        FRONTEND_URL: 'http://localhost:3000',
        NODE_ENV: 'production',
      }),
    ).toBe('https://healix.example.dz');
    expect(
      allowedOrigin({
        APP_PUBLIC_URL: 'https://healix.example.dz',
        FRONTEND_URL: 'http://localhost:3000/',
        NODE_ENV: 'development',
      }),
    ).toBe('http://localhost:3000');
    expect(allowedOrigin({})).toBe('http://localhost:3000');
  });

  it('allows nothing when production has no APP_PUBLIC_URL, or a bad one', () => {
    expect(
      allowedOrigin({ FRONTEND_URL: ORIGIN, NODE_ENV: 'production' }),
    ).toBeNull();
    expect(allowedOrigin({ FRONTEND_URL: 'not a url' })).toBeNull();
  });
});

describe('readCookie', () => {
  it('reads one cookie of the header, decoded', () => {
    expect(readCookie('a=1; access_token=abc%2Edef; b=2', 'access_token')).toBe(
      'abc.def',
    );
    expect(readCookie('refresh_token=x', 'access_token')).toBeNull();
    expect(readCookie(undefined, 'access_token')).toBeNull();
    expect(readCookie('access_token=', 'access_token')).toBeNull();
    expect(readCookie('access_token=%E0%A4%A', 'access_token')).toBeNull();
  });
});

describe('RealtimeAuthenticator', () => {
  const jwt = new JwtService();
  const findUnique = jest.fn();
  const config = {
    get: (key: string) =>
      ({ FRONTEND_URL: ORIGIN, JWT_ACCESS_SECRET: SECRET })[key],
  } as unknown as ConfigService;
  const authenticator = new RealtimeAuthenticator(
    jwt,
    { user: { findUnique } } as unknown as PrismaService,
    config,
  );
  const sign = (payload: object, expiresIn: number | '15m' = '15m') =>
    jwt.sign(payload, { expiresIn, secret: SECRET });
  const access = (overrides: object = {}) =>
    sign({
      role: 'AFFILIATED_DOCTOR',
      sub: 'user-a',
      tokenType: 'access',
      ...overrides,
    });
  const headers = (token: string | null, origin: string | null = ORIGIN) =>
    ({
      ...(origin ? { origin } : {}),
      ...(token ? { cookie: `access_token=${token}` } : {}),
    }) as Record<string, string>;

  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return (error as RealtimeRefusal).code;
    }
    return 'accepted';
  };

  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue({
      accountStatus: 'ACTIVE',
      doctorProfile: { verificationStatus: 'VERIFIED' },
      establishment: null,
    });
  });

  it('checks the Origin first, before the cookie or the database', async () => {
    expect(
      await codeOf(
        authenticator.authenticate(headers(null, 'https://evil.example')),
      ),
    ).toBe('origin_not_allowed');
    expect(
      await codeOf(authenticator.authenticate(headers(access(), null))),
    ).toBe('origin_not_allowed');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('accepts a verified professional, until the expiry of the token', async () => {
    const identity = await authenticator.authenticate(headers(access()));

    expect(identity.userId).toBe('user-a');
    expect(identity.expiresAt).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-a' } }),
    );
  });

  it.each([
    ['no cookie', () => headers(null), 'unauthorized'],
    ['a malformed token', () => headers('garbage'), 'unauthorized'],
    [
      'another secret',
      () =>
        headers(
          jwt.sign(
            { role: 'AFFILIATED_DOCTOR', sub: 'user-a', tokenType: 'access' },
            { secret: 'other' },
          ),
        ),
      'unauthorized',
    ],
    [
      'a refresh token',
      () => headers(access({ tokenType: 'refresh' })),
      'unauthorized',
    ],
    [
      'an admin role',
      () => headers(access({ role: 'SUPER_ADMIN' })),
      'unauthorized',
    ],
    [
      'an expired token',
      () =>
        headers(
          jwt.sign(
            {
              exp: Math.floor(Date.now() / 1000) - 5,
              role: 'AFFILIATED_DOCTOR',
              sub: 'user-a',
              tokenType: 'access',
            },
            { secret: SECRET },
          ),
        ),
      'token_expired',
    ],
  ])('refuses %s', async (_case, build, code) => {
    expect(await codeOf(authenticator.authenticate(build()))).toBe(code);
  });

  it.each([
    [
      'unverified',
      {
        accountStatus: 'ACTIVE',
        doctorProfile: { verificationStatus: 'PENDING_VERIFICATION' },
      },
    ],
    [
      'suspended',
      {
        accountStatus: 'SUSPENDED',
        doctorProfile: { verificationStatus: 'VERIFIED' },
      },
    ],
    [
      'rejected',
      {
        accountStatus: 'REJECTED',
        doctorProfile: { verificationStatus: 'VERIFIED' },
      },
    ],
  ])(
    'refuses a %s account (VerifiedAccountGuard rule)',
    async (_case, account) => {
      findUnique.mockResolvedValue({ establishment: null, ...account });
      expect(await codeOf(authenticator.authenticate(headers(access())))).toBe(
        'unauthorized',
      );
    },
  );
});

describe('RealtimeService', () => {
  function fakeServer(sockets: { data: { sequence: number } }[] = []) {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const fetchSockets = jest.fn().mockResolvedValue(sockets);
    const server = {
      in: jest.fn(() => ({ fetchSockets })),
      to,
    } as unknown as RealtimeServer;
    return { emit, fetchSockets, server, to };
  }

  const socket = (sequence: number) => ({
    data: { sequence },
    disconnect: jest.fn(),
    emit: jest.fn(),
  });

  it('does nothing before the gateway is up', async () => {
    const service = new RealtimeService();
    expect(() =>
      service.emitToUsers(['a'], 'conversation.updated', {
        conversationId: 'c',
      }),
    ).not.toThrow();
    await expect(service.disconnectUser('a')).resolves.toBeUndefined();
  });

  it("emits once to the users' own rooms", () => {
    const { emit, server, to } = fakeServer();
    const service = new RealtimeService();
    service.attach(server);

    service.emitToUsers(['a', 'b', 'a'], 'message.created', {
      conversationId: 'c',
      seq: 3,
    });

    expect(to).toHaveBeenCalledWith(['user:a', 'user:b']);
    expect(emit).toHaveBeenCalledWith('message.created', {
      conversationId: 'c',
      seq: 3,
    });
  });

  it('never throws when sending fails', () => {
    const { server, to } = fakeServer();
    to.mockImplementation(() => {
      throw new Error('adapter down');
    });
    const service = new RealtimeService();
    service.attach(server);

    expect(() =>
      service.emitToUsers(['a'], 'typing', {
        conversationId: 'c',
        userId: 'b',
      }),
    ).not.toThrow();
  });

  it('closes every socket of a user, telling why', async () => {
    const sockets = [socket(1), socket(2)];
    const { server } = fakeServer(sockets);
    const service = new RealtimeService();
    service.attach(server);

    await service.disconnectUser('a');

    for (const entry of sockets) {
      expect(entry.emit).toHaveBeenCalledWith('session.closed', {
        reason: 'session_ended',
      });
      expect(entry.disconnect).toHaveBeenCalledWith(true);
    }
  });

  it('never throws when the sockets cannot be listed', async () => {
    const { fetchSockets, server } = fakeServer();
    fetchSockets.mockRejectedValue(new Error('adapter down'));
    const service = new RealtimeService();
    service.attach(server);

    await expect(service.disconnectUser('a')).resolves.toBeUndefined();
  });

  it('closes the oldest sockets beyond 5', async () => {
    const sockets = [
      socket(4),
      socket(1),
      socket(6),
      socket(2),
      socket(5),
      socket(3),
      socket(7),
    ];
    const { server } = fakeServer(sockets);
    const service = new RealtimeService();
    service.attach(server);

    await service.enforceSocketLimit('a');

    const closedSequences = sockets
      .filter((entry) => entry.disconnect.mock.calls.length > 0)
      .map((entry) => entry.data.sequence);
    expect(closedSequences.sort()).toEqual([1, 2]);
  });

  it('sends the reason before closing', () => {
    const calls: string[] = [];
    closeSocket(
      {
        disconnect: () => calls.push('disconnect'),
        emit: () => calls.push('session.closed'),
      },
      'token_expired',
    );
    expect(calls).toEqual(['session.closed', 'disconnect']);
  });
});
