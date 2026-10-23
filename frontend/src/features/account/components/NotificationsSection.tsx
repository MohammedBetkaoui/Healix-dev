"use client";

import { useState } from "react";

import { NotificationPreferenceSections } from "@/features/notifications/components/NotificationPreferenceSections";
import { useNotificationPreferencesDraft } from "@/features/notifications/hooks/useNotificationPreferencesDraft";
import { type TranslationFunction } from "@/lib/i18n";

import { classifyAccountError } from "../utils/account-errors";
import { AccountErrorState, InlineMessage, SectionCard } from "./AccountStateViews";

// The same preferences as the drawer of the notifications page: one list
// (NotificationPreferenceSections), one draft (useNotificationPreferencesDraft).
export function NotificationsSection({ t }: { t: TranslationFunction }) {
  const draft = useNotificationPreferencesDraft();
  const [saved, setSaved] = useState(false);

  if (draft.query.isError) {
    return <AccountErrorState errorKey={classifyAccountError(draft.query.error).key} onRetry={() => void draft.query.refetch()} t={t} />;
  }

  return (
    <SectionCard title={t("account.notifications.title")} description={t("account.notifications.subtitle")}>
      <div className="max-w-xl">
        <NotificationPreferenceSections
          isLoading={draft.query.isLoading}
          onToggle={(category, enabled) => {
            setSaved(false);
            draft.toggle(category, enabled);
          }}
          t={t}
          values={draft.values}
        />
        <div className="mt-4 space-y-3">
          {draft.update.isError ? <InlineMessage message={t(`account.errors.${classifyAccountError(draft.update.error).key}`)} tone="error" /> : null}
          {saved && !draft.isDirty ? <InlineMessage message={t("account.notifications.saved")} tone="success" /> : null}
          <div className="flex justify-end">
            <button
              type="button"
              className="clinical-button clinical-button-primary"
              disabled={!draft.isDirty || draft.update.isPending}
              onClick={() => draft.save(() => setSaved(true))}
            >
              {draft.update.isPending ? t("account.common.saving") : t("account.notifications.save")}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
