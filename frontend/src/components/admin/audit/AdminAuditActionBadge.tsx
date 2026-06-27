import { cn } from "@/lib/utils";

type AdminAuditActionBadgeProps = {
  action: string;
};

const actionStyles: Record<string, string> = {
  ADMIN_LOGIN_FAILED: "border-red-200 bg-red-50 text-red-700",
  ADMIN_LOGIN_SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-700",
  VERIFICATION_APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  VERIFICATION_REJECTED: "border-red-200 bg-red-50 text-red-700",
};

export function AdminAuditActionBadge({ action }: AdminAuditActionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        actionStyles[action] ?? "border-cyan-200 bg-cyan-50 text-cyan-700",
      )}
    >
      {action}
    </span>
  );
}
