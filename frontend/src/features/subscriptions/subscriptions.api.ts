import { apiClient } from "@/lib/api/http-client";
import {
  type AccountStatus,
  type AccountType,
  type BillingPeriod,
  type SubscriptionContext,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type VerificationStatus,
} from "@/types/subscription";

// Wire shape of GET /subscription/me. Mirrors
// backend/src/subscriptions/subscriptions.service.ts#getMySubscription
// (context from #getAccountContextFromUser, currentSubscription from
// #toPublicSubscription: the latest subscription, whatever its status).
export type MySubscriptionResponse = {
  accountStatus: string;
  accountType: AccountType;
  subscriptionStatus: string;
  verificationStatus: string;
  currentSubscription: {
    id: string;
    status: string;
    billingPeriod: BillingPeriod;
    startedAt: string;
    expiresAt: string;
    plan: {
      id: string;
      name: string;
      code: string;
      monthlyPrice: number | null;
      annualPrice: number | null;
      currency: string;
    };
  } | null;
};

export async function getMySubscription(): Promise<MySubscriptionResponse> {
  const { data } = await apiClient.get<MySubscriptionResponse>("/subscription/me");
  return data;
}

// The backend returns currentSubscription as a nested object; SubscriptionContext
// (already consumed by SubscriptionStatusCard/PricingGrid/VerificationAccessBanner)
// expects currentPlanId plus two flat dates.
export function toSubscriptionContext(response: MySubscriptionResponse): SubscriptionContext {
  return {
    accountStatus: response.accountStatus as AccountStatus,
    accountType: response.accountType,
    currentPeriodEnd: response.currentSubscription?.expiresAt,
    currentPeriodStart: response.currentSubscription?.startedAt,
    // Plans are keyed by their backend `code` ("DOCTOR_PRO", …), not by the
    // database id (a cuid): toSubscriptionPlan below maps code → id, so
    // `code` is what SubscriptionPage matches against.
    currentPlanId: response.currentSubscription?.plan.code ?? null,
    subscriptionStatus: response.subscriptionStatus as SubscriptionStatus,
    verificationStatus: response.verificationStatus as VerificationStatus,
  };
}

// Wire shape of GET /subscription/plans (one item of `data`). Mirrors
// backend/src/subscriptions/plans/subscription-plans.service.ts#toPublicPlan.
// The backend derives accountType from the JWT role, so no query param.
// features/limits are nullable JSON columns.
export type PublicSubscriptionPlan = {
  id: string;
  name: string;
  code: string;
  accountType: AccountType;
  description: string | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  features: string[] | null;
  limits: string[] | null;
  recommended: boolean;
  custom: boolean;
};

export async function getSubscriptionPlans(): Promise<PublicSubscriptionPlan[]> {
  const { data } = await apiClient.get<{ data: PublicSubscriptionPlan[] }>(
    "/subscription/plans",
  );
  return data.data;
}

// id is the plan's `code`, not the database cuid: toSubscriptionContext above
// and payments.service.ts both resolve plans by their code. There is no
// `badge` column, so the small card badge is not shown for API plans.
export function toSubscriptionPlan(plan: PublicSubscriptionPlan): SubscriptionPlan {
  return {
    accountType: plan.accountType,
    annualPrice: plan.annualPrice,
    currency: "DZD",
    custom: plan.custom,
    description: plan.description ?? "",
    features: plan.features ?? [],
    id: plan.code,
    limits: plan.limits ?? [],
    monthlyPrice: plan.monthlyPrice,
    name: plan.name,
    recommended: plan.recommended,
  };
}
