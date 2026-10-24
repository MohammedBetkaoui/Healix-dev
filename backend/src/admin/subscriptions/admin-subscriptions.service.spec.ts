/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { type HttpException } from '@nestjs/common';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { AccountType } from '../../common/enums/account-type.enum';
import { BillingPeriod } from '../../common/enums/billing-period.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { type NotificationProducerService } from '../../notifications/notification-producer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { type EntitlementsService } from '../../subscriptions/entitlements.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { fakeTable, type Row } from '../../subscriptions/testing/fake-database';
import { AdminSubscriptionsService } from './admin-subscriptions.service';

const now = new Date('2026-10-16T09:00:00.000Z');
const day = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);

const ADMIN = 'admin-1';
const context = { ipAddress: '10.0.0.1', userAgent: 'jest' };

const proQuotas = {
  aiAnalysesPerMonth: 100,
  aiPipelines: ['brain', 'pathology-breast', 'cardio-ecg'],
  maxDoctors: 1,
  maxPatients: null,
};

function createDatabase() {
  const users: Row[] = [
    {
      id: 'doctor-1',
      role: UserRole.INDEPENDENT_DOCTOR,
      accountStatus: AccountStatus.ACTIVE,
      fullName: 'Dr Test',
    },
    {
      id: 'owner-1',
      role: UserRole.ESTABLISHMENT_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      fullName: 'Owner',
      establishment: { name: 'Clinique', verificationStatus: 'VERIFIED' },
    },
    { id: 'affiliated-1', role: UserRole.AFFILIATED_DOCTOR },
  ];
  // The profile and establishment the account lookup reads, by relation.
  users[0].doctorProfile = { speciality: 'x', verificationStatus: 'VERIFIED' };
  const establishments: Row[] = [
    {
      id: 'establishment-1',
      ownerId: 'owner-1',
      subscriptionStatus: SubscriptionStatus.TRIALING,
    },
  ];
  const doctorProfiles: Row[] = [
    {
      id: 'profile-1',
      userId: 'doctor-1',
      isIndependent: true,
      subscriptionStatus: SubscriptionStatus.TRIALING,
    },
    {
      id: 'profile-affiliated',
      userId: 'affiliated-1',
      isIndependent: false,
      establishmentId: 'establishment-1',
      subscriptionStatus: SubscriptionStatus.TRIALING,
    },
  ];
  const plans: Row[] = [
    {
      id: 'plan-pro',
      code: 'DOCTOR_PRO',
      custom: false,
      accountType: AccountType.INDEPENDENT_DOCTOR,
      name: 'Pro',
      quotas: proQuotas,
    },
    {
      id: 'plan-est-custom',
      code: 'EST_CUSTOM',
      custom: true,
      accountType: AccountType.ESTABLISHMENT,
      name: 'Custom',
      quotas: {
        aiAnalysesPerMonth: null,
        aiPipelines: null,
        maxDoctors: null,
        maxPatients: null,
      },
    },
  ];
  const subscriptions: Row[] = [
    {
      id: 'sub-doctor',
      userId: 'doctor-1',
      accountType: AccountType.INDEPENDENT_DOCTOR,
      planId: 'plan-pro',
      status: SubscriptionStatus.TRIALING,
      trial: true,
      billingPeriod: BillingPeriod.MONTHLY,
      startedAt: day(-10),
      expiresAt: day(4),
      customQuotas: null,
      createdAt: day(-10),
      plan: plans[0],
    },
  ];
  const events: Row[] = [];
  const auditLogs: Row[] = [];

  // The account lookup reads the user with its profile or establishment: the
  // fake users carry them as plain properties.
  const user = fakeTable(users);
  user.findFirst.mockImplementation(
    ({ where }: { where: { id: string; role: { in: string[] } } }) =>
      Promise.resolve(
        users.find(
          (row) =>
            row.id === where.id && where.role.in.includes(row.role as string),
        ) ?? null,
      ),
  );
  // The plan lookup accepts an id or a code.
  const subscriptionPlan = fakeTable(plans);
  subscriptionPlan.findFirst.mockImplementation(
    ({ where }: { where: { OR: Record<string, string>[] } }) =>
      Promise.resolve(
        plans.find((plan) =>
          where.OR.some((condition) =>
            Object.entries(condition).every(
              ([key, value]) => plan[key] === value,
            ),
          ),
        ) ?? null,
      ),
  );

  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    auditLog: fakeTable(auditLogs),
    doctorProfile: fakeTable(doctorProfiles),
    establishment: fakeTable(establishments),
    subscription: fakeTable(subscriptions),
    subscriptionEvent: fakeTable(events, 'event'),
    subscriptionPlan,
    user,
  };
  const $transaction = jest.fn(
    (run: (client: typeof prisma) => Promise<unknown>) => run(prisma),
  );
  const prismaService = { ...prisma, $transaction } as unknown as PrismaService;
  const audit = new AuditLogsService(prismaService);
  const notify = jest.fn().mockResolvedValue(null);
  const service = new AdminSubscriptionsService(
    prismaService,
    audit,
    new SubscriptionsService(prismaService, audit),
    {} as EntitlementsService,
    { create: notify } as unknown as NotificationProducerService,
  );

  const find = (rows: Row[], id: string) =>
    rows.find((row) => row.id === id) as Row;

  return {
    $transaction,
    auditLogs,
    doctorProfile: (id: string) => find(doctorProfiles, id),
    establishment: (id: string) => find(establishments, id),
    events,
    notify,
    prisma,
    service,
    subscription: (id: string) => find(subscriptions, id),
    subscriptions,
    user: (id: string) => find(users, id),
  };
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(now);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('AdminSubscriptionsService.extendTrial', () => {
  it('adds the days after what is left of the trial, and records who, why and when', async () => {
    const db = createDatabase();

    const result = await db.service.extendTrial(
      'doctor-1',
      ADMIN,
      { days: 7, reason: 'Demonstration prolongée' },
      context,
    );

    // 20 Oct (end of the trial) + 7 days.
    expect(db.subscription('sub-doctor')).toMatchObject({
      expiresAt: day(11),
      status: SubscriptionStatus.TRIALING,
    });
    expect(result).toMatchObject({
      message: 'Essai prolongé.',
      subscription: { daysLeft: 11, status: 'TRIALING', trial: true },
    });
    expect(db.events).toEqual([
      expect.objectContaining({
        actorId: ADMIN,
        fromExpiresAt: day(4),
        reason: 'Demonstration prolongée',
        subscriptionId: 'sub-doctor',
        toExpiresAt: day(11),
        type: 'TRIAL_EXTENDED',
      }),
    ]);
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        action: 'ADMIN_SUBSCRIPTION_TRIAL_EXTENDED',
        entityId: 'sub-doctor',
        ipAddress: '10.0.0.1',
        metadata: expect.objectContaining({
          days: 7,
          reason: 'Demonstration prolongée',
        }),
        user: { connect: { id: ADMIN } },
      }),
    ]);
  });

  it('tells the user once committed', async () => {
    const db = createDatabase();

    await db.service.extendTrial(
      'doctor-1',
      ADMIN,
      { days: 7, reason: 'Demonstration prolongée' },
      context,
    );

    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          days: 7,
          expiresAt: day(11).toISOString(),
          subscriptionId: 'sub-doctor',
        },
        type: 'TRIAL_EXTENDED',
        userId: 'doctor-1',
      }),
    );
    expect(db.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      db.notify.mock.invocationCallOrder[0],
    );
  });

  it('revives a trial that has just ended, from today', async () => {
    const db = createDatabase();
    Object.assign(db.subscription('sub-doctor'), {
      expiresAt: day(-2),
      status: SubscriptionStatus.EXPIRED,
    });
    db.user('doctor-1').accountStatus = AccountStatus.VERIFIED_NO_PLAN;
    db.doctorProfile('profile-1').subscriptionStatus =
      SubscriptionStatus.EXPIRED;

    await db.service.extendTrial(
      'doctor-1',
      ADMIN,
      { days: 5, reason: 'Retard de validation' },
      context,
    );

    expect(db.subscription('sub-doctor')).toMatchObject({
      expiresAt: day(5),
      status: SubscriptionStatus.TRIALING,
    });
    // The status copied on the account follows.
    expect(db.user('doctor-1').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.doctorProfile('profile-1').subscriptionStatus).toBe(
      SubscriptionStatus.TRIALING,
    );
  });

  it('refuses an account that is not on a trial', async () => {
    const db = createDatabase();
    Object.assign(db.subscription('sub-doctor'), {
      status: SubscriptionStatus.ACTIVE,
      trial: false,
    });

    const error = await errorOf(
      db.service.extendTrial(
        'doctor-1',
        ADMIN,
        { days: 5, reason: 'Pas un essai' },
        context,
      ),
    );

    expect((error as HttpException).getStatus()).toBe(409);
    expect(codeOf(error)).toBe('NOT_A_TRIAL');
    expect(db.events).toHaveLength(0);
    expect(db.auditLogs).toHaveLength(0);
    expect(db.notify).not.toHaveBeenCalled();
  });

  it('refuses a stopped trial', async () => {
    const db = createDatabase();
    db.subscription('sub-doctor').status = SubscriptionStatus.CANCELED;

    const error = await errorOf(
      db.service.extendTrial(
        'doctor-1',
        ADMIN,
        { days: 5, reason: 'Arrêté avant' },
        context,
      ),
    );

    expect(codeOf(error)).toBe('SUBSCRIPTION_CANCELED');
  });

  it('refuses a user that is not a paying account', async () => {
    const db = createDatabase();

    const error = await errorOf(
      db.service.extendTrial(
        'affiliated-1',
        ADMIN,
        { days: 5, reason: 'Pas un compte payeur' },
        context,
      ),
    );

    expect((error as HttpException).getStatus()).toBe(404);
  });

  it('locks the subscription first', async () => {
    const db = createDatabase();

    await db.service.extendTrial(
      'doctor-1',
      ADMIN,
      { days: 1, reason: 'Un jour de plus' },
      context,
    );

    const [sqlParts] = db.prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
    ];
    expect(sqlParts.join('?')).toContain('FOR UPDATE');
    expect(db.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.prisma.subscription.findFirst.mock.invocationCallOrder[0],
    );
  });
});

describe('AdminSubscriptionsService.extend (commercial gesture)', () => {
  it('adds the days after what is left of a paid subscription', async () => {
    const db = createDatabase();
    Object.assign(db.subscription('sub-doctor'), {
      expiresAt: day(10),
      status: SubscriptionStatus.ACTIVE,
      trial: false,
    });

    await db.service.extend(
      'doctor-1',
      ADMIN,
      { days: 30, reason: 'Geste commercial après incident' },
      context,
    );

    expect(db.subscription('sub-doctor').expiresAt).toEqual(day(40));
    expect(db.events).toEqual([
      expect.objectContaining({
        actorId: ADMIN,
        reason: 'Geste commercial après incident',
        type: 'RENEWED',
      }),
    ]);
    expect(db.auditLogs[0]).toMatchObject({
      action: 'ADMIN_SUBSCRIPTION_EXTENDED',
    });
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SUBSCRIPTION_EXTENDED' }),
    );
  });

  it('reactivates a lapsed subscription from today', async () => {
    const db = createDatabase();
    Object.assign(db.subscription('sub-doctor'), {
      expiresAt: day(-5),
      status: SubscriptionStatus.EXPIRED,
      trial: false,
    });
    db.user('doctor-1').accountStatus = AccountStatus.VERIFIED_NO_PLAN;

    await db.service.extend(
      'doctor-1',
      ADMIN,
      { days: 10, reason: 'Retard de paiement excusé' },
      context,
    );

    expect(db.subscription('sub-doctor')).toMatchObject({
      expiresAt: day(10),
      startedAt: now,
      status: SubscriptionStatus.ACTIVE,
    });
    expect(db.user('doctor-1').accountStatus).toBe(AccountStatus.ACTIVE);
  });

  it('does not bring back an account an administrator stopped', async () => {
    const db = createDatabase();
    db.subscription('sub-doctor').status = SubscriptionStatus.CANCELED;

    const error = await errorOf(
      db.service.extend(
        'doctor-1',
        ADMIN,
        { days: 10, reason: 'Compte arrêté avant' },
        context,
      ),
    );

    expect(codeOf(error)).toBe('SUBSCRIPTION_NOT_EXTENDABLE');
    expect(db.events).toHaveLength(0);
  });

  it('refuses an account with no subscription', async () => {
    const db = createDatabase();
    db.subscriptions.length = 0;

    const error = await errorOf(
      db.service.extend(
        'doctor-1',
        ADMIN,
        { days: 10, reason: 'Rien à prolonger' },
        context,
      ),
    );

    expect(codeOf(error)).toBe('SUBSCRIPTION_NOT_EXTENDABLE');
  });
});

describe('AdminSubscriptionsService.cancel', () => {
  it('stops the account: CANCELED, read-only, and the copies follow', async () => {
    const db = createDatabase();

    const result = await db.service.cancel(
      'doctor-1',
      ADMIN,
      { reason: 'Demande du titulaire du compte' },
      context,
    );

    expect(db.subscription('sub-doctor')).toMatchObject({
      canceledAt: now,
      status: SubscriptionStatus.CANCELED,
    });
    expect(db.doctorProfile('profile-1').subscriptionStatus).toBe(
      SubscriptionStatus.CANCELED,
    );
    // Back to the status that may subscribe again by itself.
    expect(db.user('doctor-1').accountStatus).toBe(
      AccountStatus.VERIFIED_NO_PLAN,
    );
    expect(result.subscription.status).toBe(SubscriptionStatus.CANCELED);
    expect(db.events).toEqual([
      expect.objectContaining({
        actorId: ADMIN,
        fromStatus: SubscriptionStatus.TRIALING,
        reason: 'Demande du titulaire du compte',
        toStatus: SubscriptionStatus.CANCELED,
        type: 'CANCELED',
      }),
    ]);
    expect(db.auditLogs[0]).toMatchObject({
      action: 'ADMIN_SUBSCRIPTION_CANCELED',
      metadata: expect.objectContaining({
        reason: 'Demande du titulaire du compte',
      }),
    });
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'WARNING',
        type: 'SUBSCRIPTION_CANCELED',
        userId: 'doctor-1',
      }),
    );
  });

  it('makes the doctors affiliated to a stopped establishment follow it', async () => {
    const db = createDatabase();
    db.subscriptions.push({
      id: 'sub-owner',
      userId: 'owner-1',
      accountType: AccountType.ESTABLISHMENT,
      planId: 'plan-pro',
      status: SubscriptionStatus.ACTIVE,
      trial: false,
      expiresAt: day(20),
      createdAt: day(-3),
    });

    await db.service.cancel(
      'owner-1',
      ADMIN,
      { reason: 'Contrat résilié' },
      context,
    );

    expect(db.establishment('establishment-1').subscriptionStatus).toBe(
      SubscriptionStatus.CANCELED,
    );
    expect(db.doctorProfile('profile-affiliated').subscriptionStatus).toBe(
      SubscriptionStatus.CANCELED,
    );
  });

  it('refuses to stop what is already ended', async () => {
    const db = createDatabase();
    db.subscription('sub-doctor').status = SubscriptionStatus.EXPIRED;

    const error = await errorOf(
      db.service.cancel('doctor-1', ADMIN, { reason: 'Déjà expiré' }, context),
    );

    expect(codeOf(error)).toBe('SUBSCRIPTION_NOT_CANCELABLE');
    expect(db.events).toHaveLength(0);
  });
});

describe('AdminSubscriptionsService.updateQuotas', () => {
  it('fixes the quotas by hand: the keys given, the rest as the plan has them', async () => {
    const db = createDatabase();
    Object.assign(db.subscription('sub-doctor'), {
      status: SubscriptionStatus.ACTIVE,
      trial: false,
    });

    await db.service.updateQuotas(
      'doctor-1',
      ADMIN,
      {
        quotas: { aiAnalysesPerMonth: 500, maxPatients: 2000 },
        reason: 'Contrat sur devis signé',
      },
      context,
    );

    expect(db.subscription('sub-doctor').customQuotas).toEqual({
      aiAnalysesPerMonth: 500,
      aiPipelines: proQuotas.aiPipelines,
      maxDoctors: 1,
      maxPatients: 2000,
    });
    expect(db.events).toEqual([
      expect.objectContaining({
        actorId: ADMIN,
        reason: 'Contrat sur devis signé',
        type: 'QUOTAS_CHANGED',
      }),
    ]);
    expect(db.auditLogs[0]).toMatchObject({
      action: 'ADMIN_SUBSCRIPTION_QUOTAS_CHANGED',
    });
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SUBSCRIPTION_QUOTAS_CHANGED' }),
    );
  });

  it('takes null as unlimited and every pipeline', async () => {
    const db = createDatabase();

    await db.service.updateQuotas(
      'doctor-1',
      ADMIN,
      {
        quotas: { aiAnalysesPerMonth: null, aiPipelines: null },
        reason: 'Partenariat hospitalier',
      },
      context,
    );

    // A trial: the base is the quotas of the trial (10 analyses, every pipeline).
    expect(db.subscription('sub-doctor').customQuotas).toEqual({
      aiAnalysesPerMonth: null,
      aiPipelines: null,
      maxDoctors: 1,
      maxPatients: null,
    });
  });

  it('goes back to the quotas of the plan with null', async () => {
    const db = createDatabase();
    db.subscription('sub-doctor').customQuotas = { maxPatients: 5 };
    const { Prisma } = jest.requireActual('@prisma/client');

    await db.service.updateQuotas(
      'doctor-1',
      ADMIN,
      { quotas: null, reason: 'Fin du contrat sur devis' },
      context,
    );

    expect(db.subscription('sub-doctor').customQuotas).toBe(Prisma.DbNull);
    expect(db.events[0]).toMatchObject({ type: 'QUOTAS_CHANGED' });
  });

  it('keeps only known pipelines', async () => {
    const db = createDatabase();

    await db.service.updateQuotas(
      'doctor-1',
      ADMIN,
      {
        quotas: { aiPipelines: ['brain', 'cardio-ecg'] },
        reason: 'Deux modèles seulement',
      },
      context,
    );

    expect(
      (db.subscription('sub-doctor').customQuotas as { aiPipelines: string[] })
        .aiPipelines,
    ).toEqual(['brain', 'cardio-ecg']);
  });

  it('refuses an account with no subscription', async () => {
    const db = createDatabase();
    db.subscriptions.length = 0;

    const error = await errorOf(
      db.service.updateQuotas(
        'doctor-1',
        ADMIN,
        { quotas: { maxPatients: 1 }, reason: 'Aucun abonnement' },
        context,
      ),
    );

    expect(codeOf(error)).toBe('NO_SUBSCRIPTION');
  });
});

describe('AdminSubscriptionsService.activateCustom', () => {
  const until = day(365).toISOString();

  it('activates a contract on quote for a verified establishment, until the agreed date', async () => {
    const db = createDatabase();

    const result = await db.service.activateCustom(
      'owner-1',
      ADMIN,
      {
        planId: 'EST_CUSTOM',
        quotas: { aiAnalysesPerMonth: 5000, maxDoctors: 250 },
        reason: 'Contrat CHU signé le 12/10',
        until,
      },
      context,
    );

    const created = db.subscriptions.find((row) => row.userId === 'owner-1');
    expect(created).toMatchObject({
      accountType: AccountType.ESTABLISHMENT,
      billingPeriod: BillingPeriod.ANNUAL,
      expiresAt: new Date(until),
      planId: 'plan-est-custom',
      status: SubscriptionStatus.ACTIVE,
      trial: false,
    });
    expect(created?.customQuotas).toEqual({
      aiAnalysesPerMonth: 5000,
      aiPipelines: null,
      maxDoctors: 250,
      maxPatients: null,
    });
    expect(result.subscription.status).toBe('ACTIVE');
    expect(db.establishment('establishment-1').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
    expect(db.doctorProfile('profile-affiliated').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
    expect(db.events).toEqual([
      expect.objectContaining({
        actorId: ADMIN,
        reason: 'Contrat CHU signé le 12/10',
        toPlanId: 'plan-est-custom',
        toStatus: SubscriptionStatus.ACTIVE,
        type: 'PURCHASED',
      }),
    ]);
    expect(db.auditLogs[0]).toMatchObject({
      action: 'ADMIN_SUBSCRIPTION_CUSTOM_ACTIVATED',
    });
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { expiresAt: until, subscriptionId: expect.any(String) },
        type: 'SUBSCRIPTION_ACTIVATED',
        userId: 'owner-1',
      }),
    );
  });

  it('refuses a plan that is bought online', async () => {
    const db = createDatabase();

    const error = await errorOf(
      db.service.activateCustom(
        'owner-1',
        ADMIN,
        { planId: 'plan-pro', reason: 'Pas sur devis', until },
        context,
      ),
    );

    expect((error as HttpException).getStatus()).toBe(400);
    expect(codeOf(error)).toBe('PLAN_NOT_CUSTOM');
  });

  it('refuses an end date that is not in the future', async () => {
    const db = createDatabase();

    const error = await errorOf(
      db.service.activateCustom(
        'owner-1',
        ADMIN,
        {
          planId: 'EST_CUSTOM',
          reason: 'Date passée',
          until: day(-1).toISOString(),
        },
        context,
      ),
    );

    expect(codeOf(error)).toBe('INVALID_END_DATE');
  });

  it('refuses a plan of the other account type', async () => {
    const db = createDatabase();

    const error = await errorOf(
      db.service.activateCustom(
        'doctor-1',
        ADMIN,
        { planId: 'EST_CUSTOM', reason: 'Mauvais type de compte', until },
        context,
      ),
    );

    expect((error as HttpException).getStatus()).toBe(400);
    expect(db.events).toHaveLength(0);
  });

  it('ends a trial with the contract, and replaces its plan at once', async () => {
    const db = createDatabase();
    db.subscriptions.push({
      id: 'sub-owner-trial',
      userId: 'owner-1',
      accountType: AccountType.ESTABLISHMENT,
      planId: 'plan-pro',
      status: SubscriptionStatus.TRIALING,
      trial: true,
      startedAt: day(-3),
      expiresAt: day(11),
      createdAt: day(-3),
    });

    await db.service.activateCustom(
      'owner-1',
      ADMIN,
      { planId: 'EST_CUSTOM', reason: 'Fin de l essai par contrat', until },
      context,
    );

    expect(db.subscription('sub-owner-trial')).toMatchObject({
      expiresAt: new Date(until),
      planId: 'plan-est-custom',
      startedAt: now,
      status: SubscriptionStatus.ACTIVE,
      trial: false,
    });
    expect(db.events[0]).toMatchObject({
      fromStatus: SubscriptionStatus.TRIALING,
      type: 'PURCHASED',
    });
  });
});

describe('AdminSubscriptionsService.list', () => {
  function listSetup() {
    const db = createDatabase();
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    db.prisma.user.findMany = findMany;
    db.prisma.user.count = count;
    return { ...db, count, findMany };
  }

  it('lists the paying accounts that can subscribe or already do, with their pages', async () => {
    const { count, findMany, service } = listSetup();

    await service.list({ limit: 20, page: 2 });

    const [{ where, skip, take }] = findMany.mock.calls[0] as [
      { skip: number; take: number; where: Record<string, unknown> },
    ];
    expect([skip, take]).toEqual([20, 20]);
    expect(where.role).toEqual({
      in: ['ESTABLISHMENT_ADMIN', 'INDEPENDENT_DOCTOR'],
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('filters the "no plan" accounts as those without any subscription row', async () => {
    const { findMany, service } = listSetup();

    await service.list({ status: SubscriptionStatus.NO_PLAN });

    const [{ where }] = findMany.mock.calls[0] as [
      { where: { AND: Record<string, unknown>[] } },
    ];
    expect(where.AND).toContainEqual({ subscriptions: { none: {} } });
  });

  it('filters by status on the latest subscription row only', async () => {
    const { prisma, findMany, service } = listSetup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'sub-latest' }]);

    await service.list({ status: SubscriptionStatus.TRIALING });

    const [{ where }] = findMany.mock.calls[0] as [
      { where: { AND: Record<string, unknown>[] } },
    ];
    expect(where.AND).toContainEqual({
      subscriptions: {
        some: { id: { in: ['sub-latest'] }, status: 'TRIALING' },
      },
    });
  });

  it('filters the live subscriptions that end within 7 days', async () => {
    const { prisma, findMany, service } = listSetup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'sub-latest' }]);

    await service.list({ expiresWithinDays: 7 });

    const [{ where }] = findMany.mock.calls[0] as [
      { where: { AND: Record<string, unknown>[] } },
    ];
    expect(where.AND).toContainEqual({
      subscriptions: {
        some: {
          expiresAt: { gt: now, lte: day(7) },
          id: { in: ['sub-latest'] },
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
      },
    });
  });

  it('searches the name, e-mail, phone and the name of the establishment', async () => {
    const { findMany, service } = listSetup();

    await service.list({ search: 'chifa' });

    const [{ where }] = findMany.mock.calls[0] as [
      { where: { AND: { OR?: unknown[] }[] } },
    ];
    expect(JSON.stringify(where.AND)).toContain(
      '"establishment":{"name":{"contains":"chifa"}}',
    );
    expect(JSON.stringify(where.AND)).toContain('"email":{"contains":"chifa"}');
  });

  it('narrows to one account type', async () => {
    const { findMany, service } = listSetup();

    await service.list({ accountType: AccountType.INDEPENDENT_DOCTOR });

    const [{ where }] = findMany.mock.calls[0] as [{ where: { role: string } }];
    expect(where.role).toBe(UserRole.INDEPENDENT_DOCTOR);
  });
});
