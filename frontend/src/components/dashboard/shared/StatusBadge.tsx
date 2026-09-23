import { cn } from "@/lib/utils";

import { type DashboardStatusTone } from "@/types/dashboard";

type StatusBadgeProps = {
  label: string;
  tone?: DashboardStatusTone;
};

const toneClasses: Record<DashboardStatusTone, string> = {
  neutral: "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
  success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  info: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-[var(--font-auth-mono)] text-[0.66rem] font-medium tracking-[0.03em]",
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  );
}
