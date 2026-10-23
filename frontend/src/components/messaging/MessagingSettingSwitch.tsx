"use client";

import { useId } from "react";

import { useUpdateMessagingSettings } from "@/features/messaging/messaging.mutations";
import { useMessagingSettings } from "@/features/messaging/messaging.queries";
import { type MessagingSettings } from "@/features/messaging/messaging.types";
import { cn } from "@/lib/utils";

// One of the privacy switches of the messaging (GET/PATCH /messaging/settings):
// in the list of the conversations and in the account settings.

type MessagingSettingSwitchProps = {
  hint: string;
  label: string;
  /** The account settings tell the user their change is saved. */
  onFailed?: (error: unknown) => void;
  onSaved?: () => void;
  setting: keyof MessagingSettings;
};

export function MessagingSettingSwitch({ hint, label, onFailed, onSaved, setting }: MessagingSettingSwitchProps) {
  const ids = { hint: useId(), label: useId() };
  const settings = useMessagingSettings();
  const update = useUpdateMessagingSettings();
  const value = settings.data?.[setting];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span id={ids.label} className="text-xs font-medium text-[var(--text-primary)]">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={value ?? false}
          aria-labelledby={ids.label}
          aria-describedby={ids.hint}
          disabled={value === undefined || update.isPending}
          onClick={() => value !== undefined && update.mutate({ [setting]: !value }, { onError: onFailed, onSuccess: onSaved })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
            value ? "border-[var(--medical)] bg-[var(--medical)]" : "border-[var(--border-strong)] bg-[var(--surface-muted)]",
          )}
        >
          <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", value ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1")} />
        </button>
      </div>
      <p id={ids.hint} className="clinical-caption mt-1">{hint}</p>
    </div>
  );
}
