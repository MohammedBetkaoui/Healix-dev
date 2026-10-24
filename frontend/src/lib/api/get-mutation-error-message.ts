import type { TranslationFunction } from "@/lib/i18n";

import { isVerificationRequiredError } from "./api-error";
import { getServerErrorMessage } from "./get-server-error-message";
import {
  describeSubscriptionLimit,
  getSubscriptionLimit,
} from "./subscription-limit";

// The backend VerifiedAccountGuard message is French-only: show the localized
// explanation instead. undefined for any other error.
export function getVerificationRequiredMessage(
  error: unknown,
  t: TranslationFunction,
): string | undefined {
  return isVerificationRequiredError(error)
    ? t("common.verificationRequired.description")
    : undefined;
}

// The subscription's refusals (SUBSCRIPTION_INACTIVE, QUOTA_EXCEEDED,
// AI_PIPELINE_NOT_IN_PLAN, PLAN_REQUIRES_CONTACT) in the user's language, the
// backend's messages being French only. undefined for any other error.
export function getSubscriptionLimitMessage(
  error: unknown,
  t: TranslationFunction,
): string | undefined {
  const limit = getSubscriptionLimit(error);

  return limit ? describeSubscriptionLimit(limit, t) : undefined;
}

// Error text for a write modal: the localized verification notice or
// subscription limit, else the backend's own message (e.g. a 409 conflict),
// else the modal's fallback.
export function getMutationErrorMessage(
  error: unknown,
  t: TranslationFunction,
  fallback: string,
): string {
  return (
    getVerificationRequiredMessage(error, t) ??
    getSubscriptionLimitMessage(error, t) ??
    getServerErrorMessage(error) ??
    fallback
  );
}
