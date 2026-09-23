import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type BillingPeriod,
  type SubscriptionPlan,
} from "@/types/subscription";

type PlanComparisonTableProps = {
  billingPeriod: BillingPeriod;
  plans: SubscriptionPlan[];
  t: TranslationFunction;
};

function formatPrice(
  plan: SubscriptionPlan,
  billingPeriod: BillingPeriod,
  t: TranslationFunction,
) {
  const value =
    billingPeriod === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;

  if (value === null) {
    return t("subscription.pricing.customPrice");
  }

  return `${new Intl.NumberFormat("fr-DZ").format(value)} DA`;
}

type ComparisonTagsProps = {
  items: string[];
  tone: "feature" | "limit";
  t: TranslationFunction;
};

function ComparisonTags({ items, tone, t }: ComparisonTagsProps) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.slice(0, 3).map((item) => (
        <li
          key={item}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs leading-4",
            tone === "feature"
              ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"
              : "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
          )}
        >
          <span
            className={cn(
              "h-1 w-1 shrink-0 rounded-full",
              tone === "feature"
                ? "bg-[var(--accent)]"
                : "bg-[var(--ink-faint)]",
            )}
            aria-hidden="true"
          />
          {t(item)}
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
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="font-[var(--font-auth-display)] text-[1.65rem] font-medium text-[var(--ink)]">
          {t("subscription.comparison.title")}
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {t("subscription.comparison.subtitle")}
        </p>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-[980px] border-separate border-spacing-0 overflow-hidden rounded-[0.9rem] border border-[var(--line)] text-sm">
          <thead className="bg-[var(--panel-soft)] text-[var(--ink-faint)]">
            <tr>
              {[
                "subscription.comparison.plan",
                "subscription.comparison.price",
                "subscription.comparison.features",
                "subscription.comparison.limits",
              ].map((label) => (
                <th
                  key={label}
                  className="border-b border-[var(--line)] px-4 py-3 text-start font-[var(--font-auth-mono)] text-[0.62rem] font-medium uppercase tracking-[0.13em]"
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
                  "[&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-[var(--line-soft)]",
                  plan.recommended && "bg-[var(--accent-soft)]/35",
                )}
              >
                <td className="px-4 py-4 font-medium text-[var(--ink)]">
                  <div className="flex flex-wrap items-center gap-2">
                    {t(plan.name)}
                    {plan.badge ? (
                      <span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 font-[var(--font-auth-mono)] text-[0.58rem] font-medium text-[var(--accent-dark)]">
                        {t(plan.badge)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-[var(--font-auth-display)] text-lg font-medium text-[var(--ink)]">
                  {formatPrice(plan, billingPeriod, t)}
                </td>
                <td className="max-w-[24rem] px-4 py-4">
                  <ComparisonTags items={plan.features} tone="feature" t={t} />
                </td>
                <td className="max-w-[22rem] px-4 py-4">
                  <ComparisonTags items={plan.limits} tone="limit" t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={cn(
              "rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4",
              plan.recommended &&
                "border-[var(--accent)] bg-[var(--accent-soft)]/45 shadow-sm",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">
                {t(plan.name)}
              </h3>
              <span className="whitespace-nowrap font-[var(--font-auth-display)] text-base font-medium text-[var(--accent-dark)]">
                {formatPrice(plan, billingPeriod, t)}
              </span>
            </div>
            <div className="mt-4">
              <p className="mb-2 font-[var(--font-auth-mono)] text-[0.6rem] font-medium uppercase tracking-[0.13em] text-[var(--ink-faint)]">
                {t("subscription.comparison.features")}
              </p>
              <ComparisonTags items={plan.features} tone="feature" t={t} />
            </div>
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <p className="mb-2 font-[var(--font-auth-mono)] text-[0.6rem] font-medium uppercase tracking-[0.13em] text-[var(--ink-faint)]">
                {t("subscription.comparison.limits")}
              </p>
              <ComparisonTags items={plan.limits} tone="limit" t={t} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
