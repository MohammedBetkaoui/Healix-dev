import { adminAuthAr } from "./locales/ar/admin-auth";
import { adminAr } from "./locales/ar/admin";
import { commonAr } from "./locales/ar/common";
import { dashboardAr } from "./locales/ar/dashboard";
import { doctorVerificationAr } from "./locales/ar/doctor-verification";
import { loginAr } from "./locales/ar/login";
import { registerAr } from "./locales/ar/register";
import { subscriptionAr } from "./locales/ar/subscription";
import { verificationAr } from "./locales/ar/verification";
import { adminAuthFr } from "./locales/fr/admin-auth";
import { adminFr } from "./locales/fr/admin";
import { commonFr } from "./locales/fr/common";
import { dashboardFr } from "./locales/fr/dashboard";
import { doctorVerificationFr } from "./locales/fr/doctor-verification";
import { loginFr } from "./locales/fr/login";
import { registerFr } from "./locales/fr/register";
import { subscriptionFr } from "./locales/fr/subscription";
import { verificationFr } from "./locales/fr/verification";

export const locales = ["fr", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";

export const dictionaries = {
  fr: {
    admin: adminFr,
    adminAuth: adminAuthFr,
    common: commonFr,
    dashboard: dashboardFr,
    doctorVerification: doctorVerificationFr,
    login: loginFr,
    register: registerFr,
    subscription: subscriptionFr,
    verification: verificationFr,
  },
  ar: {
    admin: adminAr,
    adminAuth: adminAuthAr,
    common: commonAr,
    dashboard: dashboardAr,
    doctorVerification: doctorVerificationAr,
    login: loginAr,
    register: registerAr,
    subscription: subscriptionAr,
    verification: verificationAr,
  },
} as const;

type WidenDictionary<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { readonly [Key in keyof T]: WidenDictionary<T[Key]> }
      : T;

export type Dictionary = WidenDictionary<
  (typeof dictionaries)[typeof defaultLocale]
>;

export function isLocale(value: string | null): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
