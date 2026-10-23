"use client";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { PasswordChangeForm } from "./PasswordChangeForm";
import { SessionsList } from "./SessionsList";

export function SecuritySection({ locale, t }: { locale: Locale; t: TranslationFunction }) {
  return (
    <div className="space-y-5">
      <PasswordChangeForm t={t} />
      <SessionsList locale={locale} t={t} />
    </div>
  );
}
