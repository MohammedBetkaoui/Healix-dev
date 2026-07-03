import { CheckCircle2 } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type PlanFeatureListProps = {
  features: string[];
  t: TranslationFunction;
  title: string;
};

export function PlanFeatureList({ features, t, title }: PlanFeatureListProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{t(feature)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
