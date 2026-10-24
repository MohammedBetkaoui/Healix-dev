import { type PlanQuotas, type SubscriptionStatus } from "@/types/subscription";

export type QuotaKey = "aiAnalysesPerMonth" | "maxDoctors" | "maxPatients";

export type EntitlementUsage = {
  aiAnalysesThisMonth: number;
  doctors: number;
  patients: number;
};

// GET /subscription/entitlements: what the workspace of the signed-in user may
// do. Mirrors backend/src/subscriptions/entitlements.ts#Entitlements (status
// is the effective one: an ended subscription reads EXPIRED even before the
// hourly job has marked it) plus canManage (an affiliated doctor sees the
// subscription of their establishment, and does not manage it).
export type Entitlements = {
  canManage: boolean;
  daysLeft: number | null;
  expiresAt: string | null;
  plan: { code: string; custom: boolean; id: string; name: string } | null;
  quotas: PlanQuotas;
  // Not live (ACTIVE or TRIALING): reading and downloading stay open,
  // creating is refused.
  readOnly: boolean;
  status: SubscriptionStatus;
  trial: boolean;
  usage: EntitlementUsage;
};

export type SubscriptionEventType =
  | "CANCELED"
  | "EXPIRED"
  | "PLAN_CHANGED"
  | "PURCHASED"
  | "QUOTAS_CHANGED"
  | "RENEWED"
  | "TRIAL_EXTENDED"
  | "TRIAL_STARTED";

type PlanReference = { code: string; name: string } | null;

// GET /subscription/history (what the account paid, what happened to its
// subscription). The reasons and the names of administrators are not part of
// it: only that an administrator acted.
export type SubscriptionHistory = {
  events: {
    byAdministrator: boolean;
    createdAt: string;
    fromExpiresAt: string | null;
    fromPlan: PlanReference;
    fromStatus: SubscriptionStatus | null;
    id: string;
    paymentReference: string | null;
    toExpiresAt: string | null;
    toPlan: PlanReference;
    toStatus: SubscriptionStatus | null;
    type: SubscriptionEventType;
  }[];
  payments: {
    amount: number;
    billingPeriod: "ANNUAL" | "MONTHLY";
    cardLast4: string | null;
    createdAt: string;
    currency: string;
    id: string;
    method: string;
    paidAt: string | null;
    plan: PlanReference;
    reference: string;
    status: string;
  }[];
};
