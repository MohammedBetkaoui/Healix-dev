import { BadgeCheck, Repeat2, RotateCw } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type SubscriptionContext,
  type SubscriptionPlan,
} from "@/types/subscription";

import { formatBillingDate } from "./subscription-format";

type SubscriptionStatusCardProps = {
  context: SubscriptionContext;
  currentPlan?: SubscriptionPlan;
  locale: Locale;
  onChangePlan: () => void;
  onRenew: () => void;
  t: TranslationFunction;
};

export function SubscriptionStatusCard({
  context,
  currentPlan,
  locale,
  onChangePlan,
  onRenew,
  t,
}: SubscriptionStatusCardProps) {
  if (context.subscriptionStatus !== "ACTIVE" || !currentPlan) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-t-2 border-[var(--border)] border-t-[color:var(--success)] bg-[var(--surface)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span className="healix-mark">
          <BadgeCheck size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--success-ink)]">
            {t("subscription.current.active")}
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-[var(--text-primary)]">
            {t("subscription.current.plan")}: {t(currentPlan.name)}
          </h2>
          <p className="clinical-caption mt-0.5">
            {t("subscription.current.period", {
              end: formatBillingDate(context.currentPeriodEnd, locale) ?? "—",
              start: formatBillingDate(context.currentPeriodStart, locale) ?? "—",
            })}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="clinical-button" onClick={onChangePlan}>
          <Repeat2 size={16} strokeWidth={1.8} aria-hidden="true" />
          {t("subscription.current.changePlan")}
        </button>
        <button type="button" className="clinical-button clinical-button-primary" onClick={onRenew}>
          <RotateCw size={16} strokeWidth={1.8} aria-hidden="true" />
          {t("subscription.current.renew")}
        </button>
      </div>
    </section>
  );
}
