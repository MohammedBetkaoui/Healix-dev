import {
  type BillingPeriod,
  type SubscriptionPlan,
} from "@/types/subscription";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { PricingCard } from "./PricingCard";

type PricingGridProps = {
  billingPeriod: BillingPeriod;
  canSelectPlan: boolean;
  onSelectPlan: (planId: string) => void;
  plans: SubscriptionPlan[];
  selectedPlanId?: string;
  t: TranslationFunction;
};

export function PricingGrid({
  billingPeriod,
  canSelectPlan,
  onSelectPlan,
  plans,
  selectedPlanId,
  t,
}: PricingGridProps) {
  return (
    <section>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[var(--font-auth-display)] text-[1.65rem] font-medium text-[var(--ink)]">
            {t("subscription.pricing.title")}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {t("subscription.pricing.subtitle")}
          </p>
        </div>
      </div>
      <div
        className={cn(
          "grid auto-rows-fr items-stretch gap-5 pt-2",
          plans.length >= 4
            ? "md:grid-cols-2 min-[1500px]:grid-cols-4"
            : "md:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            billingPeriod={billingPeriod}
            disabled={!canSelectPlan}
            onSelect={onSelectPlan}
            plan={plan}
            selected={selectedPlanId === plan.id}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}
