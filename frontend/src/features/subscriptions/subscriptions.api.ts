import { apiClient } from "@/lib/api/http-client";
import {
  type AccountStatus,
  type AccountType,
  type BillingPeriod,
  type SubscriptionContext,
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
    // The static catalog (config/subscription-plans.ts) keys plans by their
    // backend `code` ("DOCTOR_PRO", …), not by the database id (a cuid), so
    // `code` is what SubscriptionPage matches against.
    currentPlanId: response.currentSubscription?.plan.code ?? null,
    subscriptionStatus: response.subscriptionStatus as SubscriptionStatus,
    verificationStatus: response.verificationStatus as VerificationStatus,
  };
}
