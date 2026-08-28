import { ArrowRight, Building2, CreditCard, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type BillingPeriod,
  type SubscriptionPlan,
} from "@/types/subscription";

import { PlanFeatureList } from "./PlanFeatureList";

type PricingCardProps = {
  billingPeriod: BillingPeriod;
  disabled: boolean;
  onSelect: (planId: string) => void;
  plan: SubscriptionPlan;
  selected: boolean;
  t: TranslationFunction;
};

function formatPrice(value: number | null, t: TranslationFunction) {
  if (value === null) {
    return t("subscription.pricing.customPrice");
  }

  return `${new Intl.NumberFormat("fr-DZ").format(value)} DA`;
}

export function PricingCard({
  billingPeriod,
  disabled,
  onSelect,
  plan,
  selected,
  t,
}: PricingCardProps) {
  const price =
    billingPeriod === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
  const Icon = plan.custom ? Building2 : plan.recommended ? Sparkles : CreditCard;

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-[1.2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_16px_38px_-30px_rgba(22,33,29,0.5)] transition-[border-color,box-shadow,transform] duration-200",
        selected &&
          "ring-2 ring-[var(--accent-line)] ring-offset-2 ring-offset-[var(--bg)]",
        plan.recommended &&
          "border-2 border-[var(--accent)] bg-[linear-gradient(180deg,var(--accent-soft)_0%,var(--panel)_31%)] shadow-[0_24px_54px_-34px_rgba(18,61,50,0.72)] min-[1500px]:-translate-y-2",
        disabled && "opacity-75",
      )}
    >
      <div className="flex min-h-12 items-start justify-between gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.85rem] rounded-bl-[0.28rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
          <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        {plan.badge ? (
          <span className="rounded-full border border-[var(--gold-line)] bg-[var(--gold-soft)] px-3 py-1 font-[var(--font-auth-mono)] text-[0.64rem] font-medium tracking-[0.04em] text-[var(--gold-dark)]">
            {t(plan.badge)}
          </span>
        ) : null}
      </div>
      <div className="mt-5 min-h-[7rem]">
        <h3 className="font-[var(--font-auth-display)] text-[1.45rem] font-medium text-[var(--ink)]">
          {t(plan.name)}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          {t(plan.description)}
        </p>
      </div>
      <div className="mt-5 min-h-[9rem] border-y border-[var(--line-soft)] py-5">
        <p className="font-[var(--font-auth-display)] text-[2rem] font-medium tracking-[-0.02em] text-[var(--ink)]">
          {formatPrice(price, t)}
        </p>
        {!plan.custom ? (
          <p className="mt-1 text-sm text-[var(--ink-faint)]">
            {billingPeriod === "ANNUAL"
              ? t("subscription.billing.perYear")
              : t("subscription.billing.perMonth")}
          </p>
        ) : null}
        {billingPeriod === "ANNUAL" && !plan.custom ? (
          <p className="mt-3 w-fit rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent-dark)]">
            {t("subscription.billing.savePercent")}
          </p>
        ) : null}
      </div>
      <div className="mt-5 grid flex-1 grid-rows-[minmax(0,1fr)_auto] gap-6">
        <PlanFeatureList
          features={plan.features}
          t={t}
          title={t("subscription.pricing.features")}
        />
        <PlanFeatureList
          features={plan.limits}
          kind="limit"
          t={t}
          title={t("subscription.pricing.limits")}
        />
      </div>
      <Button
        type="button"
        className={cn(
          "mt-6 w-full rounded-[0.72rem]",
          plan.custom &&
            "border-[var(--accent)] text-[var(--accent-dark)] hover:bg-[var(--accent-soft)]",
        )}
        disabled={disabled}
        variant={plan.custom ? "outline" : selected ? "secondary" : "default"}
        onClick={() => onSelect(plan.id)}
      >
        {plan.custom
          ? t("subscription.pricing.contactTeam")
          : selected
            ? t("subscription.pricing.selected")
            : t("subscription.pricing.choosePlan")}
        <ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.7} aria-hidden="true" />
      </Button>
    </article>
  );
}
