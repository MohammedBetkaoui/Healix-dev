import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";

import { getAuditActionLabel, getAuditTone } from "./audit-presentation";

type AdminAuditActionBadgeProps = {
  action: string;
  t: TranslationFunction;
};

const toneStyles = {
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  info: "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]",
  success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

export function AdminAuditActionBadge({
  action,
  t,
}: AdminAuditActionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        toneStyles[getAuditTone(action)],
      )}
    >
      {getAuditActionLabel(action, t)}
    </span>
  );
}
