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
  variant?: "compact" | "default";
};

export function LanguageSwitcher({
  locale,
  onLocaleChange,
  t,
  variant = "default",
}: LanguageSwitcherProps) {
  const isCompact = variant === "compact";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 border border-white/70 bg-white/75 shadow-sm shadow-sky-950/5 backdrop-blur",
        isCompact ? "rounded-xl p-0.5" : "rounded-lg p-1",
      )}
      aria-label={t("common.languageSwitcher.label")}
    >
      <span
        className={cn(
          "flex items-center justify-center text-cyan-800",
          isCompact ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-md",
        )}
      >
        <Languages
          className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4")}
          aria-hidden="true"
        />
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
              "rounded-md shadow-none",
              isCompact ? "h-8 px-2 text-xs" : "h-9 px-3",
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
