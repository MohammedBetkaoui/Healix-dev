import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatCardProps = {
  actionLabel?: string;
  icon: LucideIcon;
  label: string;
  tone?: "default" | "accent";
  value: string;
  variation: string;
};

export function StatCard({
  actionLabel,
  icon: Icon,
  label,
  tone = "default",
  value,
  variation,
}: StatCardProps) {
  return (
    <article
      className={cn(
        "rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]",
        tone === "accent" && "border-cyan-100/80 bg-cyan-50/40",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-950">
              {value}
            </p>
            <p className="flex items-center gap-1 text-sm text-slate-500">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
              {variation}
            </p>
          </div>
        </div>
        {actionLabel ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full px-4 text-xs"
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
