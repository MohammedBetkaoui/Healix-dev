"use client";

import { ShieldCheck } from "lucide-react";

import { getDictionary, type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { SectionCard } from "./TeamStateViews";

// The three roles the interface exposes, always explained, whoever watches:
// this tab is the one place a manager reads what their position covers,
// before asking the platform for more. Nothing here is a setting.
export function RolesAndAccessSection({
  locale,
  t,
}: {
  locale: Locale;
  t: TranslationFunction;
}) {
  const roleCards = getDictionary(locale).team.roles.card;

  return (
    <SectionCard
      title={t("team.roles.title")}
      description={t("team.roles.subtitle")}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {(["ADMIN", "DOCTOR", "OWNER"] as const).map((role) => (
          <article
            className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] p-4"
            data-role-card={role}
            key={role}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {roleCards[role].title}
              </h3>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
              {roleCards[role].points.map((line) => (
                <li className="flex gap-2" key={line}>
                  <span aria-hidden="true">•</span>
                  <span dir="auto">{line}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p
        className="mt-4 flex items-start gap-2 border-t border-[var(--line-soft)] pt-3 text-xs leading-5 text-[var(--text-secondary)]"
        role="note"
      >
        <span aria-hidden="true">•</span>
        <span dir="auto">{t("team.roles.note")}</span>
      </p>
    </SectionCard>
  );
}
