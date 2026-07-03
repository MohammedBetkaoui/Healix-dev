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
    <section className="rounded-[24px] border border-emerald-100 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              {t("subscription.current.active")}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {t("subscription.current.plan")}: {t(currentPlan.name)}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {t("subscription.current.period", {
                end: formatAdminDateTime(context.currentPeriodEnd, locale),
                start: formatAdminDateTime(context.currentPeriodStart, locale),
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onChangePlan}>
            <Repeat2 className="h-4 w-4" aria-hidden="true" />
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
