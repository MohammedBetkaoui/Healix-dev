import { BadgeCheck, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

import { StatusBadge } from "./StatusBadge";

type AccountStatusCardProps = {
  actionLabel?: string;
  compact?: boolean;
  description: string;
  demoLabel: string;
  statusLabel: string;
  statusTone?: DashboardStatusTone;
  title: string;
};

export function AccountStatusCard({
  actionLabel,
  compact = false,
  description,
  demoLabel,
  statusLabel,
  statusTone = "neutral",
  title,
}: AccountStatusCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--line)] bg-[var(--panel)]/94 shadow-sm",
        compact ? "p-4" : "p-6",
      )}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-[var(--font-auth-display)] text-[1.05rem] font-medium text-[var(--ink)]">{title}</p>
            <StatusBadge label={statusLabel} tone={statusTone} />
          </div>
          <p
            className={cn(
              "mt-2 text-[var(--ink-soft)]",
              compact ? "text-xs leading-5" : "text-sm leading-6",
            )}
          >
            {description}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ink-soft)]">
              <BadgeCheck className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
              {demoLabel}
            </span>
            {actionLabel ? (
              <Button
                size={compact ? "sm" : "default"}
                className={cn(
                  "rounded-[0.7rem]",
                  compact && "h-9 px-4 text-xs",
                )}
              >
                {actionLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {/* Account state is loaded from secure backend endpoints using httpOnly cookies. */}
    </section>
  );
}
