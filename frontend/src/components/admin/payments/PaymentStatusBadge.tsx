import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminPaymentStatus } from "@/types/admin";

type PaymentStatusBadgeProps = {
  status: AdminPaymentStatus;
  t: TranslationFunction;
};

const statusStyles: Record<AdminPaymentStatus, string> = {
  CANCELED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  CREATED: "border-border bg-muted text-muted-foreground",
  EXPIRED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  FAILED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  PAID: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  REJECTED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  WAITING_ADMIN_REVIEW: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  WAITING_PAYMENT: "border-border bg-muted text-muted-foreground",
};

export function PaymentStatusBadge({ status, t }: PaymentStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusStyles[status],
      )}
    >
      {t(`admin.badges.paymentStatus.${status}`)}
    </span>
  );
}
