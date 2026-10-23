"use client";

import { X } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { useNotificationPreferencesDraft } from "../hooks/useNotificationPreferencesDraft";
import { NotificationPreferenceSections } from "./NotificationPreferenceSections";

export function NotificationPreferencesDrawer({ open, onClose, t }: {
  open: boolean;
  onClose: () => void;
  t: TranslationFunction;
}) {
  const draft = useNotificationPreferencesDraft();

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
          <NotificationPreferenceSections isLoading={draft.query.isLoading} onToggle={draft.toggle} t={t} values={draft.values} />
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--line)] p-4">
          <button type="button" className="clinical-button clinical-button-secondary" onClick={onClose}>{t("notifications.actions.cancel")}</button>
          <button
            type="button"
            className="clinical-button clinical-button-primary"
            disabled={draft.update.isPending}
            onClick={() => draft.save(onClose)}
          >
            {t("notifications.actions.save")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
