import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { refreshTokenMatches } from '../auth/refresh-token-hash';
import { type RequestContext } from '../common/utils/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { maskIpAddress, parseUserAgent } from './session-device';

export type AccountSession = {
  id: string;
  // The session of the request.
  current: boolean;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  // A session is one refresh token: it is renewed (a new row) each time the
  // access token is, so this is when the device last asked for a new one.
  createdAt: Date;
  expiresAt: Date;
};

const sessionNotFound = () =>
  new NotFoundException({
    code: 'SESSION_NOT_FOUND',
    message: 'Session introuvable.',
  });

// The sessions of an account are its refresh tokens that are neither revoked
// nor expired. The session of a request is the one whose refresh token comes
// with it, in the `refresh_token` cookie: that is the only thing that ties a
// request to a row (the access token is not tied to a session).
@Injectable()
export class AccountSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    userId: string,
    refreshToken: string | null,
  ): Promise<AccountSession[]> {
    const sessions = await this.activeSessions(userId);
    const currentId = await this.currentIdAmong(sessions, refreshToken);

    return sessions.map((session) => ({
      id: session.id,
      current: session.id === currentId,
      ...parseUserAgent(session.userAgent),
      ipAddress: maskIpAddress(session.ipAddress),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  // The id of the session the request comes from, null when it brings no
  // refresh token or one that matches no active session.
  async findCurrentSessionId(
    userId: string,
    refreshToken: string | null,
  ): Promise<string | null> {
    if (!refreshToken) {
      return null;
    }

    return this.currentIdAmong(await this.activeSessions(userId), refreshToken);
  }

  async revoke(
    userId: string,
    sessionId: string,
    refreshToken: string | null,
    context: Partial<RequestContext> = {},
  ): Promise<{ revoked: number }> {
    // Another user's session is not found: the same answer as for an id that
    // does not exist.
    const session = await this.prisma.refreshToken.findFirst({
      select: { id: true, tokenHash: true },
      where: {
        expiresAt: { gt: new Date() },
        id: sessionId,
        revokedAt: null,
        userId,
      },
    });

    if (!session) {
      throw sessionNotFound();
    }

    if (
      refreshToken &&
      (await refreshTokenMatches(refreshToken, session.tokenHash))
    ) {
      throw new BadRequestException({
        code: 'CURRENT_SESSION',
        message:
          'Il s’agit de votre session actuelle : utilisez la déconnexion.',
      });
    }

    const { count } = await this.prisma.refreshToken.updateMany({
      data: { revokedAt: new Date() },
      where: { id: session.id, revokedAt: null, userId },
    });

    if (count !== 1) {
      throw sessionNotFound();
    }

    await this.auditLogsService.createAuditLog({
      action: 'SESSION_REVOKED',
      entityId: session.id,
      entityType: 'REFRESH_TOKEN',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      userId,
    });
    // The sockets of the user are not tied to a session: all are closed, the
    // devices that keep a session open reconnect by themselves.
    await this.realtime.disconnectUser(userId);

    return { revoked: 1 };
  }

  async revokeOthers(
    userId: string,
    refreshToken: string | null,
    context: Partial<RequestContext> = {},
  ): Promise<{ revoked: number }> {
    const currentId = await this.findCurrentSessionId(userId, refreshToken);

    // Without the current session, "the others" would be all of them,
    // including the one asking.
    if (!currentId) {
      throw new BadRequestException({
        code: 'CURRENT_SESSION_UNKNOWN',
        message:
          'Votre session actuelle n’a pas pu être identifiée : reconnectez-vous.',
      });
    }

    const { count } = await this.prisma.refreshToken.updateMany({
      data: { revokedAt: new Date() },
      where: { id: { not: currentId }, revokedAt: null, userId },
    });

    if (count > 0) {
      await this.auditLogsService.createAuditLog({
        action: 'SESSIONS_REVOKED',
        entityId: userId,
        entityType: 'USER',
        ipAddress: context.ipAddress,
        metadata: { revokedSessions: count },
        userAgent: context.userAgent,
        userId,
      });
      await this.realtime.disconnectUser(userId);
    }

    return { revoked: count };
  }

  private activeSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        ipAddress: true,
        tokenHash: true,
        userAgent: true,
      },
      where: { expiresAt: { gt: new Date() }, revokedAt: null, userId },
    });
  }

  // The hashes are bcrypt ones: compared in parallel (a few sessions at most).
  private async currentIdAmong(
    sessions: { id: string; tokenHash: string }[],
    refreshToken: string | null,
  ): Promise<string | null> {
    if (!refreshToken) {
      return null;
    }

    const matches = await Promise.all(
      sessions.map((session) =>
        refreshTokenMatches(refreshToken, session.tokenHash),
      ),
    );

    return sessions[matches.indexOf(true)]?.id ?? null;
  }
}
