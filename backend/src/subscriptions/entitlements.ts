import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import {
  normalizeQuotas,
  type PlanQuotas,
  trialQuotas,
} from './plans/plan-quotas';
import { daysLeft, startOfQuotaMonth } from './subscription-period';
import { effectiveStatus, isLive } from './subscription-transitions';

// What a workspace may do, from its subscription row, the usage counted in
// the database, and the clock. Pure: the service gathers, this decides.

export type EntitlementUsage = {
  patients: number;
  aiAnalysesThisMonth: number;
  doctors: number;
};

export type Entitlements = {
  status: SubscriptionStatus;
  trial: boolean;
  plan: { id: string; code: string; name: string; custom: boolean } | null;
  expiresAt: Date | null;
  daysLeft: number | null;
  // Not ACTIVE nor TRIALING: reading, downloading and the account stay open,
  // creating is refused.
  readOnly: boolean;
  quotas: PlanQuotas;
  usage: EntitlementUsage;
};

export type SubscriptionForEntitlements = {
  status: string;
  trial: boolean;
  startedAt: Date | null;
  expiresAt: Date | null;
  customQuotas: unknown;
  plan: {
    id: string;
    code: string;
    name: string;
    custom: boolean;
    quotas: unknown;
  };
};

// Nothing is allowed without a plan.
const NO_PLAN_QUOTAS: PlanQuotas = {
  aiAnalysesPerMonth: 0,
  aiPipelines: [],
  maxDoctors: 0,
  maxPatients: 0,
};

// The quotas that apply: those an administrator fixed, else those of the
// trial while it lasts, else those of the plan.
export function resolveQuotas(
  subscription: SubscriptionForEntitlements | null,
): PlanQuotas {
  if (!subscription) {
    return { ...NO_PLAN_QUOTAS, aiPipelines: [] };
  }

  if (subscription.customQuotas) {
    return normalizeQuotas(subscription.customQuotas);
  }

  const planQuotas = normalizeQuotas(subscription.plan.quotas);
  return subscription.trial ? trialQuotas(planQuotas) : planQuotas;
}

// AI analyses are counted since this instant: the whole trial during a trial,
// otherwise the 1st of the month in Algiers, or the start of the paid period
// if that is later (an account that buys at the end of its trial starts at
// 0, a plan change or a renewal keeps what the month already used).
export function aiUsageSince(
  subscription: Pick<SubscriptionForEntitlements, 'trial' | 'startedAt'> | null,
  now: Date,
): Date {
  const monthStart = startOfQuotaMonth(now);

  if (!subscription?.startedAt) {
    return monthStart;
  }

  if (subscription.trial) {
    return subscription.startedAt;
  }

  return subscription.startedAt > monthStart
    ? subscription.startedAt
    : monthStart;
}

export function buildEntitlements(
  subscription: SubscriptionForEntitlements | null,
  usage: EntitlementUsage,
  now: Date,
): Entitlements {
  return {
    daysLeft: daysLeft(subscription?.expiresAt ?? null, now),
    expiresAt: subscription?.expiresAt ?? null,
    plan: subscription
      ? {
          code: subscription.plan.code,
          custom: subscription.plan.custom,
          id: subscription.plan.id,
          name: subscription.plan.name,
        }
      : null,
    quotas: resolveQuotas(subscription),
    readOnly: !isLive(subscription, now),
    status: effectiveStatus(subscription, now),
    trial: subscription?.trial ?? false,
    usage,
  };
}
