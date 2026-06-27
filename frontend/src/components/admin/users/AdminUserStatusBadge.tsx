import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type RegisteredUserStatus } from "@/types/admin";

type AdminUserStatusBadgeProps = {
  status: RegisteredUserStatus;
  t: TranslationFunction;
};

const statusStyles: Record<RegisteredUserStatus, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  BASIC_ACCOUNT: "border-cyan-200 bg-cyan-50 text-cyan-700",
  PAYMENT_PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING_VERIFICATION: "border-amber-200 bg-amber-50 text-amber-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  SUSPENDED: "border-slate-300 bg-slate-100 text-slate-700",
  VERIFIED_NO_PLAN: "border-amber-200 bg-amber-50 text-amber-700",
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
