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
        "rounded-[1rem] rounded-bl-[0.4rem] border border-[var(--line)] bg-[var(--panel)]/94 p-5 shadow-[0_1px_2px_rgba(22,33,29,0.03),0_18px_40px_-28px_rgba(22,33,29,0.25)]",
        tone === "accent" && "border-[var(--accent-line)] bg-[var(--accent-soft)]/78",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] rounded-bl-[0.24rem] border border-[var(--gold-line)] bg-[var(--gold-soft)] text-[var(--gold)]">
            <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div>
            <p className="font-[var(--font-auth-mono)] text-[0.66rem] font-medium uppercase leading-4 tracking-[0.1em] text-[var(--ink-faint)]">
              {label}
            </p>
            <p className="mt-2 font-[var(--font-auth-display)] text-[1.9rem] font-medium leading-none text-[var(--ink)]">
              {value}
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--positive)]">
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
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
