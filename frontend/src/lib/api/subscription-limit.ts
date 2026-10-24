import { isAxiosError } from "axios";

import type { TranslationFunction } from "@/lib/i18n";

// What the backend refuses when the subscription does not allow an action
// (see backend/src/subscriptions/subscription-errors.ts). The body of the
// answer carries the code and the figures:
//   403 SUBSCRIPTION_INACTIVE      { status, expiresAt }
//   403 QUOTA_EXCEEDED             { quota, used, limit, trial }
//   403 AI_PIPELINE_NOT_IN_PLAN    { pipeline }
//   400 PLAN_REQUIRES_CONTACT      (a plan on quote is not paid online)
export type SubscriptionLimitQuota = "aiAnalysesPerMonth" | "maxDoctors" | "maxPatients";

export type SubscriptionLimit =
  | { code: "AI_PIPELINE_NOT_IN_PLAN"; pipeline: string }
  | { code: "PLAN_REQUIRES_CONTACT" }
  // trial: the quota is the free trial's, counted over the whole trial.
  | { code: "QUOTA_EXCEEDED"; limit: number; quota: SubscriptionLimitQuota; trial?: boolean; used: number }
  | { code: "SUBSCRIPTION_INACTIVE"; expiresAt: string | null; status: string };

const quotas: readonly string[] = ["aiAnalysesPerMonth", "maxDoctors", "maxPatients"];

export function getSubscriptionLimit(error: unknown): SubscriptionLimit | null {
  if (!isAxiosError(error)) {
    return null;
  }

  const status = error.response?.status;
  const data = error.response?.data as Record<string, unknown> | undefined;

  if (!data || typeof data !== "object") {
    return null;
  }

  if (status === 400) {
    return data.code === "PLAN_REQUIRES_CONTACT" ? { code: "PLAN_REQUIRES_CONTACT" } : null;
  }

  if (status !== 403) {
    return null;
  }

  if (data.code === "SUBSCRIPTION_INACTIVE") {
    return {
      code: "SUBSCRIPTION_INACTIVE",
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
      status: typeof data.status === "string" ? data.status : "EXPIRED",
    };
  }

  if (
    data.code === "QUOTA_EXCEEDED" &&
    typeof data.quota === "string" &&
    quotas.includes(data.quota) &&
    typeof data.used === "number" &&
    typeof data.limit === "number"
  ) {
    return {
      code: "QUOTA_EXCEEDED",
      limit: data.limit,
      quota: data.quota as SubscriptionLimitQuota,
      trial: data.trial === true,
      used: data.used,
    };
  }

  if (data.code === "AI_PIPELINE_NOT_IN_PLAN" && typeof data.pipeline === "string") {
    return { code: "AI_PIPELINE_NOT_IN_PLAN", pipeline: data.pipeline };
  }

  return null;
}

// The sentence for the user, in their language ("Quota d'analyses IA atteint :
// 20/20 ce mois-ci"). During a trial the analyses are counted over the whole
// trial, not per month: the refusal says it is the trial's (`limit.trial`),
// and a screen that already knows can say it too (`options.trial`).
export function describeSubscriptionLimit(
  limit: SubscriptionLimit,
  t: TranslationFunction,
  options: { trial?: boolean } = {},
): string {
  switch (limit.code) {
    case "SUBSCRIPTION_INACTIVE":
      return t("subscription.limits.inactive");
    case "QUOTA_EXCEEDED":
      return t(
        (limit.trial || options.trial) && limit.quota === "aiAnalysesPerMonth"
          ? "subscription.limits.quotaTrial.aiAnalysesPerMonth"
          : `subscription.limits.quota.${limit.quota}`,
        { limit: limit.limit, used: limit.used },
      );
    case "AI_PIPELINE_NOT_IN_PLAN":
      return t("subscription.limits.pipeline");
    case "PLAN_REQUIRES_CONTACT":
      return t("subscription.limits.contact");
  }
}
