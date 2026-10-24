import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";
import { type SubscriptionStatus } from "@/types/subscription";

const statusStyles: Record<SubscriptionStatus, string> = {
  ACTIVE: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  CANCELED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  EXPIRED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  NO_PLAN: "border-border bg-muted text-muted-foreground",
  PAYMENT_PENDING: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  TRIALING: "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]",
};

export function SubscriptionStatusBadge({
  status,
  t,
}: {
  status: SubscriptionStatus;
  t: TranslationFunction;
}) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusStyles[status],
      )}
    >
      {t(`admin.badges.subscriptionStatus.${status}`)}
    </span>
  );
}
