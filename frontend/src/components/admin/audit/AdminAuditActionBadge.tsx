import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";

import { getAuditActionLabel, getAuditTone } from "./audit-presentation";

type AdminAuditActionBadgeProps = {
  action: string;
  t: TranslationFunction;
};

const toneStyles = {
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-cyan-200 bg-cyan-50 text-cyan-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
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
