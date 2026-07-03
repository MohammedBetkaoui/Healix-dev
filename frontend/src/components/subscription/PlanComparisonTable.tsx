import { type TranslationFunction } from "@/lib/i18n";
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

export function PlanComparisonTable({
  billingPeriod,
  plans,
  t,
}: PlanComparisonTableProps) {
  return (
    <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-slate-950">
          {t("subscription.comparison.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t("subscription.comparison.subtitle")}
        </p>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">
                {t("subscription.comparison.plan")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("subscription.comparison.price")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("subscription.comparison.features")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("subscription.comparison.limits")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="px-4 py-4 font-semibold text-slate-950">
                  {t(plan.name)}
                </td>
                <td className="px-4 py-4 text-slate-700">
                  {formatPrice(plan, billingPeriod, t)}
                </td>
                <td className="px-4 py-4 text-slate-600">
                  {plan.features.slice(0, 3).map((feature) => t(feature)).join(" · ")}
                </td>
                <td className="px-4 py-4 text-slate-600">
                  {plan.limits.slice(0, 3).map((limit) => t(limit)).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-950">{t(plan.name)}</h3>
              <span className="text-sm font-semibold text-cyan-700">
                {formatPrice(plan, billingPeriod, t)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {plan.features.slice(0, 3).map((feature) => t(feature)).join(" · ")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
