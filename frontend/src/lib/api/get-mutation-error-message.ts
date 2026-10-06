import type { TranslationFunction } from "@/lib/i18n";

import { isVerificationRequiredError } from "./api-error";
import { getServerErrorMessage } from "./get-server-error-message";

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

// Error text for a write modal: the localized verification notice, else the
// backend's own message (e.g. a 409 conflict), else the modal's fallback.
export function getMutationErrorMessage(
  error: unknown,
  t: TranslationFunction,
  fallback: string,
): string {
  return (
    getVerificationRequiredMessage(error, t) ??
    getServerErrorMessage(error) ??
    fallback
  );
}
