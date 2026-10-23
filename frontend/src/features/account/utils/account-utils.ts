import { type TranslationFunction } from "@/lib/i18n";

import { type AccountSession } from "../types/account.types";

// The sections of the page, in the order of the tabs. `?tab=security` opens
// one: the address can be shared.
export const ACCOUNT_TABS = ["profile", "security", "notifications", "messaging", "language"] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

export function parseAccountTab(value: string | null | undefined): AccountTab {
  return ACCOUNT_TABS.find((tab) => tab === value) ?? "profile";
}

// "Chrome sur Windows"; what the backend could not read is left out.
export function sessionDeviceLabel(session: Pick<AccountSession, "browser" | "os">, t: TranslationFunction): string {
  if (session.browser && session.os) return t("account.security.sessions.on", { browser: session.browser, os: session.os });
  if (session.browser) return t("account.security.sessions.browserOnly", { browser: session.browser });
  if (session.os) return t("account.security.sessions.osOnly", { os: session.os });
  return t("account.security.sessions.unknownDevice");
}

export function formatDateTime(value: string, locale: "fr" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    dateStyle: "medium",
    hourCycle: "h23",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(new Date(value));
}

// The verification page of the account type.
export function verificationHref(accountType: "DOCTOR" | "ESTABLISHMENT"): string {
  return accountType === "ESTABLISHMENT" ? "/establishment/verification" : "/doctor/verification";
}

export function subscriptionHref(accountType: "DOCTOR" | "ESTABLISHMENT"): string {
  return accountType === "ESTABLISHMENT" ? "/establishment/subscription" : "/doctor/subscription";
}

export function settingsHref(accountType: "DOCTOR" | "ESTABLISHMENT", tab?: AccountTab): string {
  const base = accountType === "ESTABLISHMENT" ? "/establishment/settings" : "/doctor/settings";
  return tab && tab !== "profile" ? `${base}?tab=${tab}` : base;
}
