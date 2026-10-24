import { BillingPeriod } from '../common/enums/billing-period.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { addMonths } from './subscription-period';
import {
  effectiveStatus,
  isLive,
  planPurchase,
  type SubscriptionState,
} from './subscription-transitions';

const now = new Date('2026-10-06T12:00:00.000Z');
const day = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);

const subscription = (
  overrides: Partial<SubscriptionState> = {},
): SubscriptionState => ({
  billingPeriod: BillingPeriod.MONTHLY,
  expiresAt: day(20),
  id: 'sub-1',
  planId: 'plan-pro',
  startedAt: new Date('2026-09-01T08:00:00.000Z'),
  status: SubscriptionStatus.ACTIVE,
  trial: false,
  ...overrides,
});

const purchase = (
  current: SubscriptionState | null,
  planId = 'plan-pro',
  billingPeriod: BillingPeriod = BillingPeriod.MONTHLY,
) => planPurchase({ billingPeriod, current, now, planId });

describe('planPurchase', () => {
  it('starts the first subscription from now', () => {
    const result = purchase(null);

    expect(result.type).toBe('PURCHASED');
    expect(result.data).toMatchObject({
      canceledAt: null,
      expiresAt: new Date('2026-11-06T12:00:00.000Z'),
      planId: 'plan-pro',
      startedAt: now,
      status: SubscriptionStatus.ACTIVE,
      trial: false,
    });
    expect(result.endedTrial).toBe(false);
  });

  it('renews the same plan from the current expiry, not from today: the days left are kept', () => {
    const result = purchase(subscription({ expiresAt: day(20) }));

    expect(result.type).toBe('RENEWED');
    // 26 Oct + one month: the 20 days left were not lost.
    expect(result.data.expiresAt).toEqual(new Date('2026-11-26T12:00:00.000Z'));
    // A renewal does not restart the period the AI quota counts from.
    expect(result.data.startedAt).toEqual(new Date('2026-09-01T08:00:00.000Z'));
    expect(result.clearCustomQuotas).toBe(false);
  });

  it('adds twelve months for an annual purchase', () => {
    const result = purchase(
      subscription({ expiresAt: day(20) }),
      'plan-pro',
      BillingPeriod.ANNUAL,
    );

    expect(result.data.expiresAt).toEqual(new Date('2027-10-26T12:00:00.000Z'));
    expect(result.data.billingPeriod).toBe(BillingPeriod.ANNUAL);
  });

  it.each([
    ['an upgrade', 'plan-premium'],
    ['a downgrade', 'plan-starter'],
  ])(
    'moves to the new plan at once on %s and adds the paid period after what is left',
    (_case, planId) => {
      const result = purchase(subscription({ expiresAt: day(10) }), planId);

      expect(result.type).toBe('PLAN_CHANGED');
      expect(result.data.planId).toBe(planId);
      expect(result.data.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.data.expiresAt).toEqual(
        new Date('2026-11-16T12:00:00.000Z'),
      );
      // The contract's custom quotas do not follow a plan bought online.
      expect(result.clearCustomQuotas).toBe(true);
      expect(result.data.startedAt).toEqual(
        new Date('2026-09-01T08:00:00.000Z'),
      );
    },
  );

  it('ends the trial with the purchase and keeps the days of the trial that are left', () => {
    const trial = subscription({
      expiresAt: day(9),
      startedAt: day(-5),
      status: SubscriptionStatus.TRIALING,
      trial: true,
    });

    const result = purchase(trial, 'plan-pro');

    expect(result.type).toBe('PURCHASED');
    expect(result.endedTrial).toBe(true);
    expect(result.data).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      trial: false,
      // 15 Oct (end of the trial) + one month.
      expiresAt: new Date('2026-11-15T12:00:00.000Z'),
      // The paid period, and its AI quota, start now.
      startedAt: now,
    });
    expect(result.clearCustomQuotas).toBe(true);
  });

  it('applies the plan bought during a trial, whatever the reference plan was', () => {
    const trial = subscription({
      expiresAt: day(9),
      planId: 'plan-pro',
      status: SubscriptionStatus.TRIALING,
      trial: true,
    });

    expect(purchase(trial, 'plan-premium').data.planId).toBe('plan-premium');
  });

  it.each([
    ['expired', SubscriptionStatus.EXPIRED, day(-3)],
    // Stopped by an administrator with days left: nothing is carried over.
    ['canceled', SubscriptionStatus.CANCELED, day(10)],
    // The hourly job has not run yet: the clock decides.
    ['active but past its end', SubscriptionStatus.ACTIVE, day(-1)],
  ])('restarts from now after a lapse (%s)', (_case, status, expiresAt) => {
    const result = purchase(subscription({ expiresAt, status }));

    expect(result.type).toBe('PURCHASED');
    expect(result.data.expiresAt).toEqual(new Date('2026-11-06T12:00:00.000Z'));
    expect(result.data.startedAt).toEqual(now);
    expect(result.data.canceledAt).toBeNull();
    expect(result.endedTrial).toBe(false);
  });

  it('an expired trial bought after its end is a plain purchase from now', () => {
    const result = purchase(
      subscription({
        expiresAt: day(-2),
        status: SubscriptionStatus.EXPIRED,
        trial: true,
      }),
    );

    expect(result.type).toBe('PURCHASED');
    expect(result.endedTrial).toBe(false);
    expect(result.data.expiresAt).toEqual(new Date('2026-11-06T12:00:00.000Z'));
  });
});

describe('addMonths', () => {
  it('lands on the last day of a shorter month', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00.000Z'), 1)).toEqual(
      new Date('2026-02-28T10:00:00.000Z'),
    );
    expect(addMonths(new Date('2027-12-31T10:00:00.000Z'), 12)).toEqual(
      new Date('2028-12-31T10:00:00.000Z'),
    );
    expect(addMonths(new Date('2028-01-31T10:00:00.000Z'), 1)).toEqual(
      new Date('2028-02-29T10:00:00.000Z'),
    );
  });
});

describe('isLive / effectiveStatus', () => {
  it.each([
    [SubscriptionStatus.ACTIVE, day(1), true, SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.TRIALING, day(1), true, SubscriptionStatus.TRIALING],
    // Past its end, whatever the stored status says.
    [SubscriptionStatus.ACTIVE, day(-1), false, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.TRIALING, day(-1), false, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.EXPIRED, day(-1), false, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.CANCELED, day(5), false, SubscriptionStatus.CANCELED],
    [SubscriptionStatus.ACTIVE, null, true, SubscriptionStatus.ACTIVE],
  ])(
    '%s expiring %s: live %s, effective %s',
    (status, expiresAt, live, effective) => {
      expect(isLive({ expiresAt, status }, now)).toBe(live);
      expect(effectiveStatus({ expiresAt, status }, now)).toBe(effective);
    },
  );

  it('has no plan without a row', () => {
    expect(isLive(null, now)).toBe(false);
    expect(effectiveStatus(null, now)).toBe(SubscriptionStatus.NO_PLAN);
  });
});
