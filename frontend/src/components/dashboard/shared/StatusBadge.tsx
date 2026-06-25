import { cn } from "@/lib/utils";

import { type DashboardStatusTone } from "@/types/dashboard";

type StatusBadgeProps = {
  label: string;
  tone?: DashboardStatusTone;
};

const toneClasses: Record<DashboardStatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-cyan-50 text-cyan-700",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  );
}
