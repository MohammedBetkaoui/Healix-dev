import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
  Prisma,
  type Subscription,
  type SubscriptionEventType,
} from '@prisma/client';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AccountType } from '../../common/enums/account-type.enum';
import { BillingPeriod } from '../../common/enums/billing-period.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { NotificationProducerService } from '../../notifications/notification-producer.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  findCurrentSubscription,
  lockCurrentSubscription,
} from '../../subscriptions/current-subscription';
import {
  resolveQuotas,
  type SubscriptionForEntitlements,
} from '../../subscriptions/entitlements';
import { EntitlementsService } from '../../subscriptions/entitlements.service';
import {
  AI_PIPELINES,
  normalizeQuotas,
  type PlanQuotas,
} from '../../subscriptions/plans/plan-quotas';
import { addDays, daysLeft } from '../../subscriptions/subscription-period';
import {
  effectiveStatus,
  isLive,
} from '../../subscriptions/subscription-transitions';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import {
  createPaginationMeta,
  getPagination,
} from '../shared/admin-pagination.util';
import { type ActivateCustomSubscriptionDto } from './dto/activate-custom-subscription.dto';
import {
  type ExtendSubscriptionDto,
  type ExtendTrialDto,
} from './dto/extend-subscription.dto';
import { type ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { type SubscriptionQuotasDto } from './dto/subscription-quotas.dto';
import { type SubscriptionReasonDto } from './dto/subscription-reason.dto';
import { type UpdateSubscriptionQuotasDto } from './dto/update-subscription-quotas.dto';

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type SubscriptionWithPlan = NonNullable<
  Awaited<ReturnType<typeof findCurrentSubscription>>
>;

// The accounts that pay: an establishment owner, an independent doctor.
const BILLABLE_ROLES = [
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.INDEPENDENT_DOCTOR,
];

const DAY_MS = 24 * 60 * 60 * 1_000;

// What an action changed and who has to hear of it once it has committed.
type ActionResult = {
  message: string;
  subscription: Subscription;
  notification: {
    type: string;
    severity: NotificationSeverity;
    data: Record<string, string | number | boolean>;
  };
};

// The console for the cases the automatic flow does not cover: extending a
// trial, a commercial gesture, stopping an account, custom quotas, a contract
// on quote. It never activates a normal purchase (the card payment does).
// Every action needs a reason; each writes a SubscriptionEvent and an admin
// audit log, tells the user, and keeps the status copied on the account in
// step (SubscriptionsService.syncAccountSubscriptionStatus).
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly entitlements: EntitlementsService,
    @Optional()
    private readonly notificationProducer?: NotificationProducerService,
  ) {}

  async list(query: ListSubscriptionsQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit, {
      maxLimit: 50,
    });
    const now = new Date();
    const where = await this.buildWhere(query, now);

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          accountStatus: true,
          doctorProfile: { select: { speciality: true } },
          email: true,
          establishment: { select: { name: true } },
          fullName: true,
          id: true,
          phone: true,
          role: true,
        },
        skip,
        take: limit,
        where,
      }),
    ]);

    const data = await Promise.all(
      users.map(async (user) => {
        const accountType = this.accountTypeOf(user.role);
        const [subscription, entitlements, lastPayment] = await Promise.all([
          findCurrentSubscription(this.prisma, user.id),
          this.entitlements.getEntitlementsForAccount(
            user.id,
            accountType,
            now,
          ),
          this.prisma.payment.findFirst({
            orderBy: { createdAt: 'desc' },
            select: {
              amount: true,
              createdAt: true,
              currency: true,
              id: true,
              method: true,
              paidAt: true,
              reference: true,
              status: true,
            },
            where: { userId: user.id },
          }),
        ]);

        return {
          accountId: user.id,
          accountStatus: user.accountStatus,
          accountType,
          displayName: user.establishment?.name ?? user.fullName,
          email: user.email,
          expiresAt: entitlements.expiresAt,
          daysLeft: entitlements.daysLeft,
          fullName: user.fullName,
          lastPayment,
          phone: user.phone,
          plan: entitlements.plan,
          quotas: entitlements.quotas,
          status: entitlements.status,
          storedStatus: subscription?.status ?? SubscriptionStatus.NO_PLAN,
          trial: entitlements.trial,
          usage: entitlements.usage,
        };
      }),
    );

    return { data, meta: createPaginationMeta(page, limit, total) };
  }

  async getDetail(
    accountId: string,
    adminId: string,
    context: RequestContext = {},
  ) {
    const account = await this.findAccountOrThrow(accountId);
    const now = new Date();
    const [subscription, entitlements, events, payments] = await Promise.all([
      findCurrentSubscription(this.prisma, accountId),
      this.entitlements.getEntitlementsForAccount(
        accountId,
        account.accountType,
        now,
      ),
      this.prisma.subscriptionEvent.findMany({
        include: {
          actor: { select: { email: true, fullName: true } },
          fromPlan: { select: { code: true, name: true } },
          payment: { select: { reference: true } },
          toPlan: { select: { code: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        where: { subscription: { userId: accountId } },
      }),
      this.prisma.payment.findMany({
        include: { plan: { select: { code: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        where: { userId: accountId },
      }),
    ]);

    await this.auditLogsService.createAuditLog({
      action: 'ADMIN_VIEWED_SUBSCRIPTION',
      entityId: subscription?.id ?? accountId,
      entityType: subscription ? 'SUBSCRIPTION' : 'USER',
      ipAddress: context.ipAddress,
      metadata: { accountId, status: entitlements.status },
      userAgent: context.userAgent,
      userId: adminId,
    });

    return {
      account: {
        accountStatus: account.accountStatus,
        accountType: account.accountType,
        displayName: account.establishment?.name ?? account.fullName,
        email: account.email,
        fullName: account.fullName,
        id: account.id,
        phone: account.phone,
        verificationStatus:
          account.establishment?.verificationStatus ??
          account.doctorProfile?.verificationStatus ??
          VerificationStatus.NOT_STARTED,
      },
      entitlements,
      events: events.map((event) => ({
        actor: event.actor,
        createdAt: event.createdAt,
        fromExpiresAt: event.fromExpiresAt,
        fromPlan: event.fromPlan,
        fromStatus: event.fromStatus,
        id: event.id,
        paymentReference: event.payment?.reference ?? null,
        reason: event.reason,
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
      subscription: subscription
        ? {
            billingPeriod: subscription.billingPeriod,
            canceledAt: subscription.canceledAt,
            customQuotas: subscription.customQuotas
              ? normalizeQuotas(subscription.customQuotas)
              : null,
            expiresAt: subscription.expiresAt,
            id: subscription.id,
            plan: {
              code: subscription.plan.code,
              custom: subscription.plan.custom,
              id: subscription.plan.id,
              name: subscription.plan.name,
              quotas: normalizeQuotas(subscription.plan.quotas),
            },
            startedAt: subscription.startedAt,
            status: subscription.status,
            trial: subscription.trial,
          }
        : null,
    };
  }

  // Days more on a trial (revives a trial that has just ended).
  async extendTrial(
    accountId: string,
    adminId: string,
    dto: ExtendTrialDto,
    context: RequestContext = {},
  ) {
    const result = await this.mutate(
      accountId,
      async (client, account, current) => {
        if (!current?.trial) {
          throw new ConflictException({
            code: 'NOT_A_TRIAL',
            message: "Ce compte n'est pas en essai gratuit.",
          });
        }
        if (current.status === SubscriptionStatus.CANCELED) {
          throw new ConflictException({
            code: 'SUBSCRIPTION_CANCELED',
            message: "L'essai de ce compte a été arrêté.",
          });
        }

        const now = new Date();
        const base =
          current.expiresAt && current.expiresAt > now
            ? current.expiresAt
            : now;
        const subscription = await client.subscription.update({
          data: {
            canceledAt: null,
            expiresAt: addDays(base, dto.days),
            status: SubscriptionStatus.TRIALING,
          },
          where: { id: current.id },
        });

        await this.finish(client, account, current, subscription, {
          action: 'ADMIN_SUBSCRIPTION_TRIAL_EXTENDED',
          adminId,
          context,
          eventType: 'TRIAL_EXTENDED',
          metadata: { days: dto.days },
          reason: dto.reason,
        });

        return {
          message: 'Essai prolongé.',
          notification: {
            data: {
              days: dto.days,
              expiresAt: subscription.expiresAt?.toISOString() ?? '',
              subscriptionId: subscription.id,
            },
            severity: NotificationSeverity.SUCCESS,
            type: 'TRIAL_EXTENDED',
          },
          subscription,
        } satisfies ActionResult;
      },
    );

    return this.respond(result);
  }

  // A commercial gesture: days offered after what is left (or from now when
  // the subscription has ended). A stopped account is not extended.
  async extend(
    accountId: string,
    adminId: string,
    dto: ExtendSubscriptionDto,
    context: RequestContext = {},
  ) {
    const result = await this.mutate(
      accountId,
      async (client, account, current) => {
        if (
          !current ||
          current.status === SubscriptionStatus.CANCELED ||
          current.status === SubscriptionStatus.NO_PLAN ||
          current.status === SubscriptionStatus.PAYMENT_PENDING
        ) {
          throw new ConflictException({
            code: 'SUBSCRIPTION_NOT_EXTENDABLE',
            message: 'Cet abonnement ne peut pas être prolongé.',
          });
        }

        const now = new Date();
        const live = isLive(current, now);
        const base =
          live && current.expiresAt && current.expiresAt > now
            ? current.expiresAt
            : now;
        const subscription = await client.subscription.update({
          data: {
            expiresAt: addDays(base, dto.days),
            startedAt: live ? undefined : now,
            status: current.trial
              ? SubscriptionStatus.TRIALING
              : SubscriptionStatus.ACTIVE,
          },
          where: { id: current.id },
        });

        await this.finish(client, account, current, subscription, {
          action: 'ADMIN_SUBSCRIPTION_EXTENDED',
          adminId,
          context,
          eventType: 'RENEWED',
          metadata: { days: dto.days },
          reason: dto.reason,
        });

        return {
          message: 'Abonnement prolongé.',
          notification: {
            data: {
              days: dto.days,
              expiresAt: subscription.expiresAt?.toISOString() ?? '',
              subscriptionId: subscription.id,
            },
            severity: NotificationSeverity.SUCCESS,
            type: 'SUBSCRIPTION_EXTENDED',
          },
          subscription,
        } satisfies ActionResult;
      },
    );

    return this.respond(result);
  }

  // Stops the account: CANCELED, read-only. It can subscribe again by itself.
  async cancel(
    accountId: string,
    adminId: string,
    dto: SubscriptionReasonDto,
    context: RequestContext = {},
  ) {
    const result = await this.mutate(
      accountId,
      async (client, account, current) => {
        if (
          !current ||
          (current.status !== SubscriptionStatus.ACTIVE &&
            current.status !== SubscriptionStatus.TRIALING)
        ) {
          throw new ConflictException({
            code: 'SUBSCRIPTION_NOT_CANCELABLE',
            message: "Ce compte n'a pas d'abonnement en cours à arrêter.",
          });
        }

        const subscription = await client.subscription.update({
          data: {
            canceledAt: new Date(),
            status: SubscriptionStatus.CANCELED,
          },
          where: { id: current.id },
        });

        await this.finish(client, account, current, subscription, {
          action: 'ADMIN_SUBSCRIPTION_CANCELED',
          adminId,
          context,
          eventType: 'CANCELED',
          reason: dto.reason,
        });

        return {
          message: 'Abonnement arrêté.',
          notification: {
            data: { subscriptionId: subscription.id },
            severity: NotificationSeverity.WARNING,
            type: 'SUBSCRIPTION_CANCELED',
          },
          subscription,
        } satisfies ActionResult;
      },
    );

    return this.respond(result);
  }

  // The quotas of the account fixed by hand (null: back to those of the plan).
  async updateQuotas(
    accountId: string,
    adminId: string,
    dto: UpdateSubscriptionQuotasDto,
    context: RequestContext = {},
  ) {
    const result = await this.mutate(
      accountId,
      async (client, account, current) => {
        if (!current) {
          throw new ConflictException({
            code: 'NO_SUBSCRIPTION',
            message: "Ce compte n'a pas d'abonnement.",
          });
        }

        const customQuotas =
          dto.quotas === null
            ? null
            : this.mergeQuotas(this.quotasWithoutOverride(current), dto.quotas);
        const subscription = await client.subscription.update({
          data: {
            customQuotas: customQuotas ? { ...customQuotas } : Prisma.DbNull,
          },
          where: { id: current.id },
        });

        await this.finish(client, account, current, subscription, {
          action: 'ADMIN_SUBSCRIPTION_QUOTAS_CHANGED',
          adminId,
          context,
          eventType: 'QUOTAS_CHANGED',
          metadata: { quotas: customQuotas ? { ...customQuotas } : null },
          reason: dto.reason,
        });

        return {
          message: customQuotas
            ? 'Quotas personnalisés enregistrés.'
            : 'Quotas du plan rétablis.',
          notification: {
            data: { subscriptionId: subscription.id },
            severity: NotificationSeverity.INFO,
            type: 'SUBSCRIPTION_QUOTAS_CHANGED',
          },
          subscription,
        } satisfies ActionResult;
      },
    );

    return this.respond(result);
  }

  // A contract on quote: a custom plan until the agreed date. The only
  // activation an administrator makes.
  async activateCustom(
    accountId: string,
    adminId: string,
    dto: ActivateCustomSubscriptionDto,
    context: RequestContext = {},
  ) {
    const until = new Date(dto.until);
    const now = new Date();

    if (Number.isNaN(until.getTime()) || until <= now) {
      throw new BadRequestException({
        code: 'INVALID_END_DATE',
        message: 'La date de fin doit être dans le futur.',
      });
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { OR: [{ id: dto.planId }, { code: dto.planId }] },
    });

    if (!plan) {
      throw new NotFoundException('Plan introuvable.');
    }

    if (!plan.custom) {
      throw new BadRequestException({
        code: 'PLAN_NOT_CUSTOM',
        message:
          "Seul un plan sur devis peut être activé ici : les autres s'achètent en ligne.",
      });
    }

    const result = await this.mutate(
      accountId,
      async (client, account, current) => {
        if (plan.accountType !== account.accountType) {
          throw new BadRequestException(
            'Ce plan ne correspond pas au type du compte.',
          );
        }

        const verification =
          account.establishment?.verificationStatus ??
          account.doctorProfile?.verificationStatus;
        if (verification !== VerificationStatus.VERIFIED) {
          throw new ConflictException({
            code: 'ACCOUNT_NOT_VERIFIED',
            message: 'Le compte doit être vérifié.',
          });
        }

        const live = isLive(current, now);
        const continuesPaidPeriod = live && current !== null && !current.trial;
        const samePlan = current?.planId === plan.id;
        const eventType: SubscriptionEventType = continuesPaidPeriod
          ? samePlan
            ? 'RENEWED'
            : 'PLAN_CHANGED'
          : 'PURCHASED';
        const billingPeriod =
          until.getTime() - now.getTime() > 200 * DAY_MS
            ? BillingPeriod.ANNUAL
            : BillingPeriod.MONTHLY;
        const customQuotas = dto.quotas
          ? this.mergeQuotas(normalizeQuotas(plan.quotas), dto.quotas)
          : null;
        // The numbers of a contract follow its plan: kept when the same
        // contract is renewed, otherwise only those given now.
        const customQuotasData = customQuotas
          ? ({ ...customQuotas } as Prisma.InputJsonObject)
          : continuesPaidPeriod && samePlan
            ? undefined
            : Prisma.DbNull;
        const data = {
          billingPeriod,
          canceledAt: null,
          customQuotas: customQuotasData,
          expiresAt: until,
          planId: plan.id,
          startedAt: continuesPaidPeriod ? (current.startedAt ?? now) : now,
          status: SubscriptionStatus.ACTIVE,
          trial: false,
        };
        const subscription = current
          ? await client.subscription.update({
              data,
              where: { id: current.id },
            })
          : await client.subscription.create({
              data: {
                ...data,
                accountType: account.accountType,
                customQuotas: customQuotas ? { ...customQuotas } : undefined,
                userId: accountId,
              },
            });

        await this.finish(client, account, current, subscription, {
          action: 'ADMIN_SUBSCRIPTION_CUSTOM_ACTIVATED',
          adminId,
          context,
          eventType,
          metadata: { planId: plan.id, until: until.toISOString() },
          reason: dto.reason,
        });

        return {
          message: 'Abonnement sur devis activé.',
          notification: {
            data: {
              expiresAt: until.toISOString(),
              subscriptionId: subscription.id,
            },
            severity: NotificationSeverity.SUCCESS,
            type: 'SUBSCRIPTION_ACTIVATED',
          },
          subscription,
        } satisfies ActionResult;
      },
    );

    return this.respond(result);
  }

  // The account, its current subscription locked, in one transaction.
  private async mutate<T>(
    accountId: string,
    work: (
      client: Prisma.TransactionClient,
      account: Awaited<
        ReturnType<AdminSubscriptionsService['findAccountOrThrow']>
      >,
      current: SubscriptionWithPlan | null,
    ) => Promise<T>,
  ): Promise<T & { userId: string }> {
    const account = await this.findAccountOrThrow(accountId);

    const result = await this.prisma.$transaction(async (transaction) => {
      await lockCurrentSubscription(transaction, accountId);
      const current = await findCurrentSubscription(transaction, accountId);

      return work(transaction, account, current);
    });

    return { ...result, userId: accountId };
  }

  // The event, the status copied on the account, the audit log. `previous` is
  // the row before the change, `subscription` after.
  private async finish(
    client: Prisma.TransactionClient,
    account: { accountType: AccountType; id: string },
    previous: SubscriptionWithPlan | null,
    subscription: Subscription,
    input: {
      action: string;
      adminId: string;
      context: RequestContext;
      eventType: SubscriptionEventType;
      metadata?: Prisma.InputJsonObject;
      reason: string;
    },
  ): Promise<void> {
    await this.subscriptionsService.recordEvent(client, {
      actorId: input.adminId,
      fromExpiresAt: previous?.expiresAt ?? null,
      fromPlanId: previous?.planId ?? null,
      fromStatus: previous?.status ?? null,
      reason: input.reason,
      subscriptionId: subscription.id,
      toExpiresAt: subscription.expiresAt,
      toPlanId: subscription.planId,
      toStatus: subscription.status,
      type: input.eventType,
    });
    await this.subscriptionsService.syncAccountSubscriptionStatus(
      account.id,
      account.accountType,
      subscription.status,
      client,
    );
    await this.auditLogsService.createAuditLog(
      {
        action: input.action,
        entityId: subscription.id,
        entityType: 'SUBSCRIPTION',
        ipAddress: input.context.ipAddress,
        metadata: {
          ...input.metadata,
          accountId: account.id,
          fromStatus: previous?.status ?? null,
          reason: input.reason,
          toStatus: subscription.status,
        },
        userAgent: input.context.userAgent,
        userId: input.adminId,
      },
      client,
    );
  }

  // Tells the user, once the transaction has committed, and answers.
  private async respond(result: ActionResult & { userId: string }) {
    await this.notificationProducer?.create({
      category: NotificationCategory.SUBSCRIPTION,
      data: result.notification.data,
      resourceId: result.subscription.id,
      resourceType: NotificationResourceType.SUBSCRIPTION,
      severity: result.notification.severity,
      type: result.notification.type,
      userId: result.userId,
    });

    const now = new Date();
    const { subscription } = result;

    return {
      message: result.message,
      subscription: {
        daysLeft: daysLeft(subscription.expiresAt, now),
        expiresAt: subscription.expiresAt,
        id: subscription.id,
        status: effectiveStatus(subscription, now),
        trial: subscription.trial,
      },
    };
  }

  private async findAccountOrThrow(accountId: string) {
    const user = await this.prisma.user.findFirst({
      select: {
        accountStatus: true,
        doctorProfile: {
          select: { speciality: true, verificationStatus: true },
        },
        email: true,
        establishment: {
          select: { name: true, verificationStatus: true },
        },
        fullName: true,
        id: true,
        phone: true,
        role: true,
      },
      where: { id: accountId, role: { in: BILLABLE_ROLES } },
    });

    if (!user) {
      throw new NotFoundException('Compte introuvable.');
    }

    return { ...user, accountType: this.accountTypeOf(user.role) };
  }

  private accountTypeOf(role: string): AccountType {
    return role === UserRole.ESTABLISHMENT_ADMIN
      ? AccountType.ESTABLISHMENT
      : AccountType.INDEPENDENT_DOCTOR;
  }

  // The quotas the account would have without any custom ones.
  private quotasWithoutOverride(current: SubscriptionWithPlan): PlanQuotas {
    return resolveQuotas({
      ...(current as SubscriptionForEntitlements),
      customQuotas: null,
    });
  }

  // A key left out keeps `base`; null is unlimited.
  private mergeQuotas(
    base: PlanQuotas,
    given: SubscriptionQuotasDto,
  ): PlanQuotas {
    const pick = <K extends keyof PlanQuotas>(key: K): PlanQuotas[K] =>
      given[key] === undefined ? base[key] : (given[key] as PlanQuotas[K]);

    return normalizeQuotas({
      aiAnalysesPerMonth: pick('aiAnalysesPerMonth'),
      aiPipelines:
        given.aiPipelines === undefined
          ? base.aiPipelines
          : given.aiPipelines === null
            ? null
            : AI_PIPELINES.filter((pipeline) =>
                given.aiPipelines?.includes(pipeline),
              ),
      maxDoctors: pick('maxDoctors'),
      maxPatients: pick('maxPatients'),
    });
  }

  private async buildWhere(
    query: ListSubscriptionsQueryDto,
    now: Date,
  ): Promise<Prisma.UserWhereInput> {
    const and: Prisma.UserWhereInput[] = [
      {
        // The accounts that can subscribe, or that already hold a
        // subscription.
        OR: [
          {
            establishment: { verificationStatus: VerificationStatus.VERIFIED },
          },
          {
            doctorProfile: {
              isIndependent: true,
              verificationStatus: VerificationStatus.VERIFIED,
            },
          },
          { subscriptions: { some: {} } },
        ],
      },
    ];

    if (query.search) {
      and.push({
        OR: [
          { fullName: { contains: query.search } },
          { email: { contains: query.search } },
          { phone: { contains: query.search } },
          { establishment: { name: { contains: query.search } } },
        ],
      });
    }

    const wantsNoPlan = query.status === SubscriptionStatus.NO_PLAN;
    const onCurrentSubscription: Prisma.SubscriptionWhereInput = {};

    if (query.status && !wantsNoPlan) {
      onCurrentSubscription.status = query.status;
    }

    if (query.expiresWithinDays) {
      onCurrentSubscription.status = {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
      };
      onCurrentSubscription.expiresAt = {
        gt: now,
        lte: addDays(now, query.expiresWithinDays),
      };
    }

    if (wantsNoPlan) {
      and.push({ subscriptions: { none: {} } });
    } else if (Object.keys(onCurrentSubscription).length > 0) {
      // Only the latest row of an account is its subscription.
      onCurrentSubscription.id = { in: await this.currentSubscriptionIds() };
      and.push({ subscriptions: { some: onCurrentSubscription } });
    }

    return {
      AND: and,
      role: query.accountType
        ? this.roleOf(query.accountType)
        : { in: BILLABLE_ROLES },
    };
  }

  private roleOf(accountType: AccountType) {
    return accountType === AccountType.ESTABLISHMENT
      ? UserRole.ESTABLISHMENT_ADMIN
      : UserRole.INDEPENDENT_DOCTOR;
  }

  private async currentSubscriptionIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM subscriptions s
      WHERE s.created_at = (
        SELECT MAX(latest.created_at) FROM subscriptions latest
        WHERE latest.user_id = s.user_id
      )`;

    return rows.map((row) => row.id);
  }
}
