import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  Throttle,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

import { UserRole } from '../enums/user-role.enum';

type Env = Record<string, string | undefined>;

export const DEFAULT_THROTTLE_USER_LIMIT = 600;
export const DEFAULT_THROTTLE_ANON_LIMIT = 120;

export type ThrottleLimits = {
  // Requests per minute and per route of a caller with a valid access token.
  user: number;
  // Requests per minute and per route of one IP without one.
  anonymous: number;
};

function readLimit(env: Env, name: string, fallback: number): number {
  const value = env[name]?.trim();

  if (!value) {
    return fallback;
  }

  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${name} doit être un entier positif.`);
  }

  return Number(value);
}

export function readThrottleLimits(env: Env): ThrottleLimits {
  return {
    anonymous: readLimit(
      env,
      'THROTTLE_ANON_LIMIT',
      DEFAULT_THROTTLE_ANON_LIMIT,
    ),
    user: readLimit(env, 'THROTTLE_USER_LIMIT', DEFAULT_THROTTLE_USER_LIMIT),
  };
}

type ThrottledRequest = {
  cookies?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type TokenPayload = { role?: unknown; sub?: unknown; tokenType?: unknown };

export const trackByIp = (req: Record<string, any>): string =>
  `ip:${(req as ThrottledRequest).ip}`;

// A route's own limit, counted per IP whatever token comes with the request:
// for the endpoints where a token would buy an attacker extra attempts at
// guessing a password or a reset token, or at sending e-mails.
export const ThrottlePerIp = ({ limit, ttl }: { limit: number; ttl: number }) =>
  Throttle({ default: { getTracker: trackByIp, limit, ttl } });

const ADMIN_ROLES: readonly unknown[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN_VERIFICATION,
];

// The checks of the passport strategies' validate().
const isUserAccess = (payload: TokenPayload) => payload.tokenType === 'access';

const isAdminAccess = (payload: TokenPayload) =>
  payload.tokenType === 'admin-access' && ADMIN_ROLES.includes(payload.role);

function readBearerToken(req: ThrottledRequest): string | null {
  const header = req.headers.authorization;
  const match =
    typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  return match ? match[1] : null;
}

function readCookie(req: ThrottledRequest, name: string): string | null {
  const value = req.cookies?.[name];
  return typeof value === 'string' && value ? value : null;
}

// Rate limits per caller instead of per IP: behind one address (an office,
// the frontend container whose Next.js server checks every session) each
// signed-in user keeps a counter of their own. The token is verified as the
// passport strategies do (secret, expiry, token type); an invalid or expired
// one counts as no token at all. A route's own @Throttle limit is unchanged.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly limits: ThrottleLimits;
  private readonly userSecret: string | undefined;
  private readonly adminSecret: string | undefined;
  // The tracker of each request, computed once for its limit and its key.
  private readonly trackers = new WeakMap<object, string>();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    super(options, storageService, reflector);
    this.limits = readThrottleLimits({
      THROTTLE_ANON_LIMIT: configService.get<string>('THROTTLE_ANON_LIMIT'),
      THROTTLE_USER_LIMIT: configService.get<string>('THROTTLE_USER_LIMIT'),
    });
    this.userSecret = configService.get<string>('JWT_ACCESS_SECRET');
    this.adminSecret = configService.get<string>('ADMIN_JWT_ACCESS_SECRET');
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    // Only a route without a limit of its own reads the default one: the
    // guard looks for the route's @Throttle first.
    this.throttlers = this.throttlers.map((throttler) => ({
      ...throttler,
      limit: (context: ExecutionContext) =>
        this.trackerOf(context.switchToHttp().getRequest()).startsWith('ip:')
          ? this.limits.anonymous
          : this.limits.user,
    }));
  }

  // "user:<sub>", "admin:<sub>", else "ip:<address>".
  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(this.trackerOf(req));
  }

  private trackerOf(req: Record<string, any>): string {
    let tracker = this.trackers.get(req);

    if (tracker === undefined) {
      tracker = this.identify(req as ThrottledRequest) ?? trackByIp(req);
      this.trackers.set(req, tracker);
    }

    return tracker;
  }

  private identify(req: ThrottledRequest): string | null {
    const bearer = readBearerToken(req);

    for (const token of [readCookie(req, 'access_token'), bearer]) {
      const sub = token && this.verify(token, this.userSecret, isUserAccess);
      if (sub) return `user:${sub}`;
    }

    for (const token of [readCookie(req, 'admin_access_token'), bearer]) {
      const sub = token && this.verify(token, this.adminSecret, isAdminAccess);
      if (sub) return `admin:${sub}`;
    }

    return null;
  }

  private verify(
    token: string,
    secret: string | undefined,
    accepts: (payload: TokenPayload) => boolean,
  ): string | null {
    if (!secret) {
      return null;
    }

    try {
      const payload = this.jwtService.verify<TokenPayload>(token, { secret });
      return accepts(payload) && typeof payload.sub === 'string' && payload.sub
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }
}
