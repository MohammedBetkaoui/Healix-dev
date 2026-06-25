"use client";

import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { locales, type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  t: TranslationFunction;
};

export function LanguageSwitcher({
  locale,
  onLocaleChange,
  t,
}: LanguageSwitcherProps) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-white/70 bg-white/75 p-1 shadow-sm shadow-sky-950/5 backdrop-blur"
      aria-label={t("common.languageSwitcher.label")}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md text-cyan-800">
        <Languages className="h-4 w-4" aria-hidden="true" />
      </span>
      {locales.map((availableLocale) => {
        const isActive = locale === availableLocale;

        return (
          <Button
            key={availableLocale}
            type="button"
            variant={isActive ? "default" : "ghost"}
            size="sm"
            aria-pressed={isActive}
            onClick={() => onLocaleChange(availableLocale)}
            className={cn(
              "h-9 rounded-md px-3 shadow-none",
              !isActive && "text-slate-600 hover:bg-cyan-50 hover:text-cyan-800",
            )}
          >
            {t(`common.languageSwitcher.languages.${availableLocale}`)}
          </Button>
        );
      })}
    </div>
  );
}
