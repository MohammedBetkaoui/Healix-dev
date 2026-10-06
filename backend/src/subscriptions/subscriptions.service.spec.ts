import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountStatus } from '../common/enums/account-status.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

type Row = Record<string, unknown>;

const now = new Date('2026-10-06T12:00:00.000Z');
const past = new Date('2026-10-06T11:00:00.000Z');
const future = new Date('2026-11-06T12:00:00.000Z');

// Applies the subset of Prisma filters the service uses (equality, lt, in)
// and fails loudly on anything else, so a new filter cannot pass unnoticed.
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];

    if (
      condition !== null &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const filter = condition as { in?: unknown[]; lt?: Date };

      if (filter.lt !== undefined) {
        return value instanceof Date && value < filter.lt;
      }

      if (filter.in !== undefined) {
        return filter.in.includes(value);
      }

      throw new Error(
        `Unsupported filter on ${key}: ${JSON.stringify(condition)}`,
      );
    }

    return value === condition;
  });
}

function fakeTable(rows: Row[]) {
  return {
    count: jest.fn(({ where }: { where: Row }) =>
      Promise.resolve(rows.filter((row) => matches(row, where)).length),
    ),
    create: jest.fn(({ data }: { data: Row }) => {
      const row = { id: `row-${rows.length + 1}`, ...data };
      rows.push(row);
      return Promise.resolve(row);
    }),
    findMany: jest.fn(
      ({ select, where }: { select?: Record<string, boolean>; where: Row }) =>
        Promise.resolve(
          rows
            .filter((row) => matches(row, where))
            .map((row) =>
              select
                ? Object.fromEntries(
                    Object.keys(select).map((key) => [key, row[key]]),
                  )
                : { ...row },
            ),
        ),
    ),
    updateMany: jest.fn(({ data, where }: { data: Row; where: Row }) => {
      const hits = rows.filter((row) => matches(row, where));
      hits.forEach((row) => Object.assign(row, data));
      return Promise.resolve({ count: hits.length });
    }),
  };
}

function createDatabase() {
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
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
    {
      id: 'profile-current',
      userId: 'doctor-current',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
    {
      id: 'profile-affiliated',
      userId: 'affiliated',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
  ];
  const subscriptions: Row[] = [
    {
      id: 'sub-establishment',
      userId: 'owner-due',
      accountType: AccountType.ESTABLISHMENT,
      status: SubscriptionStatus.ACTIVE,
      expiresAt: past,
    },
    {
      id: 'sub-doctor',
      userId: 'doctor-due',
      accountType: AccountType.INDEPENDENT_DOCTOR,
      status: SubscriptionStatus.ACTIVE,
      expiresAt: past,
    },
    {
      id: 'sub-current',
      userId: 'doctor-current',
      accountType: AccountType.INDEPENDENT_DOCTOR,
      status: SubscriptionStatus.ACTIVE,
      expiresAt: future,
    },
  ];
  const auditLogs: Row[] = [];

  const prisma = {
    auditLog: fakeTable(auditLogs),
    doctorProfile: fakeTable(doctorProfiles),
    establishment: fakeTable(establishments),
    subscription: fakeTable(subscriptions),
    user: fakeTable(users),
  };
  const $transaction = jest.fn(
    (run: (client: typeof prisma) => Promise<unknown>) => run(prisma),
  );
  const prismaService = { ...prisma, $transaction } as unknown as PrismaService;
  const service = new SubscriptionsService(
    prismaService,
    new AuditLogsService(prismaService),
  );

  const find = (rows: Row[], id: string) =>
    rows.find((row) => row.id === id) as Row;

  return {
    $transaction,
    auditLogs,
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
        metadata: { userId: 'owner-due' },
        user: undefined,
      }),
      expect.objectContaining({
        action: 'SUBSCRIPTION_EXPIRED',
        entityType: 'SUBSCRIPTION',
        entityId: 'sub-doctor',
        metadata: { userId: 'doctor-due' },
        user: undefined,
      }),
    ]);
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

  it('never modifies an affiliated doctor, who has no Subscription row', async () => {
    const db = createDatabase();

    await db.service.expireDueSubscriptions(now);

    expect(db.user('affiliated').accountStatus).toBe(AccountStatus.ACTIVE);
    expect(db.doctorProfile('profile-affiliated').subscriptionStatus).toBe(
      SubscriptionStatus.ACTIVE,
    );
    for (const table of [db.prisma.user, db.prisma.doctorProfile]) {
      for (const [args] of table.updateMany.mock.calls) {
        expect(JSON.stringify(args)).not.toContain('affiliated');
      }
    }
  });

  it('is idempotent: a second run expires nothing and logs nothing', async () => {
    const db = createDatabase();

    await expect(db.service.expireDueSubscriptions(now)).resolves.toBe(2);
    const logsAfterFirstRun = db.auditLogs.length;

    await expect(db.service.expireDueSubscriptions(now)).resolves.toBe(0);
    expect(db.auditLogs).toHaveLength(logsAfterFirstRun);
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

  it('keeps an account ACTIVE while it still holds another active subscription', async () => {
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
