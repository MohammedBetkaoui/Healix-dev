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
    <div>
      <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
      <ul className="mt-2.5 space-y-2">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-[.8rem] leading-5 text-[var(--text-secondary)]"
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                kind === "feature"
                  ? "text-[var(--medical)]"
                  : "text-[var(--text-muted)]",
              )}
              strokeWidth={kind === "feature" ? 2 : 1.6}
              aria-hidden="true"
            />
            <span>{t(feature)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
