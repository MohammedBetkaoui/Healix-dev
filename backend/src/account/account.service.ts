import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthService } from '../auth/auth.service';
import { type RequestContext } from '../common/utils/request-context';
import { MailService } from '../mail/mail.service';
import { passwordChangedEmail } from '../mail/templates/password-reset.templates';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  type AccountKind,
  type AccountProfile,
  accountKindOf,
  accountProfileSelect,
  fieldsOfKind,
  type ProfileField,
  toAccountProfile,
} from './account-profile.mapper';
import { AccountSessionsService } from './account-sessions.service';
import { type ChangePasswordDto } from './dto/change-password.dto';
import { type UpdateAccountProfileDto } from './dto/update-account-profile.dto';

export const PASSWORD_CHANGED_MESSAGE = 'Votre mot de passe a été modifié.';

const PROFILE_FIELDS: readonly ProfileField[] = [
  'fullName',
  'speciality',
  'wilaya',
  'establishmentName',
  'establishmentType',
  'phone',
  'address',
];

// What each field holds today, to tell a field that changes from one that is
// sent back as it is (a form sends all of its fields). Only the doctor-kind
// fields can come from a professional profile now: an establishment account
// edits its user-level data only.
function currentValues(
  profile: AccountProfile,
): Record<ProfileField, string | undefined> {
  return {
    address: profile.doctor?.address,
    establishmentName: undefined,
    establishmentType: undefined,
    fullName: profile.fullName,
    phone: profile.phone,
    speciality: profile.doctor?.speciality,
    wilaya: profile.doctor?.wilaya,
  };
}

function isUniqueViolationOn(error: unknown, column: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;
  return (Array.isArray(target) ? target.join(' ') : String(target)).includes(
    column,
  );
}

const phoneAlreadyUsed = () =>
  new ConflictException({
    code: 'PHONE_ALREADY_USED',
    message: 'Ce numéro de téléphone est déjà utilisé.',
  });

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly sessions: AccountSessionsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly mailService: MailService,
    private readonly realtime: RealtimeService,
  ) {}

  async getProfile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({
      select: accountProfileSelect,
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Session invalide.');
    }

    return toAccountProfile(user);
  }

  // Phone and address are always editable. The identity the verification
  // checked (name, speciality, establishment name and type, wilaya) is not,
  // once the account is VERIFIED. The e-mail is the login: it is not here.
  async updateProfile(
    userId: string,
    dto: UpdateAccountProfileDto,
    context: Partial<RequestContext> = {},
  ): Promise<AccountProfile> {
    const profile = await this.getProfile(userId);
    const kind = accountKindOf(profile.role) as AccountKind;
    const requested = PROFILE_FIELDS.filter(
      (field) => dto[field] !== undefined,
    );

    const notApplicable = requested.filter(
      (field) => !fieldsOfKind(kind).includes(field),
    );
    if (notApplicable.length > 0) {
      throw new BadRequestException({
        code: 'PROFILE_FIELD_NOT_APPLICABLE',
        fields: notApplicable,
        message: 'Ce champ ne concerne pas votre type de compte.',
      });
    }

    const today = currentValues(profile);
    const changed = requested.filter((field) => dto[field] !== today[field]);

    const locked = changed.filter((field) =>
      profile.lockedFields.includes(field),
    );
    if (locked.length > 0) {
      throw new ConflictException({
        code: 'PROFILE_FIELD_LOCKED',
        fields: locked,
        message:
          'Ces informations ont été vérifiées : elles se modifient par une nouvelle demande de vérification.',
      });
    }

    if (changed.length === 0) {
      return profile;
    }

    if (changed.includes('phone')) {
      await this.assertPhoneAvailable(userId, dto.phone as string);
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.writeProfile(transaction, userId, kind, dto, changed);
        await this.auditLogsService.createAuditLog(
          {
            action: 'ACCOUNT_PROFILE_UPDATED',
            entityId: userId,
            entityType: 'USER',
            ipAddress: context.ipAddress,
            // The fields only: the values are personal data.
            metadata: { fields: changed },
            userAgent: context.userAgent,
            userId,
          },
          transaction,
        );
      });
    } catch (error) {
      if (isUniqueViolationOn(error, 'phone')) {
        throw phoneAlreadyUsed();
      }

      throw error;
    }

    return this.getProfile(userId);
  }

  // The current password is required. The other sessions are closed, the
  // current one (the one whose refresh token comes with the request) stays.
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    refreshToken: string | null,
    context: Partial<RequestContext> = {},
  ): Promise<{
    keptCurrentSession: boolean;
    message: string;
    revokedSessions: number;
  }> {
    const user = await this.prisma.user.findUnique({
      select: { email: true, fullName: true, id: true, passwordHash: true },
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Session invalide.');
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      await this.auditLogsService.createAuditLog({
        action: 'PASSWORD_CHANGE_FAILED',
        entityId: userId,
        entityType: 'USER',
        ipAddress: context.ipAddress,
        metadata: { reason: 'CURRENT_PASSWORD_INVALID' },
        userAgent: context.userAgent,
        userId,
      });

      throw new BadRequestException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Le mot de passe actuel est incorrect.',
      });
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException({
        code: 'NEW_PASSWORD_SAME_AS_CURRENT',
        message: 'Le nouveau mot de passe doit être différent de l’ancien.',
      });
    }

    // Hashed exactly like at registration and at reset. The session is looked
    // up last, right before the write: the less time between the two, the less
    // a session opened meanwhile is missed.
    const passwordHash = await this.authService.hashPassword(dto.newPassword);
    const currentSessionId = await this.sessions.findCurrentSessionId(
      userId,
      refreshToken,
    );
    const changedAt = new Date();

    const revokedSessions = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.user.update({
          data: { passwordHash },
          where: { id: userId },
        });

        // Any reset link still in a mailbox stops working.
        await transaction.passwordResetToken.updateMany({
          data: { expiresAt: changedAt },
          where: { expiresAt: { gt: changedAt }, usedAt: null, userId },
        });

        const revoked = await transaction.refreshToken.updateMany({
          data: { revokedAt: changedAt },
          where: {
            revokedAt: null,
            userId,
            ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
          },
        });

        await this.auditLogsService.createAuditLog(
          {
            action: 'PASSWORD_CHANGED',
            entityId: userId,
            entityType: 'USER',
            ipAddress: context.ipAddress,
            metadata: {
              keptCurrentSession: currentSessionId !== null,
              revokedSessions: revoked.count,
            },
            userAgent: context.userAgent,
            userId,
          },
          transaction,
        );

        return revoked.count;
      },
    );

    // Every socket of the user is closed; the device that keeps its session
    // reconnects by itself, the others cannot.
    await this.realtime.disconnectUser(userId);

    try {
      await this.mailService.send({
        ...passwordChangedEmail({
          changedAt,
          fullName: user.fullName,
          keptCurrentSession: currentSessionId !== null,
        }),
        to: user.email,
      });
    } catch (error) {
      // The password is changed either way; a lost notice is only logged.
      this.logger.error(
        'Password changed notice could not be sent.',
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      keptCurrentSession: currentSessionId !== null,
      message: PASSWORD_CHANGED_MESSAGE,
      revokedSessions,
    };
  }

  private async assertPhoneAvailable(
    userId: string,
    phone: string,
  ): Promise<void> {
    const owner = await this.prisma.user.findUnique({
      select: { id: true },
      where: { phone },
    });

    if (owner && owner.id !== userId) {
      throw phoneAlreadyUsed();
    }
  }

  private async writeProfile(
    transaction: Prisma.TransactionClient,
    userId: string,
    kind: AccountKind,
    dto: UpdateAccountProfileDto,
    changed: readonly ProfileField[],
  ): Promise<void> {
    const has = (field: ProfileField) => changed.includes(field);

    await transaction.user.update({
      data: {
        ...(has('fullName') ? { fullName: dto.fullName } : {}),
        // A new number is not the one that was verified.
        ...(has('phone') ? { isPhoneVerified: false, phone: dto.phone } : {}),
      },
      where: { id: userId },
    });

    if (kind === 'DOCTOR') {
      await transaction.doctorProfile.update({
        data: {
          ...(has('speciality') ? { speciality: dto.speciality } : {}),
          ...(has('wilaya') ? { wilaya: dto.wilaya } : {}),
          ...(has('address') ? { professionalAddress: dto.address } : {}),
        },
        where: { userId },
      });

      // The private practice is named after the doctor, as at registration.
      if (has('fullName') && dto.fullName) {
        await transaction.workspace.updateMany({
          data: { name: dto.fullName },
          where: { ownerDoctorProfile: { userId } },
        });
      }
    }
    // An establishment account stops here: the establishment row, its
    // professional contacts and its workspace name are the organization
    // module's concern, and the manager's name is not the legal
    // representative of the establishment.
  }
}
