"use client";

import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { type TranslationFunction } from "@/lib/i18n";

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../hooks/useNotifications";

const sections = [
  ["clinical", ["APPOINTMENT", "AI_ANALYSIS", "REPORT", "PRESCRIPTION"]],
  ["account", ["VERIFICATION", "SUBSCRIPTION", "PAYMENT"]],
  ["collaboration", ["TEAM"]],
  ["essential", ["SECURITY", "SYSTEM"]],
] as const;

export function NotificationPreferencesDrawer({ open, onClose, t }: {
  open: boolean;
  onClose: () => void;
  t: TranslationFunction;
}) {
  const query = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const values = (query.data ?? []).map((item) => ({
    ...item,
    inAppEnabled: overrides[item.category] ?? item.inAppEnabled,
  }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="notification-preferences-title">
      <button type="button" className="absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-label={t("notifications.actions.close")} />
      <aside className="surface-raised absolute inset-y-0 end-0 flex w-full max-w-md flex-col border-s border-[var(--line)] shadow-xl">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 id="notification-preferences-title" className="text-base font-semibold">{t("notifications.preferences.title")}</h2>
            <p className="clinical-caption mt-1">{t("notifications.preferences.inApp")}</p>
          </div>
          <button className="clinical-icon-button" type="button" onClick={onClose} aria-label={t("notifications.actions.close")}><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {query.isLoading ? <p className="clinical-caption">{t("notifications.loading")}</p> : sections.map(([section, categories]) => (
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
                        onChange={(event) => setOverrides((current) => ({ ...current, [category]: event.target.checked }))}
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
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--line)] p-4">
          <button type="button" className="clinical-button clinical-button-secondary" onClick={onClose}>{t("notifications.actions.cancel")}</button>
          <button
            type="button"
            className="clinical-button clinical-button-primary"
            disabled={update.isPending}
            onClick={() => update.mutate(
              values.map(({ category, inAppEnabled }) => ({ category, inAppEnabled })),
              { onSuccess: () => { setOverrides({}); onClose(); } },
            )}
          >
            {t("notifications.actions.save")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
