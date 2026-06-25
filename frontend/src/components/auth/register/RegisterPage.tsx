"use client";

import { useState } from "react";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
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
      className="min-h-screen bg-[linear-gradient(135deg,#f8fbfd_0%,#eef8fb_42%,#f7fbf8_100%)] px-4 py-6 text-start text-slate-950 sm:px-6 lg:px-8"
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.28]"
        aria-hidden="true"
      >
        <div className="absolute inset-0 [background-image:linear-gradient(rgba(14,116,144,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.1)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <div
        className={cn(
          "relative mx-auto mb-4 flex w-full max-w-7xl",
          isRtl ? "justify-start" : "justify-end",
        )}
      >
        <LanguageSwitcher
          locale={locale}
          onLocaleChange={setLocale}
          t={t}
        />
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <RegisterHeroPanel {...i18nProps} />

        <section className="flex flex-col gap-6 py-2 lg:py-8">
          <RegisterProgress {...i18nProps} />

          <div className="rounded-lg border border-cyan-100 bg-white/70 p-4 text-sm leading-6 text-slate-700 shadow-sm backdrop-blur">
            {t("register.page.demoAccess")}
          </div>

          <AccountTypeSelector
            selectedType={selectedAccountType}
            onSelect={setSelectedAccountType}
            {...i18nProps}
          />

          <SecurityNotice {...i18nProps} />

          <section
            aria-label={t("register.page.formAriaLabel")}
            className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-xl shadow-sky-950/5 backdrop-blur sm:p-6"
          >
            {selectedAccountType === "ESTABLISHMENT" ? (
              <EstablishmentRegisterForm {...i18nProps} />
            ) : (
              <IndependentDoctorRegisterForm {...i18nProps} />
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
