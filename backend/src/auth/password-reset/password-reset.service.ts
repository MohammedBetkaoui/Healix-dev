import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { type RequestContext } from '../../common/utils/request-context';
import { MailService } from '../../mail/mail.service';
import {
  passwordChangedEmail,
  passwordResetRequestEmail,
} from '../../mail/templates/password-reset.templates';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';

export const RESET_TOKEN_TTL_MINUTES = 30;
export const RESET_EMAILS_PER_ACCOUNT_PER_HOUR = 3;
export const RESET_TOKEN_RETENTION_DAYS = 7;
// Every forgot-password answer takes at least this long, so that the time
// taken does not tell an existing account from an unknown one.
export const FORGOT_PASSWORD_MIN_RESPONSE_MS = 500;

export const FORGOT_PASSWORD_MESSAGE =
  "Si un compte existe pour cette adresse, un e-mail vient d'être envoyé. Le lien est valable 30 minutes.";
export const RESET_TOKEN_INVALID_MESSAGE =
  'Ce lien de réinitialisation est invalide ou a expiré. Faites une nouvelle demande.';
export const PASSWORD_RESET_DONE_MESSAGE =
  'Votre mot de passe a été modifié. Connectez-vous avec votre nouveau mot de passe.';

const MINUTE_MS = 60_000;
const TOKEN_BYTES = 32;
// 32 bytes in base64url, without padding.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Accounts of the application only: the back-office admins (admin-auth) are
// excluded, and so are accounts that cannot log in anyway.
const SELF_SERVICE_ROLES: readonly string[] = [
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.INDEPENDENT_DOCTOR,
  UserRole.AFFILIATED_DOCTOR,
];
const BLOCKED_STATUSES: readonly string[] = [
  AccountStatus.SUSPENDED,
  AccountStatus.REJECTED,
];

type ResetCandidate = {
  accountStatus: string;
  email: string;
  fullName: string;
  id: string;
  role: string;
};

type ForgotPasswordOutcome =
  | 'EMAIL_SENT'
  | 'UNKNOWN_ACCOUNT'
  | 'ACCOUNT_NOT_ELIGIBLE'
  | 'ACCOUNT_LIMIT_REACHED';

const candidateSelect = {
  accountStatus: true,
  email: true,
  fullName: true,
  id: true,
  role: true,
} as const;

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function canResetPassword(user: ResetCandidate): boolean {
  return (
    SELF_SERVICE_ROLES.includes(user.role) &&
    !BLOCKED_STATUSES.includes(user.accountStatus)
  );
}

const invalidToken = () =>
  new BadRequestException({
    code: 'RESET_TOKEN_INVALID',
    message: RESET_TOKEN_INVALID_MESSAGE,
  });

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogsService: AuditLogsService,
    private readonly mailService: MailService,
  ) {}

  // Always the same answer, after at least the same time, whether the
  // address belongs to an account or not.
  async requestReset(
    email: string,
    context: Partial<RequestContext> = {},
  ): Promise<{ message: string }> {
    const startedAt = Date.now();

    try {
      await this.handleRequest(email, context);
    } catch (error) {
      // A failure must not show either: it is logged, the answer is the same.
      this.logger.error(
        'Password reset request failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.waitUntil(startedAt + FORGOT_PASSWORD_MIN_RESPONSE_MS);

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(
    input: { password: string; token: string },
    context: Partial<RequestContext> = {},
  ): Promise<{ message: string }> {
    if (!TOKEN_PATTERN.test(input.token)) {
      throw invalidToken();
    }

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(input.token) },
      include: { user: { select: candidateSelect } },
    });

    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= Date.now() ||
      !canResetPassword(record.user)
    ) {
      throw invalidToken();
    }

    // Hashed exactly like at registration.
    const passwordHash = await this.authService.hashPassword(input.password);
    const changedAt = new Date();
    const userId = record.userId;

    await this.prisma.$transaction(async (transaction) => {
      // Claimed under condition: of two concurrent requests with the same
      // token, only one changes the password.
      const claimed = await transaction.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: changedAt } },
        data: { usedAt: changedAt },
      });

      if (claimed.count !== 1) {
        throw invalidToken();
      }

      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Any other link still in a mailbox stops working.
      await transaction.passwordResetToken.updateMany({
        where: { userId, usedAt: null, expiresAt: { gt: changedAt } },
        data: { expiresAt: changedAt },
      });

      // Every session of the account is closed.
      const revoked = await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: changedAt },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'PASSWORD_RESET_COMPLETED',
          entityType: 'USER',
          entityId: userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { revokedSessions: revoked.count },
          userId,
        },
        transaction,
      );
    });

    try {
      await this.mailService.send({
        ...passwordChangedEmail({ changedAt, fullName: record.user.fullName }),
        to: record.user.email,
      });
    } catch (error) {
      // The password is changed either way; a lost notice is only logged.
      this.logger.error(
        'Password changed notice could not be sent.',
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { message: PASSWORD_RESET_DONE_MESSAGE };
  }

  // Tokens expired for more than RESET_TOKEN_RETENTION_DAYS, used or not.
  async purgeExpiredTokens(now = new Date()): Promise<number> {
    const { count } = await this.prisma.passwordResetToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(
            now.getTime() - RESET_TOKEN_RETENTION_DAYS * 24 * 60 * MINUTE_MS,
          ),
        },
      },
    });

    return count;
  }

  protected async waitUntil(deadline: number): Promise<void> {
    const remaining = deadline - Date.now();

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  private async handleRequest(
    email: string,
    context: Partial<RequestContext>,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: candidateSelect,
    });
    let outcome: ForgotPasswordOutcome;
    let token: string | null = null;

    if (!user) {
      outcome = 'UNKNOWN_ACCOUNT';
    } else if (!canResetPassword(user)) {
      outcome = 'ACCOUNT_NOT_ELIGIBLE';
    } else if (await this.accountLimitReached(user.id)) {
      outcome = 'ACCOUNT_LIMIT_REACHED';
    } else {
      token = await this.issueToken(user.id, context.ipAddress ?? null);
      outcome = 'EMAIL_SENT';
    }

    // Never the token, nor its hash.
    await this.auditLogsService.createAuditLog({
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'AUTH',
      entityId: user?.id ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: user ? { outcome } : { email, outcome },
      userId: user?.id ?? null,
    });

    if (user && token) {
      // Not awaited: the SMTP round trip would make an existing account
      // answer later than an unknown address.
      const resetUrl = `${this.mailService.publicUrl}/reset-password?token=${token}`;
      void this.mailService
        .send({
          ...passwordResetRequestEmail({
            expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
            fullName: user.fullName,
            resetUrl,
          }),
          to: user.email,
        })
        .catch((error: unknown) => {
          this.logger.error(
            'Password reset e-mail could not be sent.',
            error instanceof Error ? error.stack : String(error),
          );
        });
    }
  }

  // At most RESET_EMAILS_PER_ACCOUNT_PER_HOUR e-mails per account and per
  // hour, counted in the database: one token is one e-mail.
  private async accountLimitReached(userId: string): Promise<boolean> {
    const sentLastHour = await this.prisma.passwordResetToken.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 60 * MINUTE_MS) },
      },
    });

    return sentLastHour >= RESET_EMAILS_PER_ACCOUNT_PER_HOUR;
  }

  private async issueToken(
    userId: string,
    requestIp: string | null,
  ): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      // Only the latest link works.
      await transaction.passwordResetToken.updateMany({
        where: { userId, usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });

      await transaction.passwordResetToken.create({
        data: {
          expiresAt: new Date(
            now.getTime() + RESET_TOKEN_TTL_MINUTES * MINUTE_MS,
          ),
          requestIp,
          tokenHash: hashResetToken(token),
          userId,
        },
      });
    });

    return token;
  }
}
