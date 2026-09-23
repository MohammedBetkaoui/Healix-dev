import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const badgeStyles: Record<string, string> = {
  PENDING: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  VERIFIED: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  REJECTED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
};

type AdminStatCardProps = {
  badge?: string;
  badgeLabel?: string;
  icon: LucideIcon;
  label: string;
  value: number;
};

export function AdminStatCard({
  badge,
  badgeLabel,
  icon: Icon,
  label,
  value,
}: AdminStatCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-muted text-[var(--accent-dark)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {badge ? (
          <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", badgeStyles[badge] ?? "border-border bg-muted text-muted-foreground")}>
            {badgeLabel ?? badge}
          </span>
        ) : null}
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
