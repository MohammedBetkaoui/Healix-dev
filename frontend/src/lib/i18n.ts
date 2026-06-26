"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import {
  defaultLocale,
  getDictionary,
  isLocale,
  type Dictionary,
  type Locale,
} from "@/i18n";
import { type LoginValidationMessages } from "@/lib/validations/login.schema";
import { type RegisterValidationMessages } from "@/lib/validations/register.schema";

export type Direction = "ltr" | "rtl";
export type TranslationParams = Record<string, string | number>;
export type TranslationFunction = (
  key: string,
  params?: TranslationParams,
) => string;

const localeStorageKey = "healixdz.locale";
const localeChangeEventName = "healixdz:locale-change";

export function getDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

function readNestedValue(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((currentValue, segment) => {
    if (
      currentValue &&
      typeof currentValue === "object" &&
      segment in currentValue
    ) {
      return (currentValue as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

function formatTranslation(value: string, params?: TranslationParams) {
  if (!params) {
    return value;
  }

  return Object.entries(params).reduce(
    (formatted, [key, replacement]) =>
      formatted.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

export function translate(
  dictionary: Dictionary,
  key: string,
  params?: TranslationParams,
) {
  const value = readNestedValue(dictionary, key);

  if (typeof value !== "string") {
    return key;
  }

  return formatTranslation(value, params);
}

function getStoredLocaleSnapshot(): Locale {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const storedLocale = window.localStorage.getItem(localeStorageKey);
  return isLocale(storedLocale) ? storedLocale : defaultLocale;
}

function subscribeToLocaleChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleLocaleChange = () => onStoreChange();
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === localeStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener(localeChangeEventName, handleLocaleChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(localeChangeEventName, handleLocaleChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function useStoredLocale() {
  const locale = useSyncExternalStore(
    subscribeToLocaleChanges,
    getStoredLocaleSnapshot,
    () => defaultLocale,
  );

  useEffect(() => {
    const direction = getDirection(locale);

    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(localeStorageKey, nextLocale);
    window.dispatchEvent(
      new CustomEvent<Locale>(localeChangeEventName, { detail: nextLocale }),
    );
  }, []);

  return { locale, setLocale };
}

export function useTranslation(locale: Locale) {
  const dictionary = useMemo(() => getDictionary(locale), [locale]);

  const t = useCallback<TranslationFunction>(
    (key, params) => translate(dictionary, key, params),
    [dictionary],
  );

  return {
    dictionary,
    direction: getDirection(locale),
    isRtl: getDirection(locale) === "rtl",
    locale,
    t,
  };
}

export function getRegisterValidationMessages(
  t: TranslationFunction,
): RegisterValidationMessages {
  return {
    required: t("register.errors.required"),
    emailInvalid: t("register.errors.emailInvalid"),
    phoneRequired: t("register.errors.phoneRequired"),
    phoneInvalid: t("register.errors.phoneInvalid"),
    passwordTooShort: t("register.errors.passwordTooShort"),
    passwordMismatch: t("register.errors.passwordMismatch"),
    acceptTerms: t("register.errors.acceptTerms"),
    maxLength: (max) => t("register.errors.maxLength", { max }),
  };
}

export function getLoginValidationMessages(
  t: TranslationFunction,
): LoginValidationMessages {
  return {
    accountTypeRequired: t("login.errors.accountTypeRequired"),
    emailInvalid: t("login.errors.emailInvalid"),
    emailRequired: t("login.errors.emailRequired"),
    passwordMinLength: t("login.errors.passwordMinLength"),
    passwordRequired: t("login.errors.passwordRequired"),
  };
}
