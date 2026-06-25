import { BadgeCheck, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./StatusBadge";

type AccountStatusCardProps = {
  actionLabel: string;
  compact?: boolean;
  description: string;
  demoLabel: string;
  statusLabel: string;
  title: string;
};

export function AccountStatusCard({
  actionLabel,
  compact = false,
  description,
  demoLabel,
  statusLabel,
  title,
}: AccountStatusCardProps) {
  return (
    <section
      className={cn(
        "rounded-[22px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.04)]",
        compact ? "p-4" : "p-6",
      )}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-cyan-700">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <StatusBadge label={statusLabel} tone="info" />
          </div>
          <p
            className={cn(
              "mt-2 text-slate-500",
              compact ? "text-xs leading-5" : "text-sm leading-6",
            )}
          >
            {description}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              {demoLabel}
            </span>
            <Button
              size={compact ? "sm" : "default"}
              className={cn(compact && "h-9 rounded-full px-4 text-xs")}
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
      {/* Real user data will be loaded later from secure backend endpoints using httpOnly cookies. */}
    </section>
  );
}
