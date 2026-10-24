/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type Payment } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountStatus } from '../common/enums/account-status.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { BillingPeriod } from '../common/enums/billing-period.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { type NotificationProducerService } from '../notifications/notification-producer.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';
import { fakeTable, type Row } from './testing/fake-database';

const now = new Date('2026-10-06T12:00:00.000Z');
const past = new Date('2026-10-06T11:00:00.000Z');
const future = new Date('2026-11-06T12:00:00.000Z');

function createDatabase(options: { notifications?: boolean } = {}) {
  const users: Row[] = [
    {
      id: 'owner-due',
      role: UserRole.ESTABLISHMENT_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    },
    {
      id: 'doctor-due',
      role: UserRole.INDEPENDENT_DOCTOR,
      accountStatus: AccountStatus.ACTIVE,
    },
    {
      id: 'doctor-current',
      role: UserRole.INDEPENDENT_DOCTOR,
      accountStatus: AccountStatus.ACTIVE,
    },
    // Created ACTIVE by DoctorsService.createAffiliatedDoctor, without any Subscription.
    {
      id: 'affiliated',
      role: UserRole.AFFILIATED_DOCTOR,
      accountStatus: AccountStatus.ACTIVE,
    },
    {
      id: 'doctor-new',
      role: UserRole.INDEPENDENT_DOCTOR,
      accountStatus: AccountStatus.VERIFIED_NO_PLAN,
    },
  ];
  const establishments: Row[] = [
    {
      id: 'establishment-1',
      ownerId: 'owner-due',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
  ];
  const doctorProfiles: Row[] = [
    {
      id: 'profile-due',
      userId: 'doctor-due',
      isIndependent: true,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
    {
      id: 'profile-current',
      userId: 'doctor-current',
      isIndependent: true,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
    {
      id: 'profile-affiliated',
      userId: 'affiliated',
      isIndependent: false,
      establishmentId: 'establishment-1',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
    {
      id: 'profile-new',
      userId: 'doctor-new',
      isIndependent: true,
      subscriptionStatus: SubscriptionStatus.NO_PLAN,
    },
  ];
  const plans: Row[] = [
    { id: 'plan-doctor-pro', code: 'DOCTOR_PRO' },
    { id: 'plan-est-basic', code: 'EST_BASIC_CLINIC' },
  ];
  const subscriptions: Row[] = [
    {
      id: 'sub-establishment',
      userId: 'owner-due',
      accountType: AccountType.ESTABLISHMENT,
      planId: 'plan-est-basic',
      status: SubscriptionStatus.ACTIVE,
      trial: false,
      expiresAt: past,
    },
    {
      id: 'sub-doctor',
      userId: 'doctor-due',
      accountType: AccountType.INDEPENDENT_DOCTOR,
      planId: 'plan-doctor-pro',
      status: SubscriptionStatus.ACTIVE,
      trial: false,
      expiresAt: past,
    },
    {
      id: 'sub-current',
      userId: 'doctor-current',
      accountType: AccountType.INDEPENDENT_DOCTOR,
      planId: 'plan-doctor-pro',
      status: SubscriptionStatus.ACTIVE,
      trial: false,
      expiresAt: future,
    },
  ];
  const auditLogs: Row[] = [];
  const events: Row[] = [];

  const prisma = {
    auditLog: fakeTable(auditLogs),
    doctorProfile: fakeTable(doctorProfiles),
    establishment: fakeTable(establishments),
    subscription: fakeTable(subscriptions),
    payment: fakeTable([{ id: 'payment-1' }]),
    subscriptionEvent: fakeTable(events, 'event'),
    subscriptionPlan: fakeTable(plans),
    user: fakeTable(users),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const $transaction = jest.fn(
    (run: (client: typeof prisma) => Promise<unknown>) => run(prisma),
  );
  const prismaService = { ...prisma, $transaction } as unknown as PrismaService;
  const notify = jest.fn().mockResolvedValue(null);
  const service = new SubscriptionsService(
    prismaService,
    new AuditLogsService(prismaService),
    options.notifications === false
      ? undefined
      : ({ create: notify } as unknown as NotificationProducerService),
  );

  const find = (rows: Row[], id: string) =>
    rows.find((row) => row.id === id) as Row;

  return {
    $transaction,
    auditLogs,
    events,
    notify,
    prisma,
    service,
    user: (id: string) => find(users, id),
    establishment: (id: string) => find(establishments, id),
    doctorProfile: (id: string) => find(doctorProfiles, id),
    subscription: (id: string) => find(subscriptions, id),
    users,
    subscriptions,
  };
}

describe('SubscriptionsService.expireDueSubscriptions', () => {
  it('expires a due subscription and returns its account to VERIFIED_NO_PLAN', async () => {
    const db = createDatabase();

    await expect(db.service.expireDueSubscriptions(now)).resolves.toBe(2);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.subscription('sub-establishment').status).toBe(
      SubscriptionStatus.EXPIRED,
    );
    expect(db.user('owner-due').accountStatus).toBe(
      AccountStatus.VERIFIED_NO_PLAN,
    );
    expect(db.establishment('establishment-1').subscriptionStatus).toBe(
      SubscriptionStatus.EXPIRED,
    );

    expect(db.subscription('sub-doctor').status).toBe(
      SubscriptionStatus.EXPIRED,
    );
    expect(db.user('doctor-due').accountStatus).toBe(
      AccountStatus.VERIFIED_NO_PLAN,
    );
    expect(db.doctorProfile('profile-due').subscriptionStatus).toBe(
      SubscriptionStatus.EXPIRED,
    );

    // System action: no acting user is connected, the account is in metadata.
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        action: 'SUBSCRIPTION_EXPIRED',
        entityType: 'SUBSCRIPTION',
        entityId: 'sub-establishment',
        metadata: { trial: false, userId: 'owner-due' },
        user: undefined,
      }),
      expect.objectContaining({
        action: 'SUBSCRIPTION_EXPIRED',
        entityType: 'SUBSCRIPTION',
        entityId: 'sub-doctor',
        metadata: { trial: false, userId: 'doctor-due' },
        user: undefined,
      }),
    ]);
  });

  it('expires a trial like a paid subscription, and says so in the history and the notification', async () => {
    const db = createDatabase();
    Object.assign(db.subscription('sub-doctor'), {
      status: SubscriptionStatus.TRIALING,
      trial: true,
    });
    db.doctorProfile('profile-due').subscriptionStatus =
      SubscriptionStatus.TRIALING;

    await expect(db.service.expireDueSubscriptions(now)).resolves.toBe(2);

    expect(db.subscription('sub-doctor').status).toBe(
      SubscriptionStatus.EXPIRED,
    );
    expect(db.doctorProfile('profile-due').subscriptionStatus).toBe(
      SubscriptionStatus.EXPIRED,
    );
    expect(db.user('doctor-due').accountStatus).toBe(
      AccountStatus.VERIFIED_NO_PLAN,
    );
    expect(db.events).toContainEqual(
      expect.objectContaining({
        fromStatus: SubscriptionStatus.TRIALING,
        subscriptionId: 'sub-doctor',
        toStatus: SubscriptionStatus.EXPIRED,
        type: 'EXPIRED',
      }),
    );
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { subscriptionId: 'sub-doctor', trial: true },
        type: 'SUBSCRIPTION_EXPIRED',
        userId: 'doctor-due',
      }),
    );
  });

  it('records an EXPIRED event per subscription, and notifies once committed', async () => {
    const db = createDatabase();

    await db.service.expireDueSubscriptions(now);

    expect(db.events.map((event) => event.subscriptionId)).toEqual([
      'sub-establishment',
      'sub-doctor',
    ]);
    expect(db.notify).toHaveBeenCalledTimes(2);
    // The notifications go out after the transaction, never inside.
    expect(db.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      db.notify.mock.invocationCallOrder[0],
    );
  });

  it('leaves a subscription that is not due untouched', async () => {
    const db = createDatabase();

    await db.service.expireDueSubscriptions(now);

    expect(db.subscription('sub-current')).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: future,
    });
    expect(db.user('doctor-current').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.doctorProfile('profile-current').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
    expect(db.auditLogs.map((log) => log.entityId)).not.toContain(
      'sub-current',
    );
  });

  it("never modifies an affiliated doctor's account, who has no Subscription row; only the status copied on the profile follows the establishment", async () => {
    const db = createDatabase();

    await db.service.expireDueSubscriptions(now);

    expect(db.user('affiliated').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.doctorProfile('profile-affiliated').subscriptionStatus).toBe(
      SubscriptionStatus.EXPIRED,
    );
    for (const [args] of db.prisma.user.updateMany.mock.calls) {
      expect(JSON.stringify(args)).not.toContain('affiliated');
    }
  });

  it('is idempotent: a second run expires nothing and logs nothing', async () => {
    const db = createDatabase();

    await expect(db.service.expireDueSubscriptions(now)).resolves.toBe(2);
    const logsAfterFirstRun = db.auditLogs.length;
    const eventsAfterFirstRun = db.events.length;

    await expect(db.service.expireDueSubscriptions(now)).resolves.toBe(0);
    expect(db.auditLogs).toHaveLength(logsAfterFirstRun);
    expect(db.events).toHaveLength(eventsAfterFirstRun);
  });

  it('expires the subscription of a suspended account without reactivating or changing its status', async () => {
    const db = createDatabase();
    db.user('owner-due').accountStatus = AccountStatus.SUSPENDED;

    await db.service.expireDueSubscriptions(now);

    expect(db.subscription('sub-establishment').status).toBe(
      SubscriptionStatus.EXPIRED,
    );
    expect(db.user('owner-due').accountStatus).toBe(AccountStatus.SUSPENDED);
    expect(db.establishment('establishment-1').subscriptionStatus).toBe(
      SubscriptionStatus.EXPIRED,
    );
  });

  it('skips a row renewed between the select and the update', async () => {
    const db = createDatabase();
    const select = db.prisma.subscription.findMany.getMockImplementation()!;
    db.prisma.subscription.findMany.mockImplementationOnce(async (args) => {
      const due = await select(args);
      // An approved renewal keeps the row ACTIVE and moves expiresAt forward.
      db.subscription('sub-doctor').expiresAt = future;
      return due;
    });

    await expect(db.service.expireDueSubscriptions(now)).resolves.toBe(1);

    expect(db.subscription('sub-doctor').status).toBe(
      SubscriptionStatus.ACTIVE,
    );
    expect(db.user('doctor-due').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.doctorProfile('profile-due').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
  });

  it('keeps an account ACTIVE while it still holds another live subscription', async () => {
    const db = createDatabase();
    db.subscriptions.push({
      id: 'sub-owner-current',
      userId: 'owner-due',
      accountType: AccountType.ESTABLISHMENT,
      status: SubscriptionStatus.ACTIVE,
      expiresAt: future,
    });

    await db.service.expireDueSubscriptions(now);

    expect(db.subscription('sub-establishment').status).toBe(
      SubscriptionStatus.EXPIRED,
    );
    expect(db.user('owner-due').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.establishment('establishment-1').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
  });
});

describe('SubscriptionsService.startTrial', () => {
  it('gives a verified account a 14-day trial: TRIALING, ACTIVE account, event, audit', async () => {
    const db = createDatabase();

    const trial = await db.service.startTrial(
      'doctor-new',
      AccountType.INDEPENDENT_DOCTOR,
      db.prisma as never,
    );

    expect(trial).toMatchObject({
      accountType: AccountType.INDEPENDENT_DOCTOR,
      planId: 'plan-doctor-pro',
      status: SubscriptionStatus.TRIALING,
      trial: true,
      userId: 'doctor-new',
    });
    const days =
      ((trial?.expiresAt as Date).getTime() -
        (trial?.startedAt as Date).getTime()) /
      86_400_000;
    expect(days).toBe(14);
    expect(db.user('doctor-new').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.doctorProfile('profile-new').subscriptionStatus).toBe(
      SubscriptionStatus.TRIALING,
    );
    expect(db.events).toEqual([
      expect.objectContaining({
        subscriptionId: trial?.id,
        toPlanId: 'plan-doctor-pro',
        toStatus: SubscriptionStatus.TRIALING,
        type: 'TRIAL_STARTED',
      }),
    ]);
    expect(db.auditLogs).toEqual([
      expect.objectContaining({ action: 'TRIAL_STARTED' }),
    ]);
  });

  it('uses the Basic Clinic reference plan for an establishment', async () => {
    const db = createDatabase();
    db.subscriptions.length = 0;

    const trial = await db.service.startTrial(
      'owner-due',
      AccountType.ESTABLISHMENT,
      db.prisma as never,
    );

    expect(trial?.planId).toBe('plan-est-basic');
    // The doctors affiliated to it follow its status.
    expect(db.doctorProfile('profile-affiliated').subscriptionStatus).toBe(
      SubscriptionStatus.TRIALING,
    );
    expect(db.establishment('establishment-1').subscriptionStatus).toBe(
      SubscriptionStatus.TRIALING,
    );
  });

  it.each([
    ['holds a paid subscription', SubscriptionStatus.ACTIVE],
    ['had a trial that ended', SubscriptionStatus.EXPIRED],
    ['was stopped', SubscriptionStatus.CANCELED],
  ])('gives no second trial to an account that %s', async (_case, status) => {
    const db = createDatabase();
    db.subscriptions.push({
      id: 'sub-previous',
      userId: 'doctor-new',
      status,
    });

    await expect(
      db.service.startTrial(
        'doctor-new',
        AccountType.INDEPENDENT_DOCTOR,
        db.prisma as never,
      ),
    ).resolves.toBeNull();
    expect(db.subscriptions).toHaveLength(4);
    expect(db.events).toHaveLength(0);
  });

  it('starts nothing when the reference plan is not registered yet', async () => {
    const db = createDatabase();
    db.prisma.subscriptionPlan.findFirst.mockResolvedValueOnce(null);

    await expect(
      db.service.startTrial(
        'doctor-new',
        AccountType.INDEPENDENT_DOCTOR,
        db.prisma as never,
      ),
    ).resolves.toBeNull();
  });

  it('serializes two approvals of one account on the user row', async () => {
    const db = createDatabase();

    await db.service.startTrial(
      'doctor-new',
      AccountType.INDEPENDENT_DOCTOR,
      db.prisma as never,
    );

    const [sqlParts, ...values] = db.prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sqlParts.join('?')).toContain('FOR UPDATE');
    expect(values).toEqual(['doctor-new']);
  });
});

const payment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'payment-1',
    reference: 'HLX-PAY-2026-000001',
    userId: 'doctor-current',
    planId: 'plan-doctor-pro',
    accountType: AccountType.INDEPENDENT_DOCTOR,
    billingPeriod: BillingPeriod.MONTHLY,
    ...overrides,
  }) as Payment;

describe('SubscriptionsService.applyPurchase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renews a live subscription from its expiry, not from today, and logs it', async () => {
    const db = createDatabase();

    const outcome = await db.service.applyPurchase(
      payment(),
      db.prisma as never,
    );

    // 6 Nov 12:00 + one month.
    expect(outcome.subscription.expiresAt).toEqual(
      new Date('2026-12-06T12:00:00.000Z'),
    );
    expect(outcome.type).toBe('RENEWED');
    expect(db.subscriptions).toHaveLength(3);
    expect(db.events).toEqual([
      expect.objectContaining({
        fromExpiresAt: future,
        paymentId: 'payment-1',
        toExpiresAt: new Date('2026-12-06T12:00:00.000Z'),
        type: 'RENEWED',
      }),
    ]);
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        action: 'SUBSCRIPTION_ACTIVATED',
        metadata: expect.objectContaining({
          paymentId: 'payment-1',
          type: 'RENEWED',
        }),
      }),
    ]);
  });

  it('starts a subscription for an account that never had one', async () => {
    const db = createDatabase();

    const outcome = await db.service.applyPurchase(
      payment({ userId: 'doctor-new' }),
      db.prisma as never,
    );

    expect(outcome.type).toBe('PURCHASED');
    expect(outcome.subscription).toMatchObject({
      accountType: AccountType.INDEPENDENT_DOCTOR,
      expiresAt: new Date('2026-11-06T12:00:00.000Z'),
      status: SubscriptionStatus.ACTIVE,
      trial: false,
      userId: 'doctor-new',
    });
    expect(db.user('doctor-new').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.doctorProfile('profile-new').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
  });

  it('keeps the account ACTIVE and the copied status in step with the subscription', async () => {
    const db = createDatabase();

    await db.service.applyPurchase(
      payment({
        accountType: AccountType.ESTABLISHMENT,
        planId: 'plan-est-basic',
        userId: 'owner-due',
      }),
      db.prisma as never,
    );

    // The establishment was lapsed (past): bought again, from now.
    expect(db.subscription('sub-establishment')).toMatchObject({
      expiresAt: new Date('2026-11-06T12:00:00.000Z'),
      status: SubscriptionStatus.ACTIVE,
    });
    expect(db.establishment('establishment-1').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
    expect(db.doctorProfile('profile-affiliated').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
  });

  it('locks the subscription before reading it', async () => {
    const db = createDatabase();

    await db.service.applyPurchase(payment(), db.prisma as never);

    const [sqlParts] = db.prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
    ];
    expect(sqlParts.join('?')).toContain('FROM subscriptions');
    expect(sqlParts.join('?')).toContain('FOR UPDATE');
    expect(db.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.prisma.subscription.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('notifies "subscription activated" with the new expiry, once asked', async () => {
    const db = createDatabase();

    const outcome = await db.service.applyPurchase(
      payment(),
      db.prisma as never,
    );
    expect(db.notify).not.toHaveBeenCalled();

    await db.service.notifyPurchase(outcome);

    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          expiresAt: '2026-12-06T12:00:00.000Z',
          subscriptionId: 'sub-current',
        },
        dedupeKey: 'subscription-activated:payment-1',
        type: 'SUBSCRIPTION_ACTIVATED',
        userId: 'doctor-current',
      }),
    );
  });

  it('works without a notification producer', async () => {
    const db = createDatabase({ notifications: false });

    const outcome = await db.service.applyPurchase(
      payment(),
      db.prisma as never,
    );

    await expect(db.service.notifyPurchase(outcome)).resolves.toBeUndefined();
  });
});

describe('SubscriptionsService.previewPurchase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the new expiry before paying, without writing anything', async () => {
    const db = createDatabase();

    const preview = await db.service.previewPurchase({
      billingPeriod: BillingPeriod.ANNUAL,
      planId: 'plan-doctor-pro',
      userId: 'doctor-current',
    });

    expect(preview).toEqual({
      currentExpiresAt: future,
      endsTrial: false,
      expiresAt: new Date('2027-11-06T12:00:00.000Z'),
      type: 'RENEWED',
    });
    expect(db.prisma.subscription.update).not.toHaveBeenCalled();
    expect(db.prisma.subscription.create).not.toHaveBeenCalled();
  });
});

describe('SubscriptionsService.getMyHistory', () => {
  it('lists the payments and the events of the account, without the reasons or the names of administrators', async () => {
    const db = createDatabase();
    db.prisma.payment.create({
      data: {
        amount: 5900,
        billingPeriod: BillingPeriod.MONTHLY,
        cardLast4: '1234',
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        currency: 'DZD',
        method: 'SYNTHETIC_CHARGILY',
        reference: 'HLX-PAY-2026-000001',
        status: 'PAID',
        userId: 'doctor-current',
      },
    });
    // The events of the account (a relation filter the double does not read).
    db.prisma.subscriptionEvent.findMany.mockResolvedValueOnce([
      {
        actorId: 'admin-1',
        createdAt: new Date('2026-10-05T10:00:00.000Z'),
        id: 'event-2',
        paymentId: null,
        reason: 'Geste commercial interne',
        toStatus: SubscriptionStatus.ACTIVE,
        type: 'RENEWED',
      },
      {
        actorId: null,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        id: 'event-1',
        payment: { reference: 'HLX-PAY-2026-000001' },
        paymentId: 'payment-1',
        toStatus: SubscriptionStatus.ACTIVE,
        type: 'PURCHASED',
      },
    ]);

    const history = await db.service.getMyHistory('doctor-current');

    expect(db.prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'doctor-current' } }),
    );
    expect(db.prisma.subscriptionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscription: { userId: 'doctor-current' } },
      }),
    );
    expect(history.payments).toEqual([
      expect.objectContaining({
        amount: 5900,
        cardLast4: '1234',
        reference: 'HLX-PAY-2026-000001',
        status: 'PAID',
      }),
    ]);
    expect(history.events.map((event) => event.byAdministrator)).toEqual([
      true,
      false,
    ]);
    // Never what an administrator wrote, nor who they are.
    const shown = JSON.stringify(history);
    expect(shown).not.toContain('Geste commercial interne');
    expect(shown).not.toContain('admin-1');
    expect(shown).not.toContain('actorId');
  });
});
