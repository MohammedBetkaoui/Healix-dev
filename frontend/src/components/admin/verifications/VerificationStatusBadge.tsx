import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationStatus } from "@/types/admin";

type VerificationStatusBadgeProps = {
  status: VerificationStatus;
  t: TranslationFunction;
};

const statusStyles: Record<VerificationStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-600",
  NOT_STARTED: "border-slate-200 bg-white text-slate-600",
  PENDING_VERIFICATION: "border-amber-200 bg-amber-50 text-amber-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  SUSPENDED: "border-slate-300 bg-slate-100 text-slate-700",
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
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
