"use client";

import { type TranslationFunction } from "@/lib/i18n";

import { useEntitlements } from "./use-entitlements";

// For a creation button (new patient, new appointment, launch an analysis...):
// without a live subscription the account is read-only, so the button is
// disabled and says why in its tooltip. When the subscription is live, or not
// known yet, nothing changes: `disabled` is false and there is no `title`.
//
//   const write = useReadOnlyAction(t);
//   <button disabled={write.disabled || busy} title={write.title}>
export function useReadOnlyAction(t: TranslationFunction): {
  disabled: boolean;
  readOnly: boolean;
  title: string | undefined;
} {
  const { readOnly } = useEntitlements();

  return {
    disabled: readOnly,
    readOnly,
    title: readOnly ? t("subscription.readOnly.hint") : undefined,
  };
}
