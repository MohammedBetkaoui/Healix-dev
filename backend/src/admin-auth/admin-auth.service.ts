import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type RefreshToken, type User } from '@prisma/client';
import { type Request, type Response } from 'express';
import * as bcrypt from 'bcrypt';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountStatus } from '../common/enums/account-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import {
  getAdminAccessCookieOptions,
  getAdminRefreshCookieOptions,
  getClearAdminCookieOptions,
} from '../common/utils/cookie-options';
import { type PublicAdmin, toPublicAdmin } from '../common/utils/public-user';
import { normalizeEmail, trimInput } from '../common/utils/sanitize';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { type AdminAuthenticatedUserPayload } from './types/admin-authenticated-request.type';

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AdminLoginResponse = {
  message: string;
  admin: PublicAdmin;
  redirectTo: string;
};

type AdminMeResponse = {
  admin: PublicAdmin;
};

type AdminLogoutResponse = {
  message: string;
};

type AdminRefreshResponse = {
  message: string;
  admin: PublicAdmin;
};

type AdminSessionTokens = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

type AdminSessionResult = {
  accessToken: string;
  refreshToken: string;
  publicAdmin: PublicAdmin;
};

const INVALID_ADMIN_LOGIN_MESSAGE = 'Identifiants administrateur incorrects.';

@Injectable()
export class AdminAuthService {
  private readonly accessTokenExpiresIn: string;
  private readonly accessTokenMaxAgeMs: number;
  private readonly accessTokenSecret: string;
  private readonly adminGatePath: string;
  private readonly cookieSecure: boolean;
  private readonly refreshTokenExpiresIn: string;
  private readonly refreshTokenMaxAgeMs: number;
  private readonly refreshTokenSecret: string;
  private readonly saltRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.saltRounds = this.parseSaltRounds(
      configService.get<string>('BCRYPT_SALT_ROUNDS'),
    );
    this.accessTokenSecret =
      configService.get<string>('ADMIN_JWT_ACCESS_SECRET') ??
      'change_me_admin_access_secret';
    this.refreshTokenSecret =
      configService.get<string>('ADMIN_JWT_REFRESH_SECRET') ??
      'change_me_admin_refresh_secret';
    this.accessTokenExpiresIn =
      configService.get<string>('ADMIN_JWT_ACCESS_EXPIRES_IN') ?? '10m';
    this.refreshTokenExpiresIn =
      configService.get<string>('ADMIN_JWT_REFRESH_EXPIRES_IN') ?? '12h';
    this.accessTokenMaxAgeMs = this.parseDurationToMs(
      this.accessTokenExpiresIn,
    );
    this.refreshTokenMaxAgeMs = this.parseDurationToMs(
      this.refreshTokenExpiresIn,
    );
    this.cookieSecure = this.parseBoolean(
      configService.get<string>('ADMIN_COOKIE_SECURE'),
    );
    this.adminGatePath =
      configService.get<string>('ADMIN_GATE_PATH') ?? '/hzdz-control-gate-2026';
  }

  async login(
    dto: AdminLoginDto,
    response: Response,
    context: RequestContext = {},
  ): Promise<AdminLoginResponse> {
    const email = normalizeEmail(dto.email);
    const password = trimInput(dto.password);
    const authUser = await this.usersService.findAuthUserByEmail(email);

    if (!authUser) {
      await this.logAdminLoginFailed(
        null,
        email,
        context,
        'invalid_credentials',
      );
      throw new UnauthorizedException(INVALID_ADMIN_LOGIN_MESSAGE);
    }

    if (!this.isAdminRole(authUser.role)) {
      await this.logAdminLoginFailed(
        authUser.id,
        email,
        context,
        'invalid_role',
      );
      throw new UnauthorizedException(INVALID_ADMIN_LOGIN_MESSAGE);
    }

    if (authUser.accountStatus !== AccountStatus.ACTIVE) {
      await this.logAdminLoginFailed(
        authUser.id,
        email,
        context,
        'inactive_account',
      );
      throw new UnauthorizedException(INVALID_ADMIN_LOGIN_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(
      password,
      authUser.passwordHash,
    );

    if (!passwordMatches) {
      await this.logAdminLoginFailed(
        authUser.id,
        email,
        context,
        'invalid_credentials',
      );
      throw new UnauthorizedException(INVALID_ADMIN_LOGIN_MESSAGE);
    }

    try {
      const { accessToken, refreshToken, refreshTokenExpiresAt } =
        await this.createSignedTokens(authUser);
      const refreshTokenHash = await this.hashSecret(refreshToken);

      const session = await this.prisma.$transaction(async (transaction) => {
        await transaction.refreshToken.create({
          data: {
            userId: authUser.id,
            tokenHash: refreshTokenHash,
            userAgent: context.userAgent,
            ipAddress: context.ipAddress,
            expiresAt: refreshTokenExpiresAt,
          },
        });

        await this.auditLogsService.createAuditLog(
          {
            userId: authUser.id,
            action: 'ADMIN_LOGIN_SUCCESS',
            entityType: 'ADMIN_AUTH',
            entityId: authUser.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            metadata: {
              role: authUser.role,
              accountStatus: authUser.accountStatus,
            },
          },
          transaction,
        );

        return {
          accessToken,
          refreshToken,
          publicAdmin: toPublicAdmin(authUser),
        } satisfies AdminSessionResult;
      });

      this.setAdminCookies(response, session.accessToken, session.refreshToken);

      return {
        message: 'Connexion administrateur réussie.',
        admin: session.publicAdmin,
        redirectTo: `${this.adminGatePath}/dashboard`,
      };
    } catch {
      throw new InternalServerErrorException(
        'Une erreur est survenue lors de la connexion administrateur.',
      );
    }
  }

  async getCurrentAdmin(userId: string): Promise<AdminMeResponse> {
    const authUser = await this.usersService.findAuthUserById(userId);

    if (
      !authUser ||
      !this.isAdminRole(authUser.role) ||
      authUser.accountStatus !== AccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Session administrateur invalide.');
    }

    return {
      admin: toPublicAdmin(authUser),
    };
  }

  async refreshSession(
    payload: AdminAuthenticatedUserPayload,
    response: Response,
    context: RequestContext = {},
  ): Promise<AdminRefreshResponse> {
    if (!payload.refreshToken) {
      await this.logAdminRefreshFailed(payload.sub, context, 'missing_token');
      throw new UnauthorizedException('Session administrateur invalide.');
    }

    const authUser = await this.usersService.findAuthUserById(payload.sub);

    if (
      !authUser ||
      authUser.role !== payload.role ||
      !this.isAdminRole(authUser.role) ||
      authUser.accountStatus !== AccountStatus.ACTIVE
    ) {
      await this.logAdminRefreshFailed(payload.sub, context, 'invalid_admin');
      throw new UnauthorizedException('Session administrateur invalide.');
    }

    const matchedToken = await this.findMatchingRefreshToken(
      authUser.id,
      payload.refreshToken,
    );

    if (!matchedToken) {
      await this.logAdminRefreshFailed(authUser.id, context, 'token_not_found');
      throw new UnauthorizedException('Session administrateur invalide.');
    }

    const { accessToken, refreshToken, refreshTokenExpiresAt } =
      await this.createSignedTokens(authUser);
    const refreshTokenHash = await this.hashSecret(refreshToken);

    const session = await this.prisma.$transaction(async (transaction) => {
      await transaction.refreshToken.update({
        where: { id: matchedToken.id },
        data: { revokedAt: new Date() },
      });

      await transaction.refreshToken.create({
        data: {
          userId: authUser.id,
          tokenHash: refreshTokenHash,
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
          expiresAt: refreshTokenExpiresAt,
        },
      });

      await this.auditLogsService.createAuditLog(
        {
          userId: authUser.id,
          action: 'ADMIN_REFRESH_TOKEN_USED',
          entityType: 'ADMIN_AUTH',
          entityId: authUser.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            role: authUser.role,
          },
        },
        transaction,
      );

      return {
        accessToken,
        refreshToken,
        publicAdmin: toPublicAdmin(authUser),
      } satisfies AdminSessionResult;
    });

    this.setAdminCookies(response, session.accessToken, session.refreshToken);

    return {
      message: 'Session administrateur renouvelée.',
      admin: session.publicAdmin,
    };
  }

  async logout(
    request: Request,
    response: Response,
    context: RequestContext = {},
  ): Promise<AdminLogoutResponse> {
    const refreshToken =
      request.cookies && typeof request.cookies.admin_refresh_token === 'string'
        ? request.cookies.admin_refresh_token
        : null;
    const accessToken =
      request.cookies && typeof request.cookies.admin_access_token === 'string'
        ? request.cookies.admin_access_token
        : null;

    const refreshPayload = refreshToken
      ? await this.tryVerifyToken(refreshToken, this.refreshTokenSecret)
      : null;
    const accessPayload = accessToken
      ? await this.tryVerifyToken(accessToken, this.accessTokenSecret)
      : null;
    const userId = refreshPayload?.sub ?? accessPayload?.sub ?? null;

    if (refreshToken && refreshPayload?.sub) {
      const matchedToken = await this.findMatchingRefreshToken(
        refreshPayload.sub,
        refreshToken,
      );

      if (matchedToken) {
        await this.prisma.refreshToken.update({
          where: { id: matchedToken.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    this.clearAdminCookies(response);

    if (userId) {
      await this.auditLogsService.createAuditLog({
        userId,
        action: 'ADMIN_LOGOUT',
        entityType: 'ADMIN_AUTH',
        entityId: userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    return {
      message: 'Déconnexion administrateur réussie.',
    };
  }

  private async logAdminLoginFailed(
    userId: string | null,
    email: string,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    await this.auditLogsService.createAuditLog({
      userId,
      action: 'ADMIN_LOGIN_FAILED',
      entityType: 'ADMIN_AUTH',
      entityId: userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        email: this.maskEmail(email),
        reason,
      },
    });
  }

  private async logAdminRefreshFailed(
    userId: string | null,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    await this.auditLogsService.createAuditLog({
      userId,
      action: 'ADMIN_REFRESH_TOKEN_FAILED',
      entityType: 'ADMIN_AUTH',
      entityId: userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        reason,
      },
    });
  }

  private isAdminRole(role: string): boolean {
    return (
      role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN_VERIFICATION
    );
  }

  private async createSignedTokens(
    user: Pick<User, 'id' | 'email' | 'role'>,
  ): Promise<AdminSessionTokens> {
    const accessPayload: AdminAuthenticatedUserPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenType: 'admin-access',
    };
    const refreshPayload: AdminAuthenticatedUserPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenType: 'admin-refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: Math.floor(this.accessTokenMaxAgeMs / 1_000),
        secret: this.accessTokenSecret,
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: Math.floor(this.refreshTokenMaxAgeMs / 1_000),
        secret: this.refreshTokenSecret,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: new Date(Date.now() + this.refreshTokenMaxAgeMs),
    };
  }

  private async findMatchingRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<RefreshToken | null> {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    for (const tokenRecord of activeTokens) {
      const matches = await bcrypt.compare(refreshToken, tokenRecord.tokenHash);

      if (matches) {
        return tokenRecord;
      }
    }

    return null;
  }

  private async tryVerifyToken(
    token: string,
    secret: string,
  ): Promise<AdminAuthenticatedUserPayload | null> {
    try {
      return await this.jwtService.verifyAsync<AdminAuthenticatedUserPayload>(
        token,
        {
          secret,
        },
      );
    } catch {
      return null;
    }
  }

  private async hashSecret(secret: string): Promise<string> {
    return bcrypt.hash(secret, this.saltRounds);
  }

  private setAdminCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.cookie(
      'admin_access_token',
      accessToken,
      getAdminAccessCookieOptions(this.cookieSecure, this.accessTokenMaxAgeMs),
    );
    response.cookie(
      'admin_refresh_token',
      refreshToken,
      getAdminRefreshCookieOptions(
        this.cookieSecure,
        this.refreshTokenMaxAgeMs,
      ),
    );
  }

  private clearAdminCookies(response: Response): void {
    const clearOptions = getClearAdminCookieOptions(this.cookieSecure);

    response.clearCookie('admin_access_token', clearOptions);
    response.clearCookie('admin_refresh_token', clearOptions);
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');

    if (!name || !domain) {
      return '***';
    }

    return `${name.slice(0, 2)}***@${domain}`;
  }

  private parseSaltRounds(value: string | undefined): number {
    const parsedValue = Number(value);

    if (Number.isInteger(parsedValue) && parsedValue >= 10) {
      return parsedValue;
    }

    return 12;
  }

  private parseBoolean(value: string | undefined): boolean {
    return value === 'true';
  }

  private parseDurationToMs(duration: string): number {
    const match = duration.trim().match(/^(\d+)([smhd])$/i);

    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === 's') {
      return value * 1_000;
    }

    if (unit === 'm') {
      return value * 60_000;
    }

    if (unit === 'h') {
      return value * 3_600_000;
    }

    return value * 86_400_000;
  }
}
