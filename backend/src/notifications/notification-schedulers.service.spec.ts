import { type PrismaService } from '../prisma/prisma.service';
import { type NotificationProducerService } from './notification-producer.service';
import { NotificationSchedulersService } from './notification-schedulers.service';

const now = new Date('2026-10-16T08:15:00.000Z');
const inDays = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);

function setup(
  rows: { expiresAt: Date; id?: string; trial: boolean; userId?: string }[],
) {
  const findMany = jest.fn().mockResolvedValue(
    rows.map((row, index) => ({
      id: `sub-${index + 1}`,
      userId: `user-${index + 1}`,
      ...row,
    })),
  );
  const create = jest.fn().mockResolvedValue(null);
  const service = new NotificationSchedulersService(
    { subscription: { findMany } } as unknown as PrismaService,
    { create } as unknown as NotificationProducerService,
  );

  return { create, findMany, service };
}

describe('NotificationSchedulersService.createSubscriptionExpiryNotifications', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('looks at the live subscriptions, trials included, that end within 30 days', async () => {
    const { findMany, service } = setup([]);

    await service.createSubscriptionExpiryNotifications();

    expect(findMany).toHaveBeenCalledWith({
      select: { expiresAt: true, id: true, trial: true, userId: true },
      where: {
        expiresAt: { gt: now, lte: inDays(30) },
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
    });
  });

  it.each([
    [7, 7],
    [6, 7],
    [4, 7],
    [3, 3],
    [2, 3],
    [1, 1],
    [0.5, 1],
  ])(
    'reminds a trial ending in %s day(s) at the %s-day threshold',
    async (daysLeft, threshold) => {
      const { create, service } = setup([
        { expiresAt: inDays(daysLeft), trial: true },
      ]);

      await service.createSubscriptionExpiryNotifications();

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'SUBSCRIPTION',
          data: { daysRemaining: threshold, subscriptionId: 'sub-1' },
          severity: threshold === 1 ? 'WARNING' : 'INFO',
          type: 'TRIAL_EXPIRING',
          userId: 'user-1',
        }),
      );
    },
  );

  it('says nothing to a trial that has more than 7 days left', async () => {
    const { create, service } = setup([{ expiresAt: inDays(10), trial: true }]);

    await service.createSubscriptionExpiryNotifications();

    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [25, 30],
    [8, 30],
    [7, 7],
    [3, 7],
    [1, 1],
  ])(
    'keeps the reminders of a paid subscription: %s day(s) left, threshold %s',
    async (daysLeft, threshold) => {
      const { create, service } = setup([
        { expiresAt: inDays(daysLeft), trial: false },
      ]);

      await service.createSubscriptionExpiryNotifications();

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { daysRemaining: threshold, subscriptionId: 'sub-1' },
          type: 'SUBSCRIPTION_EXPIRING',
        }),
      );
    },
  );

  it('sends one reminder per threshold and per expiry date: a renewed subscription is reminded again', async () => {
    const first = setup([{ expiresAt: inDays(6), trial: false }]);
    await first.service.createSubscriptionExpiryNotifications();

    // The same row, renewed one month later, reaches its 7-day threshold again.
    jest.setSystemTime(new Date('2026-11-15T08:15:00.000Z'));
    const renewed = setup([
      { expiresAt: new Date('2026-11-21T08:15:00.000Z'), trial: false },
    ]);
    await renewed.service.createSubscriptionExpiryNotifications();

    const keyOf = (create: jest.Mock) =>
      (create.mock.calls[0] as [{ dedupeKey: string }])[0].dedupeKey;
    expect(keyOf(first.create)).toBe(
      'subscription_expiring:sub-1:7:2026-10-22',
    );
    expect(keyOf(renewed.create)).toBe(
      'subscription_expiring:sub-1:7:2026-11-21',
    );
  });

  it('never rejects: a failure is logged and the next run retries', async () => {
    const { findMany, service } = setup([]);
    findMany.mockRejectedValue(new Error('database down'));

    await expect(
      service.createSubscriptionExpiryNotifications(),
    ).resolves.toBeUndefined();
  });
});
