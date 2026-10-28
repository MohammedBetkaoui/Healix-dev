"use client";

import {
  Building2,
  Check,
  LockKeyhole,
  Settings2,
  Stethoscope,
} from "lucide-react";

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
      <div className="team-role-grid">
        {(["OWNER", "ADMIN", "DOCTOR"] as const).map((role) => {
          const Icon =
            role === "OWNER"
              ? Building2
              : role === "ADMIN"
                ? Settings2
                : Stethoscope;
          return (
            <article
              className="team-role-card"
              data-role-card={role}
              key={role}
            >
              <div className="team-role-heading">
                <span className="team-summary-icon">
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {roleCards[role].title}
                </h3>
              </div>
              <ul className="mt-4 space-y-3 text-xs leading-5 text-[var(--text-secondary)]">
                {roleCards[role].points.map((line) => (
                  <li className="flex items-start gap-2.5" key={line}>
                    <Check
                      size={15}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0 text-[var(--medical)]"
                      aria-hidden="true"
                    />
                    <span dir="auto">{line}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      <p className="team-roles-note" role="note">
        <LockKeyhole size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span dir="auto">{t("team.roles.note")}</span>
      </p>
    </SectionCard>
  );
}
