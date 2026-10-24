import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import {
  aiUsageSince,
  buildEntitlements,
  resolveQuotas,
  type SubscriptionForEntitlements,
} from './entitlements';
import { type PlanQuotas } from './plans/plan-quotas';

const now = new Date('2026-10-16T09:00:00.000Z');
const day = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);

const proQuotas: PlanQuotas = {
  aiAnalysesPerMonth: 100,
  aiPipelines: ['brain', 'pathology-breast', 'cardio-ecg'],
  maxDoctors: 1,
  maxPatients: null,
};

const subscription = (
  overrides: Partial<SubscriptionForEntitlements> = {},
): SubscriptionForEntitlements => ({
  customQuotas: null,
  expiresAt: day(20),
  plan: {
    code: 'DOCTOR_PRO',
    custom: false,
    id: 'plan-pro',
    name: 'Pro',
    quotas: proQuotas,
  },
  startedAt: new Date('2026-09-01T08:00:00.000Z'),
  status: SubscriptionStatus.ACTIVE,
  trial: false,
  ...overrides,
});

const noUsage = { aiAnalysesThisMonth: 0, doctors: 0, patients: 0 };

describe('resolveQuotas', () => {
  it('gives the quotas of the plan', () => {
    expect(resolveQuotas(subscription())).toEqual(proQuotas);
  });

  it('gives a trial the reference plan, with 10 analyses for the whole trial and every pipeline', () => {
    expect(
      resolveQuotas(
        subscription({ status: SubscriptionStatus.TRIALING, trial: true }),
      ),
    ).toEqual({
      aiAnalysesPerMonth: 10,
      aiPipelines: null,
      maxDoctors: 1,
      maxPatients: null,
    });
  });

  it('lets the quotas fixed by an administrator replace those of the plan, and of the trial', () => {
    const custom = {
      aiAnalysesPerMonth: 50,
      aiPipelines: ['brain'],
      maxDoctors: 3,
      maxPatients: 40,
    };

    expect(resolveQuotas(subscription({ customQuotas: custom }))).toEqual(
      custom,
    );
    expect(
      resolveQuotas(subscription({ customQuotas: custom, trial: true })),
    ).toEqual(custom);
  });

  it('allows nothing without a subscription', () => {
    expect(resolveQuotas(null)).toEqual({
      aiAnalysesPerMonth: 0,
      aiPipelines: [],
      maxDoctors: 0,
      maxPatients: 0,
    });
  });

  it('reads a plan row without quotas as unlimited, never crashes', () => {
    expect(
      resolveQuotas(
        subscription({
          plan: { ...subscription().plan, quotas: {} },
        }),
      ),
    ).toEqual({
      aiAnalysesPerMonth: null,
      aiPipelines: null,
      maxDoctors: null,
      maxPatients: null,
    });
  });
});

describe('aiUsageSince: the month starts on the 1st at midnight in Algiers', () => {
  it('counts from the 1st of the month in Algiers (UTC+1)', () => {
    expect(aiUsageSince(subscription(), now)).toEqual(
      new Date('2026-09-30T23:00:00.000Z'),
    );
  });

  it('is November in Algiers while it is still the 31st of October in UTC', () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Algiers.
    expect(
      aiUsageSince(subscription(), new Date('2026-10-31T23:30:00.000Z')),
    ).toEqual(new Date('2026-10-31T23:00:00.000Z'));
  });

  it('is still October one minute before', () => {
    expect(
      aiUsageSince(subscription(), new Date('2026-10-31T22:59:00.000Z')),
    ).toEqual(new Date('2026-09-30T23:00:00.000Z'));
  });

  it('counts a trial from its start, whatever the month', () => {
    const startedAt = new Date('2026-09-25T10:00:00.000Z');

    expect(
      aiUsageSince(
        subscription({
          startedAt,
          status: SubscriptionStatus.TRIALING,
          trial: true,
        }),
        now,
      ),
    ).toEqual(startedAt);
  });

  it('counts a plan bought mid-month from the purchase: the quota starts at zero', () => {
    const startedAt = new Date('2026-10-12T10:00:00.000Z');

    expect(aiUsageSince(subscription({ startedAt }), now)).toEqual(startedAt);
  });

  it('counts a long-standing subscription from the month start', () => {
    expect(
      aiUsageSince(
        subscription({ startedAt: new Date('2025-01-01T00:00:00.000Z') }),
        now,
      ),
    ).toEqual(new Date('2026-09-30T23:00:00.000Z'));
  });
});

describe('buildEntitlements', () => {
  it('is writable while ACTIVE or TRIALING', () => {
    expect(buildEntitlements(subscription(), noUsage, now)).toMatchObject({
      daysLeft: 20,
      readOnly: false,
      status: 'ACTIVE',
    });
    expect(
      buildEntitlements(
        subscription({
          expiresAt: day(9),
          status: SubscriptionStatus.TRIALING,
          trial: true,
        }),
        noUsage,
        now,
      ),
    ).toMatchObject({
      daysLeft: 9,
      readOnly: false,
      status: 'TRIALING',
      trial: true,
    });
  });

  it('rounds the days left up: a subscription that ends in 3 hours has one day', () => {
    expect(
      buildEntitlements(
        subscription({ expiresAt: new Date(now.getTime() + 3 * 3_600_000) }),
        noUsage,
        now,
      ).daysLeft,
    ).toBe(1);
  });

  it.each([
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.NO_PLAN,
    SubscriptionStatus.PAYMENT_PENDING,
  ])('is read-only when %s', (status) => {
    expect(
      buildEntitlements(subscription({ status }), noUsage, now).readOnly,
    ).toBe(true);
  });

  it('is read-only as soon as the end has passed, before the hourly job runs', () => {
    const result = buildEntitlements(
      subscription({ expiresAt: day(-1) }),
      noUsage,
      now,
    );

    expect(result).toMatchObject({
      daysLeft: 0,
      readOnly: true,
      status: SubscriptionStatus.EXPIRED,
    });
  });

  it('is read-only without a subscription, with no plan', () => {
    expect(buildEntitlements(null, noUsage, now)).toMatchObject({
      daysLeft: null,
      expiresAt: null,
      plan: null,
      readOnly: true,
      status: SubscriptionStatus.NO_PLAN,
      trial: false,
    });
  });

  it('carries the usage and the plan', () => {
    const usage = { aiAnalysesThisMonth: 7, doctors: 1, patients: 12 };

    expect(buildEntitlements(subscription(), usage, now)).toMatchObject({
      plan: { code: 'DOCTOR_PRO', name: 'Pro' },
      quotas: proQuotas,
      usage,
    });
  });
});
