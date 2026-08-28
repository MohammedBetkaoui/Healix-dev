import { Check, Minus } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PlanFeatureListProps = {
  features: string[];
  kind?: "feature" | "limit";
  t: TranslationFunction;
  title: string;
};

export function PlanFeatureList({
  features,
  kind = "feature",
  t,
  title,
}: PlanFeatureListProps) {
  const Icon = kind === "feature" ? Check : Minus;

  return (
    <div
      className={cn(
        kind === "limit" &&
          "rounded-[0.85rem] border border-[var(--line-soft)] bg-[var(--panel-soft)] p-3",
      )}
    >
      <p
        className={cn(
          "font-[var(--font-auth-mono)] text-[0.64rem] font-medium uppercase tracking-[0.14em]",
          kind === "feature"
            ? "text-[var(--accent-dark)]"
            : "text-[var(--ink-faint)]",
        )}
      >
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm leading-5 text-[var(--ink-soft)]"
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                kind === "feature"
                  ? "text-[var(--accent)]"
                  : "text-[var(--ink-faint)]",
              )}
              strokeWidth={kind === "feature" ? 1.9 : 1.5}
              aria-hidden="true"
            />
            <span>{t(feature)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
