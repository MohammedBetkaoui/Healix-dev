import { Check, Minus } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type BillingPeriod,
  type SubscriptionPlan,
} from "@/types/subscription";

import { formatPlanAmount } from "./subscription-format";

type PlanComparisonTableProps = {
  billingPeriod: BillingPeriod;
  plans: SubscriptionPlan[];
  t: TranslationFunction;
};

function PlanPrice({
  billingPeriod,
  plan,
  t,
}: {
  billingPeriod: BillingPeriod;
  plan: SubscriptionPlan;
  t: TranslationFunction;
}) {
  const value =
    billingPeriod === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;

  if (value === null) {
    return <>{t("subscription.pricing.customPrice")}</>;
  }

  return (
    <>
      <bdi dir="ltr" className="tabular-nums">
        {formatPlanAmount(value)} DA
      </bdi>
      <span className="ms-1 text-xs font-normal text-[var(--text-secondary)]">
        {billingPeriod === "ANNUAL"
          ? t("subscription.billing.perYear")
          : t("subscription.billing.perMonth")}
      </span>
    </>
  );
}

// First three entries only: the table is a quick comparison, the full lists
// are on each plan card above.
function ComparisonList({
  items,
  kind,
  t,
}: {
  items: string[];
  kind: "feature" | "limit";
  t: TranslationFunction;
}) {
  const Icon = kind === "feature" ? Check : Minus;

  return (
    <ul className="space-y-1.5">
      {items.slice(0, 3).map((item) => (
        <li key={item} className="flex items-start gap-1.5 text-[var(--text-secondary)]">
          <Icon
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0",
              kind === "feature" ? "text-[var(--medical)]" : "text-[var(--text-muted)]",
            )}
            strokeWidth={kind === "feature" ? 2 : 1.6}
            aria-hidden="true"
          />
          <span>{t(item)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PlanComparisonTable({
  billingPeriod,
  plans,
  t,
}: PlanComparisonTableProps) {
  return (
    <section
      aria-labelledby="subscription-comparison-heading"
      className="clinical-table overflow-hidden border border-[var(--border)]"
    >
      <div className="border-b border-[var(--line-soft)]">
        <h2 id="subscription-comparison-heading" className="text-[var(--text-primary)]">
          {t("subscription.comparison.title")}
        </h2>
        <p className="clinical-caption mt-0.5">
          {t("subscription.comparison.subtitle")}
        </p>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table>
          <thead>
            <tr>
              {[
                "subscription.comparison.plan",
                "subscription.comparison.price",
                "subscription.comparison.features",
                "subscription.comparison.limits",
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border-b border-[var(--border)] font-semibold text-[var(--text-secondary)]"
                >
                  {t(label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr
                key={plan.id}
                className={cn(
                  "align-top [&:not(:last-child)>*]:border-b [&:not(:last-child)>*]:border-[var(--line-soft)]",
                  plan.recommended && "bg-[var(--accent-soft)]/40",
                )}
              >
                {/* <td>, not <th scope="row">: .clinical-table th styles
                    (muted header background) would apply to it. */}
                <td className="font-semibold text-[var(--text-primary)]">
                  <div className="flex flex-wrap items-center gap-2">
                    {t(plan.name)}
                    {plan.badge ? (
                      <span className="rounded-[var(--radius-xs)] bg-[var(--accent-soft)] px-1.5 py-0.5 text-[.65rem] font-semibold text-[var(--accent-dark)]">
                        {t(plan.badge)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap font-semibold text-[var(--text-primary)]">
                  <PlanPrice billingPeriod={billingPeriod} plan={plan} t={t} />
                </td>
                <td className="max-w-[24rem]">
                  <ComparisonList items={plan.features} kind="feature" t={t} />
                </td>
                <td className="max-w-[22rem]">
                  <ComparisonList items={plan.limits} kind="limit" t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--line-soft)] lg:hidden">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={cn(
              "px-5 py-4 text-[.8rem]",
              plan.recommended && "bg-[var(--accent-soft)]/40",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t(plan.name)}
              </h3>
              <p className="font-semibold text-[var(--text-primary)]">
                <PlanPrice billingPeriod={billingPeriod} plan={plan} t={t} />
              </p>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--text-primary)]">
                  {t("subscription.comparison.features")}
                </p>
                <ComparisonList items={plan.features} kind="feature" t={t} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--text-primary)]">
                  {t("subscription.comparison.limits")}
                </p>
                <ComparisonList items={plan.limits} kind="limit" t={t} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
