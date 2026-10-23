import { ShieldCheck } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type NotificationPreference } from "../types/notification.types";

const sections = [
  ["clinical", ["APPOINTMENT", "AI_ANALYSIS", "REPORT", "PRESCRIPTION"]],
  ["account", ["VERIFICATION", "SUBSCRIPTION", "PAYMENT"]],
  ["collaboration", ["TEAM"]],
  ["essential", ["SECURITY", "SYSTEM"]],
] as const;

// The categories of notifications with their switch, and the notice about the
// ones that cannot be turned off. Drawn by the preferences drawer and by the
// account settings.
export function NotificationPreferenceSections({ isLoading, onToggle, t, values }: {
  isLoading: boolean;
  onToggle: (category: string, enabled: boolean) => void;
  t: TranslationFunction;
  values: NotificationPreference[];
}) {
  return (
    <>
      {isLoading ? <p className="clinical-caption">{t("notifications.loading")}</p> : sections.map(([section, categories]) => (
        <section key={section} className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-faint)]">{t(`notifications.preferences.sections.${section}`)}</h3>
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
            {categories.map((category) => {
              const value = values.find((item) => item.category === category);
              if (!value) return null;
              return (
                <label key={category} className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3 last:border-b-0">
                  <span className="text-sm">{t(`notifications.categories.${category}`)}</span>
                  <input
                    type="checkbox"
                    checked={value.inAppEnabled}
                    disabled={value.mandatory}
                    onChange={(event) => onToggle(category, event.target.checked)}
                    className="h-4 w-4 accent-[var(--medical)]"
                  />
                </label>
              );
            })}
          </div>
        </section>
      ))}
      <div className="flex gap-2 rounded-lg border border-[var(--accent-line)] bg-[var(--medical-soft)] p-3 text-xs text-[var(--text-secondary)]">
        <ShieldCheck size={16} className="shrink-0 text-[var(--medical)]" />
        <p>{t("notifications.preferences.mandatoryNotice")}</p>
      </div>
    </>
  );
}
