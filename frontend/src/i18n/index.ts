import { adminAuthAr } from "./locales/ar/admin-auth";
import { aiAnalysesAr } from "./locales/ar/ai-analyses";
import { adminAr } from "./locales/ar/admin";
import { commonAr } from "./locales/ar/common";
import { dashboardAr } from "./locales/ar/dashboard";
import { doctorVerificationAr } from "./locales/ar/doctor-verification";
import { loginAr } from "./locales/ar/login";
import { landingAr } from "./locales/ar/landing";
import { patientsAr } from "./locales/ar/patients";
import { registerAr } from "./locales/ar/register";
import { subscriptionAr } from "./locales/ar/subscription";
import { verificationAr } from "./locales/ar/verification";
import { adminAuthFr } from "./locales/fr/admin-auth";
import { aiAnalysesFr } from "./locales/fr/ai-analyses";
import { adminFr } from "./locales/fr/admin";
import { commonFr } from "./locales/fr/common";
import { dashboardFr } from "./locales/fr/dashboard";
import { doctorVerificationFr } from "./locales/fr/doctor-verification";
import { loginFr } from "./locales/fr/login";
import { landingFr } from "./locales/fr/landing";
import { patientsFr } from "./locales/fr/patients";
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
    aiAnalyses: aiAnalysesFr,
    common: commonFr,
    dashboard: dashboardFr,
    doctorVerification: doctorVerificationFr,
    login: loginFr,
    landing: landingFr,
    patients: patientsFr,
    register: registerFr,
    subscription: subscriptionFr,
    verification: verificationFr,
  },
  ar: {
    admin: adminAr,
    adminAuth: adminAuthAr,
    aiAnalyses: aiAnalysesAr,
    common: commonAr,
    dashboard: dashboardAr,
    doctorVerification: doctorVerificationAr,
    login: loginAr,
    landing: landingAr,
    patients: patientsAr,
    register: registerAr,
    subscription: subscriptionAr,
    verification: verificationAr,
  },
} as const;

type WidenDictionary<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? readonly WidenDictionary<Item>[]
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
