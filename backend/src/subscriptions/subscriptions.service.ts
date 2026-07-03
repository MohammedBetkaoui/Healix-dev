import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { type Payment, type Prisma, type Subscription } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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
    establishment?: { subscriptionStatus: string; verificationStatus: string } | null;
    doctorProfile?: { subscriptionStatus: string; verificationStatus: string } | null;
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
