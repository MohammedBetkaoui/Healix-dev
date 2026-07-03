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
        "relative flex h-full flex-col rounded-[26px] border bg-white p-5 shadow-[0_14px_42px_rgba(15,23,42,0.05)] transition",
        selected && "border-cyan-300 ring-2 ring-cyan-100",
        plan.recommended && "border-[#0b3b5f]/25",
        disabled && "opacity-75",
      )}
    >
      {plan.badge ? (
        <span className="absolute end-5 top-5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
          {t(plan.badge)}
        </span>
      ) : null}
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-[#0b3b5f]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="mt-5">
        <h3 className="text-xl font-semibold text-slate-950">{t(plan.name)}</h3>
        <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-500">
          {t(plan.description)}
        </p>
      </div>
      <div className="mt-5 border-y border-slate-100 py-5">
        <p className="text-3xl font-semibold tracking-tight text-slate-950">
          {formatPrice(price, t)}
        </p>
        {!plan.custom ? (
          <p className="mt-1 text-sm text-slate-500">
            {billingPeriod === "ANNUAL"
              ? t("subscription.billing.perYear")
              : t("subscription.billing.perMonth")}
          </p>
        ) : null}
        {billingPeriod === "ANNUAL" && !plan.custom ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            {t("subscription.billing.savePercent")}
          </p>
        ) : null}
      </div>
      <div className="mt-5 space-y-6">
        <PlanFeatureList
          features={plan.features}
          t={t}
          title={t("subscription.pricing.features")}
        />
        <PlanFeatureList
          features={plan.limits}
          t={t}
          title={t("subscription.pricing.limits")}
        />
      </div>
      <Button
        type="button"
        className="mt-6 w-full rounded-full"
        disabled={disabled}
        variant={selected ? "secondary" : "default"}
        onClick={() => onSelect(plan.id)}
      >
        {plan.custom
          ? t("subscription.pricing.contactTeam")
          : selected
            ? t("subscription.pricing.selected")
            : t("subscription.pricing.choosePlan")}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </article>
  );
}
