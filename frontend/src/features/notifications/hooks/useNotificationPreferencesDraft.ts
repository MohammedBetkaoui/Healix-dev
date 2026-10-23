"use client";

import { useState } from "react";

import { type NotificationPreference } from "../types/notification.types";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "./useNotifications";

// The preferences of the user with the changes not saved yet. Shared by the
// preferences drawer of the notifications page and the notifications tab of
// the account settings: one behavior, two layouts.
export function useNotificationPreferencesDraft() {
  const query = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const saved = query.data ?? [];
  const values: NotificationPreference[] = saved.map((item) => ({
    ...item,
    inAppEnabled: overrides[item.category] ?? item.inAppEnabled,
  }));
  const isDirty = values.some((item, index) => item.inAppEnabled !== saved[index].inAppEnabled);

  return {
    isDirty,
    query,
    save: (onSuccess?: () => void) =>
      update.mutate(
        values.map(({ category, inAppEnabled }) => ({ category, inAppEnabled })),
        {
          onSuccess: () => {
            setOverrides({});
            onSuccess?.();
          },
        },
      ),
    toggle: (category: string, inAppEnabled: boolean) => setOverrides((current) => ({ ...current, [category]: inAppEnabled })),
    update,
    values,
  };
}
