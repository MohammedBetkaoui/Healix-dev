"use client";

import { Check } from "lucide-react";
import { useId } from "react";

import { type Locale, locales } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { SectionCard } from "./AccountStateViews";

// FR or AR, on the mechanism the whole interface uses (useStoredLocale): the
// choice is kept on this device and flips the direction of the page.
export function LanguageSection({ locale, onChange, t }: { locale: Locale; onChange: (locale: Locale) => void; t: TranslationFunction }) {
  const labelId = useId();

  return (
    <SectionCard title={t("account.language.title")} description={t("account.language.subtitle")}>
      <div role="radiogroup" aria-labelledby={labelId} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <span id={labelId} className="sr-only">{t("account.language.current")}</span>
        {locales.map((option) => {
          const selected = option === locale;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              lang={option}
              dir={option === "ar" ? "rtl" : "ltr"}
              onClick={() => onChange(option)}
              className={`flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-sm font-medium transition-colors ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dark)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"}`}
            >
              {t(`account.language.${option}`)}
              {selected ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}
