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
        "inline-flex items-center border border-[var(--line)] bg-[var(--panel)]",
        isCompact
          ? "h-11 gap-0.5 rounded-full p-1"
          : "gap-1 rounded-[0.9rem] rounded-bl-[0.32rem] p-1 shadow-[0_10px_24px_-22px_rgba(22,33,29,0.65)] backdrop-blur",
      )}
      aria-label={t("common.languageSwitcher.label")}
    >
      {isCompact ? null : (
        <span className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--accent-dark)]">
          <Languages className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
      )}
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
              "shadow-none",
              isCompact
                ? "h-8 rounded-full px-3 text-xs"
                : "h-9 rounded-[0.55rem] px-3",
              isActive
                ? "bg-primary text-primary-foreground hover:bg-[var(--action-hover)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]",
            )}
          >
            {t(`common.languageSwitcher.languages.${availableLocale}`)}
          </Button>
        );
      })}
    </div>
  );
}
