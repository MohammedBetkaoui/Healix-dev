import { Lock } from "lucide-react";
import { type ReactNode } from "react";

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
  currentPlanId?: string | null;
  onSelectPlan: (planId: string) => void;
  plans: SubscriptionPlan[];
  selectedPlanId?: string;
  t: TranslationFunction;
  // Rendered on the end side of the section heading (the billing toggle).
  toolbar?: ReactNode;
};

export function PricingGrid({
  billingPeriod,
  canSelectPlan,
  currentPlanId,
  onSelectPlan,
  plans,
  selectedPlanId,
  t,
  toolbar,
}: PricingGridProps) {
  return (
    <section
      aria-labelledby="subscription-plans-heading"
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="clinical-section-heading border-b border-[var(--line-soft)]">
        <div className="min-w-0">
          <h2 id="subscription-plans-heading" className="text-[var(--text-primary)]">
            {t("subscription.pricing.title")}
          </h2>
          <p className="clinical-caption mt-0.5 max-w-2xl">
            {t("subscription.pricing.subtitle")}
          </p>
        </div>
        {toolbar}
      </div>

      <div
        className={cn(
          "grid gap-4 p-5",
          plans.length >= 4
            ? "md:grid-cols-2 min-[1400px]:grid-cols-4"
            : "md:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            billingPeriod={billingPeriod}
            current={currentPlanId === plan.id}
            disabled={!canSelectPlan}
            onSelect={onSelectPlan}
            plan={plan}
            selected={selectedPlanId === plan.id}
            t={t}
          />
        ))}
      </div>

      <p className="flex items-start gap-2 border-t border-[var(--line-soft)] bg-[var(--surface-muted)] px-5 py-3 text-xs leading-5 text-[var(--text-secondary)]">
        <Lock size={14} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0" />
        {t("subscription.security.cardData")}
      </p>
    </section>
  );
}
