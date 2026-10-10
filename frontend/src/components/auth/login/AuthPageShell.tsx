"use client";

import { type ReactNode } from "react";

import { type Locale, locales } from "@/i18n";
import {
  type Direction,
  type TranslationFunction,
  useStoredLocale,
  useTranslation,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { LoginHeroPanel } from "./LoginHeroPanel";
import styles from "./LoginPage.module.css";

export type AuthPageI18n = {
  direction: Direction;
  locale: Locale;
  t: TranslationFunction;
};

// The login page layout, shared by the password recovery pages: hero panel,
// language switcher and the form card.
export function AuthPageShell({
  children,
}: {
  children: (i18n: AuthPageI18n) => ReactNode;
}) {
  const { locale, setLocale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);

  return (
    <main
      lang={locale}
      dir={direction}
      className={styles.page}
    >
      <div className={styles.shell}>
        <LoginHeroPanel t={t} />

        <div className={styles.pulseDivider} aria-hidden="true">
          <svg className={styles.pulseSvg} viewBox="0 0 58 1000" preserveAspectRatio="none">
            <path
              d="M29 0v360H18l6 32 8-80 7 134 6-86H29v640"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
            />
            <circle className={styles.pulseDot} r="4" fill="#ad7f3c" />
          </svg>
        </div>

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

          <section className={styles.formCard}>
            {children({ direction, locale, t })}
          </section>
        </section>
      </div>
    </main>
  );
}
