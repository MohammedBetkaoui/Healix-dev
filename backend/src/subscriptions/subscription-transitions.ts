import { type BillingPeriod } from '../common/enums/billing-period.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { addBillingPeriod } from './subscription-period';

// The rules of a subscription's life, as pure functions of its row and of the
// clock: the services only read the row, call these, and write the answer.

export type SubscriptionState = {
  id: string;
  planId: string;
  status: string;
  trial: boolean;
  billingPeriod: BillingPeriod;
  startedAt: Date | null;
  expiresAt: Date | null;
};

// ACTIVE or TRIALING, and not past its end: the account may write. The hourly
// job moves an ended row to EXPIRED, up to an hour late: the clock decides in
// the meantime.
export function isLive(
  subscription: Pick<SubscriptionState, 'status' | 'expiresAt'> | null,
  now: Date,
): boolean {
  if (!subscription) {
    return false;
  }

  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.TRIALING
  ) {
    return false;
  }

  return !subscription.expiresAt || subscription.expiresAt > now;
}

export function effectiveStatus(
  subscription: Pick<SubscriptionState, 'status' | 'expiresAt'> | null,
  now: Date,
): SubscriptionStatus {
  if (!subscription) {
    return SubscriptionStatus.NO_PLAN;
  }

  if (
    (subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.TRIALING) &&
    !isLive(subscription, now)
  ) {
    return SubscriptionStatus.EXPIRED;
  }

  return subscription.status as SubscriptionStatus;
}

export type PurchaseEventType = 'PURCHASED' | 'RENEWED' | 'PLAN_CHANGED';

export type PurchasePlan = {
  type: PurchaseEventType;
  data: {
    billingPeriod: BillingPeriod;
    canceledAt: null;
    expiresAt: Date;
    planId: string;
    startedAt: Date;
    status: typeof SubscriptionStatus.ACTIVE;
    trial: false;
  };
  // Custom quotas were fixed for a contract: they follow the contract's plan,
  // not a plan bought online (nor the end of a trial).
  clearCustomQuotas: boolean;
  endedTrial: boolean;
};

// What a successful payment does to the subscription:
//  - the paid period is added after what is left of a live subscription, trial
//    included (max(now, expiresAt) + period): no day already paid is lost;
//  - a live paid subscription bought again is RENEWED (same plan) or moved to
//    the new plan at once (PLAN_CHANGED); its start does not move;
//  - a trial ends with the purchase (PURCHASED, ACTIVE, trial = false);
//  - after a lapse (expired, canceled, nothing) the period starts now.
export function planPurchase(input: {
  current: SubscriptionState | null;
  planId: string;
  billingPeriod: BillingPeriod;
  now: Date;
}): PurchasePlan {
  const { current, now } = input;
  const live = isLive(current, now);
  const base =
    live && current?.expiresAt && current.expiresAt > now
      ? current.expiresAt
      : now;
  const expiresAt = addBillingPeriod(base, input.billingPeriod);
  const endedTrial = live && current?.trial === true;
  const continuesPaidPeriod = live && current !== null && !current.trial;
  const planChanged = current !== null && current.planId !== input.planId;

  let type: PurchaseEventType = 'PURCHASED';
  if (continuesPaidPeriod) {
    type = planChanged ? 'PLAN_CHANGED' : 'RENEWED';
  }

  return {
    clearCustomQuotas: !continuesPaidPeriod || planChanged,
    data: {
      billingPeriod: input.billingPeriod,
      canceledAt: null,
      expiresAt,
      planId: input.planId,
      startedAt: continuesPaidPeriod ? (current.startedAt ?? now) : now,
      status: SubscriptionStatus.ACTIVE,
      trial: false,
    },
    endedTrial,
    type,
  };
}
