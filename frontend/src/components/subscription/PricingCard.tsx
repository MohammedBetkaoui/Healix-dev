import { ArrowRight, Check, Lock } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type BillingPeriod,
  type SubscriptionPlan,
} from "@/types/subscription";

import { PlanFeatureList } from "./PlanFeatureList";
import { formatPlanAmount } from "./subscription-format";

type PricingCardProps = {
  billingPeriod: BillingPeriod;
  current: boolean;
  disabled: boolean;
  onSelect: (planId: string) => void;
  plan: SubscriptionPlan;
  selected: boolean;
  t: TranslationFunction;
};

export function PricingCard({
  billingPeriod,
  current,
  disabled,
  onSelect,
  plan,
  selected,
  t,
}: PricingCardProps) {
  const price =
    billingPeriod === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
  // The active plan is renewed from the status card, not re-subscribed here.
  const isActionDisabled = disabled || current;
  const isPrimaryAction = plan.recommended && !plan.custom && !isActionDisabled;

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-[var(--radius-md)] border bg-[var(--surface)] p-5 transition-[border-color,box-shadow]",
        plan.recommended
          ? "border-[var(--accent-line)] shadow-[var(--shadow-raised)]"
          : "border-[var(--border)]",
        selected && "border-[var(--accent)] ring-1 ring-[var(--accent)]",
      )}
    >
      {plan.recommended ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px] rounded-t-[var(--radius-md)] bg-[var(--accent)]"
        />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          {t(plan.name)}
        </h3>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {current ? (
            <span className="rounded-[var(--radius-xs)] bg-[var(--success-soft)] px-2 py-0.5 text-[.68rem] font-semibold text-[var(--success-ink)]">
              {t("subscription.pricing.currentPlan")}
            </span>
          ) : null}
          {plan.badge ? (
            <span className="rounded-[var(--radius-xs)] bg-[var(--accent-soft)] px-2 py-0.5 text-[.68rem] font-semibold text-[var(--accent-dark)]">
              {t(plan.badge)}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-1.5 min-h-[3.75rem] text-[.8rem] leading-5 text-[var(--text-secondary)]">
        {t(plan.description)}
      </p>

      {/* Only annual prices carry the savings badge; the min-height keeps the
          buttons aligned with the custom plan, which has none. */}
      <div className={cn("mt-4", billingPeriod === "ANNUAL" && "min-h-[4.75rem]")}>
        {price === null ? (
          <p className="text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
            {t("subscription.pricing.customPrice")}
          </p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <bdi dir="ltr" className="text-[1.85rem] font-semibold leading-tight tracking-[-0.03em] tabular-nums text-[var(--text-primary)]">
              {formatPlanAmount(price)}
              <span className="ms-1 text-sm font-semibold text-[var(--text-secondary)]">DA</span>
            </bdi>
            <span className="text-xs text-[var(--text-secondary)]">
              {billingPeriod === "ANNUAL"
                ? t("subscription.billing.perYear")
                : t("subscription.billing.perMonth")}
            </span>
          </p>
        )}
        {billingPeriod === "ANNUAL" && !plan.custom && price !== null ? (
          <p className="mt-2 w-fit rounded-[var(--radius-xs)] bg-[var(--success-soft)] px-2 py-0.5 text-[.7rem] font-semibold text-[var(--success-ink)]">
            {t("subscription.billing.savePercent")}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className={cn(
          "clinical-button mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60",
          isPrimaryAction && "clinical-button-primary",
        )}
        disabled={isActionDisabled}
        onClick={() => onSelect(plan.id)}
      >
        {current ? (
          <>
            <Check size={16} strokeWidth={1.9} aria-hidden="true" />
            {t("subscription.pricing.currentPlan")}
          </>
        ) : disabled ? (
          <>
            <Lock size={15} strokeWidth={1.8} aria-hidden="true" />
            {t("subscription.pricing.verificationRequired")}
          </>
        ) : plan.custom ? (
          <>
            {t("subscription.pricing.contactTeam")}
            <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" className="rtl:rotate-180" />
          </>
        ) : selected ? (
          <>
            <Check size={16} strokeWidth={1.9} aria-hidden="true" />
            {t("subscription.pricing.selected")}
          </>
        ) : (
          <>
            {t("subscription.pricing.choosePlan")}
            <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" className="rtl:rotate-180" />
          </>
        )}
      </button>

      <div className="mt-5 grid flex-1 content-start gap-5 border-t border-[var(--line-soft)] pt-5">
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
    </article>
  );
}
