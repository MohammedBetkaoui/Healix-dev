import { type SubscriptionPlan, type SubscriptionStatus } from "@/types/subscription";

import { type Entitlements, type QuotaKey } from "../types/entitlements.types";

// A gauge turns orange from 80 % of the quota and red at 100 %.
export const GAUGE_WARNING_RATIO = 0.8;

// A paid subscription shows its "ends in N days" banner from this many days
// before the end (the same horizon as the first reminder of a trial).
export const EXPIRING_BANNER_DAYS = 7;

export type GaugeTone = "danger" | "ok" | "unlimited" | "warning";

export type GaugeState = {
  limit: number | null;
  percent: number;
  tone: GaugeTone;
  used: number;
};

export function getGaugeState(used: number, limit: number | null): GaugeState {
  if (limit === null) {
    return { limit, percent: 0, tone: "unlimited", used };
  }

  if (limit <= 0) {
    return { limit, percent: 100, tone: "danger", used };
  }

  const ratio = used / limit;

  return {
    limit,
    percent: Math.min(100, Math.round(ratio * 100)),
    tone: ratio >= 1 ? "danger" : ratio >= GAUGE_WARNING_RATIO ? "warning" : "ok",
    used,
  };
}

// The usage of each quota, in the order the page shows them.
export const quotaGauges: {
  key: QuotaKey;
  usage: (entitlements: Entitlements) => number;
}[] = [
  { key: "aiAnalysesPerMonth", usage: (entitlements) => entitlements.usage.aiAnalysesThisMonth },
  { key: "maxPatients", usage: (entitlements) => entitlements.usage.patients },
  { key: "maxDoctors", usage: (entitlements) => entitlements.usage.doctors },
];

export type SubscriptionBannerState =
  | { daysLeft: number; kind: "expiring" }
  | { daysLeft: number; kind: "trial" }
  | { kind: "readOnly"; status: SubscriptionStatus };

// What the global banner says, null when there is nothing to say: a trial
// always (its days left), a paid subscription when it ends soon, and a
// subscription that is not live (read-only mode).
export function getBannerState(
  entitlements: Entitlements | null,
): SubscriptionBannerState | null {
  if (!entitlements) {
    return null;
  }

  if (entitlements.readOnly) {
    return { kind: "readOnly", status: entitlements.status };
  }

  const daysLeft = entitlements.daysLeft ?? 0;

  if (entitlements.trial) {
    return { daysLeft, kind: "trial" };
  }

  return entitlements.daysLeft !== null && daysLeft <= EXPIRING_BANNER_DAYS
    ? { daysLeft, kind: "expiring" }
    : null;
}

// "Renouveler" for a subscription that ends or has ended, "Choisir un plan"
// for a trial and for an account that has none (or was stopped).
export function getBannerActionKind(
  state: SubscriptionBannerState,
): "choose" | "renew" {
  if (state.kind === "expiring") return "renew";
  if (state.kind === "readOnly") {
    return state.status === "EXPIRED" ? "renew" : "choose";
  }
  return "choose";
}

// The chains outside the plan: their model shows a "Plan Premium" badge and
// an upgrade button. Unknown (no entitlements): none is locked.
export function isPipelineLocked(
  entitlements: Entitlements | null,
  pipeline: string,
): boolean {
  const allowed = entitlements?.quotas.aiPipelines;

  return Array.isArray(allowed) && !allowed.includes(pipeline);
}

export type UpgradeNeed =
  | { kind: "any" }
  | { kind: "pipeline"; pipeline: string }
  | { kind: "quota"; limit: number; quota: QuotaKey };

const monthlyPrice = (plan: SubscriptionPlan) => plan.monthlyPrice ?? Number.POSITIVE_INFINITY;

function satisfies(plan: SubscriptionPlan, need: UpgradeNeed): boolean {
  if (plan.custom) {
    return false;
  }

  if (need.kind === "any") {
    return true;
  }

  const quotas = plan.quotas;

  if (!quotas) {
    return false;
  }

  if (need.kind === "pipeline") {
    return quotas.aiPipelines === null || quotas.aiPipelines.includes(need.pipeline);
  }

  const limit = quotas[need.quota];

  return limit === null || limit > need.limit;
}

// The plan to offer: the first, by price, that is above the current one and
// gives what was missing (more of the quota, the chain). A trial counts as
// just below its reference plan, which is therefore the first offer: "pay the
// plan you were trying". null when nothing above does (the top plan).
export function findUpgradePlan(
  plans: SubscriptionPlan[],
  current: { planId: string | null; trial: boolean },
  need: UpgradeNeed,
): SubscriptionPlan | null {
  const ordered = [...plans]
    .filter((plan) => !plan.custom)
    .sort((a, b) => monthlyPrice(a) - monthlyPrice(b));
  const index = ordered.findIndex((plan) => plan.id === current.planId);
  const threshold = index === -1 ? -1 : current.trial ? index - 0.5 : index;

  return (
    ordered.find(
      (plan, position) => position > threshold && satisfies(plan, need),
    ) ?? null
  );
}
