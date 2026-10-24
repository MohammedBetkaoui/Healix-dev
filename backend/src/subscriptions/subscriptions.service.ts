import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import {
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
  type Payment,
  Prisma,
  type Subscription,
  type SubscriptionEventType,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountStatus } from '../common/enums/account-status.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { BillingPeriod } from '../common/enums/billing-period.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import { NotificationProducerService } from '../notifications/notification-producer.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  findCurrentSubscription,
  lockCurrentSubscription,
} from './current-subscription';
import {
  TRIAL_DURATION_DAYS,
  TRIAL_REFERENCE_PLAN_CODES,
} from './plans/plan-quotas';
import { addDays } from './subscription-period';
import {
  planPurchase,
  type PurchaseEventType,
} from './subscription-transitions';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type AccountSubscriptionContext = {
  accountStatus: string;
  accountType: AccountType;
  subscriptionStatus: string;
  verificationStatus: string;
};

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SubscriptionEventInput = {
  subscriptionId: string;
  type: SubscriptionEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromPlanId?: string | null;
  toPlanId?: string | null;
  fromExpiresAt?: Date | null;
  toExpiresAt?: Date | null;
  paymentId?: string | null;
  actorId?: string | null;
  reason?: string | null;
};

// What a purchase did: the caller sends the notification once its transaction
// has committed (notifyPurchase), never before.
export type PurchaseOutcome = {
  subscription: Subscription;
  type: PurchaseEventType;
  endedTrial: boolean;
  paymentId: string;
  userId: string;
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    @Optional()
    private readonly notificationProducer?: NotificationProducerService,
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
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  // What the account has paid and what happened to its subscription, for its
  // subscription page. The reasons and the names of the administrators who
  // acted are not shown to the customer, only that an administrator did.
  async getMyHistory(userId: string) {
    const [payments, events] = await Promise.all([
      this.prisma.payment.findMany({
        include: { plan: { select: { code: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        where: { userId },
      }),
      this.prisma.subscriptionEvent.findMany({
        include: {
          fromPlan: { select: { code: true, name: true } },
          payment: { select: { reference: true } },
          toPlan: { select: { code: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        where: { subscription: { userId } },
      }),
    ]);

    return {
      events: events.map((event) => ({
        byAdministrator: event.actorId !== null && event.paymentId === null,
        createdAt: event.createdAt,
        fromExpiresAt: event.fromExpiresAt,
        fromPlan: event.fromPlan,
        fromStatus: event.fromStatus,
        id: event.id,
        paymentReference: event.payment?.reference ?? null,
        toExpiresAt: event.toExpiresAt,
        toPlan: event.toPlan,
        toStatus: event.toStatus,
        type: event.type,
      })),
      payments: payments.map((payment) => ({
        amount: payment.amount,
        billingPeriod: payment.billingPeriod,
        cardLast4: payment.cardLast4,
        createdAt: payment.createdAt,
        currency: payment.currency,
        id: payment.id,
        method: payment.method,
        paidAt: payment.paidAt,
        plan: payment.plan,
        reference: payment.reference,
        status: payment.status,
      })),
    };
  }

  // The one place a successful payment becomes a subscription, whatever the
  // way it was paid (card in demo mode, or an offline settlement an admin
  // validates). Runs inside the caller's transaction, after the payment row has
  // been locked and moved to PAID. See planPurchase for the rules (days left
  // are kept, a new plan applies at once, a trial ends).
  async applyPurchase(
    payment: Payment,
    client: Prisma.TransactionClient,
    options: { actorId?: string | null; context?: RequestContext } = {},
  ): Promise<PurchaseOutcome> {
    await lockCurrentSubscription(client, payment.userId);
    const current = await findCurrentSubscription(client, payment.userId);
    const purchase = planPurchase({
      billingPeriod: payment.billingPeriod,
      current,
      now: new Date(),
      planId: payment.planId,
    });
    const data = {
      ...purchase.data,
      ...(purchase.clearCustomQuotas ? { customQuotas: Prisma.DbNull } : {}),
    };
    const subscription = current
      ? await client.subscription.update({ data, where: { id: current.id } })
      : await client.subscription.create({
          data: {
            ...purchase.data,
            accountType: payment.accountType,
            userId: payment.userId,
          },
        });

    await this.recordEvent(client, {
      fromExpiresAt: current?.expiresAt ?? null,
      fromPlanId: current?.planId ?? null,
      fromStatus: current?.status ?? null,
      paymentId: payment.id,
      subscriptionId: subscription.id,
      toExpiresAt: subscription.expiresAt,
      toPlanId: payment.planId,
      toStatus: SubscriptionStatus.ACTIVE,
      type: purchase.type,
      actorId: options.actorId ?? null,
    });
    await client.payment.update({
      data: { subscriptionId: subscription.id },
      where: { id: payment.id },
    });
    await this.syncAccountSubscriptionStatus(
      payment.userId,
      payment.accountType,
      SubscriptionStatus.ACTIVE,
      client,
    );
    await this.auditLogsService.createAuditLog(
      {
        action: 'SUBSCRIPTION_ACTIVATED',
        entityId: subscription.id,
        entityType: 'SUBSCRIPTION',
        ipAddress: options.context?.ipAddress,
        metadata: {
          accountType: payment.accountType,
          customQuotasCleared: Boolean(
            current?.customQuotas && purchase.clearCustomQuotas,
          ),
          endedTrial: purchase.endedTrial,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
          paymentId: payment.id,
          planId: payment.planId,
          reference: payment.reference,
          type: purchase.type,
        },
        userAgent: options.context?.userAgent,
        userId: options.actorId ?? payment.userId,
      },
      client,
    );

    return {
      endedTrial: purchase.endedTrial,
      paymentId: payment.id,
      subscription,
      type: purchase.type,
      userId: payment.userId,
    };
  }

  // "Abonnement activé jusqu'au ...", once the transaction has committed.
  async notifyPurchase(outcome: PurchaseOutcome): Promise<void> {
    await this.notificationProducer?.create({
      category: NotificationCategory.SUBSCRIPTION,
      data: {
        expiresAt: outcome.subscription.expiresAt?.toISOString() ?? '',
        subscriptionId: outcome.subscription.id,
      },
      dedupeKey: `subscription-activated:${outcome.paymentId}`,
      resourceId: outcome.subscription.id,
      resourceType: NotificationResourceType.SUBSCRIPTION,
      severity: NotificationSeverity.SUCCESS,
      type: 'SUBSCRIPTION_ACTIVATED',
      userId: outcome.userId,
    });
  }

  // What the next payment would do, for the summary shown before paying: the
  // new expiry, and whether it ends a trial or changes the plan.
  async previewPurchase(payment: {
    userId: string;
    planId: string;
    billingPeriod: BillingPeriod;
  }) {
    const current = await findCurrentSubscription(this.prisma, payment.userId);
    const purchase = planPurchase({
      billingPeriod: payment.billingPeriod,
      current,
      now: new Date(),
      planId: payment.planId,
    });

    return {
      currentExpiresAt: current?.expiresAt ?? null,
      endsTrial: purchase.endedTrial,
      expiresAt: purchase.data.expiresAt,
      type: purchase.type,
    };
  }

  // The free trial, given once to an account when its verification passes
  // (called in the transaction that sets it VERIFIED). Any Subscription row
  // means the account already had its trial or bought: no second one.
  async startTrial(
    userId: string,
    accountType: AccountType,
    client: Prisma.TransactionClient,
  ): Promise<Subscription | null> {
    // Two approvals of one account at once must not both start a trial.
    await client.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

    const existing = await client.subscription.findFirst({
      select: { id: true },
      where: { userId },
    });

    if (existing) {
      return null;
    }

    const plan = await client.subscriptionPlan.findFirst({
      select: { id: true },
      where: { code: TRIAL_REFERENCE_PLAN_CODES[accountType] },
    });

    if (!plan) {
      // No plan registered yet (the seed has not run): nothing to start.
      this.logger.warn(
        `No trial for ${userId}: plan ${TRIAL_REFERENCE_PLAN_CODES[accountType]} is missing.`,
      );
      return null;
    }

    const now = new Date();
    const subscription = await client.subscription.create({
      data: {
        accountType,
        billingPeriod: BillingPeriod.MONTHLY,
        expiresAt: addDays(now, TRIAL_DURATION_DAYS),
        planId: plan.id,
        startedAt: now,
        status: SubscriptionStatus.TRIALING,
        trial: true,
        userId,
      },
    });

    await this.recordEvent(client, {
      subscriptionId: subscription.id,
      toExpiresAt: subscription.expiresAt,
      toPlanId: plan.id,
      toStatus: SubscriptionStatus.TRIALING,
      type: 'TRIAL_STARTED',
    });
    await this.syncAccountSubscriptionStatus(
      userId,
      accountType,
      SubscriptionStatus.TRIALING,
      client,
    );
    // System action: no acting user, the account concerned goes in metadata.
    await this.auditLogsService.createAuditLog(
      {
        action: 'TRIAL_STARTED',
        entityId: subscription.id,
        entityType: 'SUBSCRIPTION',
        metadata: {
          accountType,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
          userId,
        },
      },
      client,
    );

    return subscription;
  }

  async notifyTrialStarted(subscription: Subscription): Promise<void> {
    await this.notificationProducer?.create({
      category: NotificationCategory.SUBSCRIPTION,
      data: {
        expiresAt: subscription.expiresAt?.toISOString() ?? '',
        subscriptionId: subscription.id,
      },
      dedupeKey: `trial-started:${subscription.id}`,
      resourceId: subscription.id,
      resourceType: NotificationResourceType.SUBSCRIPTION,
      severity: NotificationSeverity.SUCCESS,
      type: 'TRIAL_STARTED',
      userId: subscription.userId,
    });
  }

  recordEvent(client: PrismaExecutor, input: SubscriptionEventInput) {
    return client.subscriptionEvent.create({
      data: {
        actorId: input.actorId ?? null,
        fromExpiresAt: input.fromExpiresAt ?? null,
        fromPlanId: input.fromPlanId ?? null,
        fromStatus: (input.fromStatus ?? null) as SubscriptionStatus | null,
        paymentId: input.paymentId ?? null,
        reason: input.reason ?? null,
        subscriptionId: input.subscriptionId,
        toExpiresAt: input.toExpiresAt ?? null,
        toPlanId: input.toPlanId ?? null,
        toStatus: (input.toStatus ?? null) as SubscriptionStatus | null,
        type: input.type,
      },
    });
  }

  // The single place the status copied onto the account follows the
  // subscription: Establishment.subscriptionStatus or
  // DoctorProfile.subscriptionStatus, the doctors affiliated to an
  // establishment (who have no Subscription of their own and depend on its
  // one), and User.accountStatus (ACTIVE while the subscription is live,
  // otherwise back to VERIFIED_NO_PLAN, the status that may subscribe).
  // updateMany throughout: a missing profile must not throw and roll back
  // the caller. A suspended or rejected account keeps its status.
  async syncAccountSubscriptionStatus(
    userId: string,
    accountType: AccountType,
    status: SubscriptionStatus,
    client: PrismaExecutor = this.prisma,
  ): Promise<void> {
    if (accountType === AccountType.ESTABLISHMENT) {
      const establishment = await client.establishment.findFirst({
        select: { id: true },
        where: { ownerId: userId },
      });

      await client.establishment.updateMany({
        data: { subscriptionStatus: status },
        where: { ownerId: userId },
      });

      if (establishment) {
        await client.doctorProfile.updateMany({
          data: { subscriptionStatus: status },
          where: { establishmentId: establishment.id, isIndependent: false },
        });
      }
    } else {
      await client.doctorProfile.updateMany({
        data: { subscriptionStatus: status },
        where: { userId },
      });
    }

    const live =
      status === SubscriptionStatus.ACTIVE ||
      status === SubscriptionStatus.TRIALING;

    await client.user.updateMany({
      data: {
        accountStatus: live
          ? AccountStatus.ACTIVE
          : AccountStatus.VERIFIED_NO_PLAN,
      },
      where: {
        accountStatus: {
          in: live
            ? [
                AccountStatus.VERIFIED_NO_PLAN,
                AccountStatus.PAYMENT_PENDING,
                AccountStatus.ACTIVE,
              ]
            : [AccountStatus.ACTIVE],
        },
        id: userId,
      },
    });
  }

  // Run hourly by SubscriptionExpiryScheduler. Starts from Subscription rows,
  // never from User.accountStatus: affiliated doctors are ACTIVE without any
  // Subscription and must not be touched. Idempotent, since an expired row is
  // no longer live. Trials expire like paid subscriptions. Returns how many
  // subscriptions were expired.
  async expireDueSubscriptions(now: Date = new Date()): Promise<number> {
    const expired: {
      id: string;
      trial: boolean;
      userId: string;
    }[] = [];

    await this.prisma.$transaction(async (transaction) => {
      const dueSubscriptions = await transaction.subscription.findMany({
        select: {
          accountType: true,
          expiresAt: true,
          id: true,
          planId: true,
          status: true,
          trial: true,
          userId: true,
        },
        where: {
          expiresAt: { lt: now },
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        },
      });

      for (const subscription of dueSubscriptions) {
        // Re-checked per row: a renewal approved since the select keeps the
        // row live but moves expiresAt forward, and must win.
        const { count } = await transaction.subscription.updateMany({
          data: { status: SubscriptionStatus.EXPIRED },
          where: {
            expiresAt: { lt: now },
            id: subscription.id,
            status: {
              in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
            },
          },
        });

        if (count === 0) {
          continue;
        }

        expired.push({
          id: subscription.id,
          trial: subscription.trial,
          userId: subscription.userId,
        });

        await this.recordEvent(transaction, {
          fromExpiresAt: subscription.expiresAt,
          fromPlanId: subscription.planId,
          fromStatus: subscription.status,
          subscriptionId: subscription.id,
          toExpiresAt: subscription.expiresAt,
          toPlanId: subscription.planId,
          toStatus: SubscriptionStatus.EXPIRED,
          type: 'EXPIRED',
        });

        // An account keeps one live row, but nothing enforces it in the
        // schema: never downgrade an account that still holds another live
        // subscription.
        const remainingLive = await transaction.subscription.count({
          where: {
            status: {
              in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
            },
            userId: subscription.userId,
          },
        });

        if (remainingLive === 0) {
          await this.syncAccountSubscriptionStatus(
            subscription.userId,
            subscription.accountType,
            SubscriptionStatus.EXPIRED,
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
            metadata: {
              trial: subscription.trial,
              userId: subscription.userId,
            },
          },
          transaction,
        );
      }
    });

    for (const subscription of expired) {
      await this.notificationProducer?.create({
        category: NotificationCategory.SUBSCRIPTION,
        data: { subscriptionId: subscription.id, trial: subscription.trial },
        dedupeKey: `subscription-expired:${subscription.id}:${now.toISOString().slice(0, 10)}`,
        resourceId: subscription.id,
        resourceType: NotificationResourceType.SUBSCRIPTION,
        severity: NotificationSeverity.WARNING,
        type: 'SUBSCRIPTION_EXPIRED',
        userId: subscription.userId,
      });
    }

    return expired.length;
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

  private toPublicSubscription(
    subscription: Subscription & {
      plan: {
        id: string;
        name: string;
        code: string;
        monthlyPrice: number | null;
        annualPrice: number | null;
        currency: string;
        quotas: Prisma.JsonValue;
      };
    },
  ) {
    return {
      id: subscription.id,
      status: subscription.status,
      trial: subscription.trial,
      billingPeriod: subscription.billingPeriod,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
      plan: subscription.plan,
    };
  }
}
