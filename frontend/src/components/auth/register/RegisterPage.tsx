"use client";

import { useState } from "react";

import { locales } from "@/i18n";
import {
  useStoredLocale,
  useTranslation,
  type TranslationFunction,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type AccountType } from "@/types/auth";

import { AccountTypeSelector } from "./AccountTypeSelector";
import { EstablishmentRegisterForm } from "./EstablishmentRegisterForm";
import { IndependentDoctorRegisterForm } from "./IndependentDoctorRegisterForm";
import { RegisterHeroPanel } from "./RegisterHeroPanel";
import { RegisterProgress } from "./RegisterProgress";
import { SecurityNotice } from "./SecurityNotice";
import styles from "./RegisterPage.module.css";

export type RegisterI18nProps = {
  direction: "ltr" | "rtl";
  isRtl: boolean;
  locale: "fr" | "ar";
  t: TranslationFunction;
};

export function RegisterPage() {
  const [selectedAccountType, setSelectedAccountType] =
    useState<AccountType | null>("ESTABLISHMENT");
  const { locale, setLocale } = useStoredLocale();
  const { direction, isRtl, t } = useTranslation(locale);
  const i18nProps = { direction, isRtl, locale, t };

  return (
    <main
      lang={locale}
      dir={direction}
      className={styles.page}
    >
      <div className={styles.shell}>
        <RegisterHeroPanel {...i18nProps} />

        <section className={styles.formColumn}>
          <div
            className={styles.localeSwitcher}
            aria-label={t("common.languageSwitcher.label")}
          >
            {locales.map((availableLocale) => (
              <button
                key={availableLocale}
                type="button"
                aria-pressed={locale === availableLocale}
                onClick={() => setLocale(availableLocale)}
                className={cn(
                  styles.localeButton,
                  locale === availableLocale && styles.localeButtonActive,
                )}
              >
                {availableLocale}
              </button>
            ))}
          </div>

          <div className={styles.formInner}>
            <RegisterProgress {...i18nProps} />

            <div className={styles.demoNotice}>
              <span className={styles.noticeIndex} aria-hidden="true">01</span>
              <p>{t("register.page.demoAccess")}</p>
            </div>

            <AccountTypeSelector
              selectedType={selectedAccountType}
              onSelect={setSelectedAccountType}
              {...i18nProps}
            />

            <section
              aria-label={t("register.page.formAriaLabel")}
              className={styles.formCard}
            >
              <header className={styles.formCardHeader}>
                <p className={styles.formEyebrow}>
                  {t("register.forms.eyebrow")}
                </p>
                <h2 className={styles.formTitle}>
                  {selectedAccountType === "ESTABLISHMENT"
                    ? t("register.forms.establishment.title")
                    : t("register.forms.doctor.title")}
                </h2>
                <p className={styles.formDescription}>
                  {selectedAccountType === "ESTABLISHMENT"
                    ? t("register.forms.establishment.description")
                    : t("register.forms.doctor.description")}
                </p>
              </header>

              <SecurityNotice {...i18nProps} />

              {selectedAccountType === "ESTABLISHMENT" ? (
                <EstablishmentRegisterForm {...i18nProps} />
              ) : (
                <IndependentDoctorRegisterForm {...i18nProps} />
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
