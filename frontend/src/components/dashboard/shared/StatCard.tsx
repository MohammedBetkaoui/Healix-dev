import { type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";
import { StatusBadge } from "./StatusBadge";

type StatCardProps = {
  actionLabel?: string;
  icon: LucideIcon;
  label: string;
  tone?: "default" | "accent";
  statusTone?: DashboardStatusTone;
  value: string;
  variation: string;
};

export function StatCard({
  actionLabel,
  icon: Icon,
  label,
  tone = "default",
  statusTone,
  value,
  variation,
}: StatCardProps) {
  return (
    <article
      className={cn(
        "rounded-xl border border-[var(--line)] bg-[var(--panel)]/94 p-5 shadow-sm",
        tone === "accent" && "border-[var(--accent-line)] bg-[var(--accent-soft)]/78",
      )}
    >
      <div className="flex flex-col items-start gap-3">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium leading-4 text-[var(--ink-soft)]">
              {label}
            </p>
            {statusTone ? <div className="mt-2"><StatusBadge label={value} tone={statusTone} /></div> : (
              <p className="mt-2 font-[var(--font-auth-mono)] text-3xl font-medium leading-none text-[var(--ink)]">{value}</p>
            )}
            <p className="mt-2 text-xs font-medium text-[var(--ink-soft)]">
              {variation}
            </p>
          </div>
        </div>
        {actionLabel ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-[var(--accent-line)] bg-[var(--panel)]/70 px-4 font-[var(--font-auth-mono)] text-[0.66rem] text-[var(--accent-dark)]"
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
