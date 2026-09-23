import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type RegisteredUserStatus } from "@/types/admin";

type AdminUserStatusBadgeProps = {
  status: RegisteredUserStatus;
  t: TranslationFunction;
};

const statusStyles: Record<RegisteredUserStatus, string> = {
  ACTIVE: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  BASIC_ACCOUNT: "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]",
  PAYMENT_PENDING: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  PENDING_VERIFICATION: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  REJECTED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  SUSPENDED: "border-border bg-muted text-foreground",
  VERIFIED_NO_PLAN: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

export function AdminUserStatusBadge({
  status,
  t,
}: AdminUserStatusBadgeProps) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusStyles[status])}>
      {t(`admin.badges.accountStatus.${status}`)}
    </span>
  );
}
