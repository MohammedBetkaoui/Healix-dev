import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationStatus } from "@/types/admin";

type VerificationStatusBadgeProps = {
  status: VerificationStatus;
  t: TranslationFunction;
};

const statusStyles: Record<VerificationStatus, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  NOT_STARTED: "border-border bg-card text-muted-foreground",
  PENDING_VERIFICATION: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  REJECTED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  SUSPENDED: "border-border bg-muted text-foreground",
  VERIFIED: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
};

export function VerificationStatusBadge({
  status,
  t,
}: VerificationStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusStyles[status],
      )}
    >
      {t(`admin.badges.status.${status}`)}
    </span>
  );
}
