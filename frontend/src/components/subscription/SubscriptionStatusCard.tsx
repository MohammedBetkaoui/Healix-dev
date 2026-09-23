import { CalendarDays, Repeat2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type SubscriptionContext,
  type SubscriptionPlan,
} from "@/types/subscription";

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
    <section className="rounded-xl border border-[var(--accent-line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.82rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
            <CalendarDays className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div>
            <p className="font-[var(--font-auth-mono)] text-[0.66rem] font-medium uppercase tracking-[0.12em] text-[var(--success-ink)]">
              {t("subscription.current.active")}
            </p>
            <h2 className="mt-1 font-[var(--font-auth-display)] text-2xl font-medium text-[var(--ink)]">
              {t("subscription.current.plan")}: {t(currentPlan.name)}
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              {t("subscription.current.period", {
                end: formatAdminDateTime(context.currentPeriodEnd, locale),
                start: formatAdminDateTime(context.currentPeriodStart, locale),
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onChangePlan}>
            <Repeat2 className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
            {t("subscription.current.changePlan")}
          </Button>
          <Button type="button" onClick={onRenew}>
            {t("subscription.current.renew")}
          </Button>
        </div>
      </div>
    </section>
  );
}
