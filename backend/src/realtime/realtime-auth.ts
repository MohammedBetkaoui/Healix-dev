import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { type IncomingHttpHeaders } from 'node:http';

import { type UserRole } from '../common/enums/user-role.enum';
import { isVerifiedAccount } from '../common/guards/verified-account.guard';
import { MESSAGING_ROLES } from '../messaging/messaging-rules';
import { PrismaService } from '../prisma/prisma.service';
import { type RefusalCode } from './realtime.types';

type Env = Record<string, string | undefined>;

// A refused handshake. Its message, the code alone, is all the client gets.
export class RealtimeRefusal extends Error {
  constructor(readonly code: RefusalCode) {
    super(code);
    this.name = 'RealtimeRefusal';
  }
}

export type SocketIdentity = {
  userId: string;
  expiresAt: number;
};

// The origin of the application: APP_PUBLIC_URL in production (the address
// of the site behind Caddy), FRONTEND_URL in development (next dev). null
// when not set: every connection is then refused.
export function allowedOrigin(env: Env): string | null {
  const value =
    env.NODE_ENV === 'production'
      ? env.APP_PUBLIC_URL
      : (env.FRONTEND_URL ?? 'http://localhost:3000');

  try {
    return value ? new URL(value.trim()).origin : null;
  } catch {
    return null;
  }
}

export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');

    if (separator > 0 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      try {
        return value ? decodeURIComponent(value) : null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

type AccessPayload = {
  sub?: unknown;
  role?: unknown;
  tokenType?: unknown;
  exp?: unknown;
};

// The handshake of a real-time connection, checked in this order:
// a) Origin: required, and the application's own. Browsers send cookies on
//    a cross-site WebSocket, which CORS does not cover (cross-site WebSocket
//    hijacking): the Origin is the only defence.
// b) The access_token cookie, as AccessTokenStrategy checks it: secret,
//    expiry, tokenType "access".
// c) The account, as VerifiedAccountGuard: a professional of the messaging,
//    profile VERIFIED, neither suspended nor rejected.
@Injectable()
export class RealtimeAuthenticator {
  private readonly origin: string | null;
  private readonly accessSecret: string | undefined;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.origin = allowedOrigin({
      APP_PUBLIC_URL: configService.get<string>('APP_PUBLIC_URL'),
      FRONTEND_URL: configService.get<string>('FRONTEND_URL'),
      NODE_ENV: configService.get<string>('NODE_ENV'),
    });
    this.accessSecret = configService.get<string>('JWT_ACCESS_SECRET');
  }

  async authenticate(headers: IncomingHttpHeaders): Promise<SocketIdentity> {
    if (!this.origin || headers.origin !== this.origin) {
      throw new RealtimeRefusal('origin_not_allowed');
    }

    const token = readCookie(headers.cookie, 'access_token');

    if (!token || !this.accessSecret) {
      throw new RealtimeRefusal('unauthorized');
    }

    let payload: AccessPayload;
    try {
      payload = this.jwtService.verify<AccessPayload>(token, {
        secret: this.accessSecret,
      });
    } catch (error) {
      throw new RealtimeRefusal(
        error instanceof TokenExpiredError ? 'token_expired' : 'unauthorized',
      );
    }

    const { exp, role, sub, tokenType } = payload;

    if (
      tokenType !== 'access' ||
      typeof sub !== 'string' ||
      typeof exp !== 'number' ||
      !MESSAGING_ROLES.includes(role as (typeof MESSAGING_ROLES)[number]) ||
      !(await isVerifiedAccount(this.prisma, { role: role as UserRole, sub }))
    ) {
      throw new RealtimeRefusal('unauthorized');
    }

    return { expiresAt: exp * 1000, userId: sub };
  }
}
