import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { type Payment, type Prisma, type Subscription } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountStatus } from '../common/enums/account-status.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { BillingPeriod } from '../common/enums/billing-period.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type AccountSubscriptionContext = {
  accountStatus: string;
  accountType: AccountType;
  subscriptionStatus: string;
  verificationStatus: string;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getMySubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      include: {
        doctorProfile: true,
        establishment: true,
        subscriptions: {
          include: {
            plan: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const context = this.getAccountContextFromUser(user);
    const currentSubscription = user.subscriptions[0] ?? null;

    return {
      ...context,
      currentSubscription: currentSubscription
        ? this.toPublicSubscription(currentSubscription)
        : null,
    };
  }

  async activateSubscriptionForPayment(
    payment: Payment,
    client: PrismaExecutor = this.prisma,
  ): Promise<Subscription> {
    const existingActiveSubscription = await client.subscription.findFirst({
      where: {
        status: SubscriptionStatus.ACTIVE,
        userId: payment.userId,
      },
    });

    const now = new Date();
    const expiresAt = this.calculateExpiry(now, payment.billingPeriod);

    if (existingActiveSubscription) {
      return client.subscription.update({
        data: {
          billingPeriod: payment.billingPeriod,
          canceledAt: null,
          expiresAt,
          planId: payment.planId,
          startedAt: now,
          status: SubscriptionStatus.ACTIVE,
        },
        where: {
          id: existingActiveSubscription.id,
        },
      });
    }

    return client.subscription.create({
      data: {
        accountType: payment.accountType,
        billingPeriod: payment.billingPeriod,
        expiresAt,
        planId: payment.planId,
        startedAt: now,
        status: SubscriptionStatus.ACTIVE,
        userId: payment.userId,
      },
    });
  }

  async updateAccountToActive(
    userId: string,
    accountType: AccountType,
    client: PrismaExecutor = this.prisma,
  ): Promise<void> {
    await client.user.update({
      data: {
        accountStatus: AccountStatus.ACTIVE,
      },
      where: {
        id: userId,
      },
    });

    if (accountType === AccountType.ESTABLISHMENT) {
      await client.establishment.update({
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        },
        where: {
          ownerId: userId,
        },
      });
      return;
    }

    await client.doctorProfile.update({
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
      where: {
        userId,
      },
    });
  }

  // Run hourly by SubscriptionExpiryScheduler. Starts from Subscription rows,
  // never from User.accountStatus: affiliated doctors are ACTIVE without any
  // Subscription and must not be touched. Idempotent, since an expired row is
  // no longer ACTIVE. Returns how many subscriptions were expired.
  async expireDueSubscriptions(now: Date = new Date()): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const dueSubscriptions = await transaction.subscription.findMany({
        select: { accountType: true, id: true, userId: true },
        where: {
          expiresAt: { lt: now },
          status: SubscriptionStatus.ACTIVE,
        },
      });
      let expiredCount = 0;

      for (const subscription of dueSubscriptions) {
        // Re-checked per row: a renewal approved since the select keeps the
        // row ACTIVE but moves expiresAt forward, and must win.
        const { count } = await transaction.subscription.updateMany({
          data: { status: SubscriptionStatus.EXPIRED },
          where: {
            expiresAt: { lt: now },
            id: subscription.id,
            status: SubscriptionStatus.ACTIVE,
          },
        });

        if (count === 0) {
          continue;
        }

        expiredCount += 1;

        // activateSubscriptionForPayment keeps one ACTIVE row per user, but
        // nothing enforces it in the schema: never downgrade an account that
        // still holds another active subscription.
        const remainingActive = await transaction.subscription.count({
          where: {
            status: SubscriptionStatus.ACTIVE,
            userId: subscription.userId,
          },
        });

        if (remainingActive === 0) {
          await this.updateAccountToExpired(
            subscription.userId,
            subscription.accountType,
            transaction,
          );
        }

        // System action: no acting user (same as an unattributed failed
        // login), the account concerned goes in metadata.
        await this.auditLogsService.createAuditLog(
          {
            action: 'SUBSCRIPTION_EXPIRED',
            entityId: subscription.id,
            entityType: 'SUBSCRIPTION',
            metadata: { userId: subscription.userId },
          },
          transaction,
        );
      }

      return expiredCount;
    });
  }

  assertCanStartPayment(context: AccountSubscriptionContext): void {
    if (context.accountStatus === AccountStatus.SUSPENDED) {
      throw new ForbiddenException(
        "Votre compte est suspendu. Veuillez contacter l'administration.",
      );
    }

    if (context.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Votre compte doit etre verifie avant de choisir un abonnement.',
      );
    }

    if (
      context.accountStatus !== AccountStatus.VERIFIED_NO_PLAN &&
      context.accountStatus !== AccountStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        "Votre statut actuel ne permet pas d'activer un abonnement.",
      );
    }
  }

  getAccountContextFromUser(user: {
    accountStatus: string;
    role: string;
    establishment?: {
      subscriptionStatus: string;
      verificationStatus: string;
    } | null;
    doctorProfile?: {
      subscriptionStatus: string;
      verificationStatus: string;
    } | null;
  }): AccountSubscriptionContext {
    if (user.role === UserRole.ESTABLISHMENT_ADMIN) {
      if (!user.establishment) {
        throw new NotFoundException('Etablissement introuvable.');
      }

      return {
        accountStatus: user.accountStatus,
        accountType: AccountType.ESTABLISHMENT,
        subscriptionStatus: user.establishment.subscriptionStatus,
        verificationStatus: user.establishment.verificationStatus,
      };
    }

    if (user.role === UserRole.INDEPENDENT_DOCTOR) {
      if (!user.doctorProfile) {
        throw new NotFoundException('Profil medecin introuvable.');
      }

      return {
        accountStatus: user.accountStatus,
        accountType: AccountType.INDEPENDENT_DOCTOR,
        subscriptionStatus: user.doctorProfile.subscriptionStatus,
        verificationStatus: user.doctorProfile.verificationStatus,
      };
    }

    throw new BadRequestException('Type de compte non pris en charge.');
  }

  // Mirror of updateAccountToActive. updateMany rather than update: a missing
  // profile row must not throw and roll back every other expiry of the run.
  private async updateAccountToExpired(
    userId: string,
    accountType: AccountType,
    client: PrismaExecutor,
  ): Promise<void> {
    // Only an account still ACTIVE falls back to VERIFIED_NO_PLAN (the status
    // assertCanStartPayment accepts); a SUSPENDED one, for instance, stays so.
    await client.user.updateMany({
      data: { accountStatus: AccountStatus.VERIFIED_NO_PLAN },
      where: { accountStatus: AccountStatus.ACTIVE, id: userId },
    });

    if (accountType === AccountType.ESTABLISHMENT) {
      await client.establishment.updateMany({
        data: { subscriptionStatus: SubscriptionStatus.EXPIRED },
        where: { ownerId: userId },
      });
      return;
    }

    await client.doctorProfile.updateMany({
      data: { subscriptionStatus: SubscriptionStatus.EXPIRED },
      where: { userId },
    });
  }

  private calculateExpiry(startDate: Date, billingPeriod: string): Date {
    const expiresAt = new Date(startDate);

    if (billingPeriod === BillingPeriod.ANNUAL) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      return expiresAt;
    }

    expiresAt.setMonth(expiresAt.getMonth() + 1);
    return expiresAt;
  }

  private toPublicSubscription(
    subscription: Subscription & {
      plan: {
        id: string;
        name: string;
        code: string;
        monthlyPrice: number | null;
        annualPrice: number | null;
        currency: string;
      };
    },
  ) {
    return {
      id: subscription.id,
      status: subscription.status,
      billingPeriod: subscription.billingPeriod,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
      plan: subscription.plan,
    };
  }
}
