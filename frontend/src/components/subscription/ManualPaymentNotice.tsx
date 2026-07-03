import { FileClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type BillingPeriod,
  type PaymentMethod,
  type SubscriptionPlan,
} from "@/types/subscription";

type ManualPaymentNoticeProps = {
  billingPeriod: BillingPeriod;
  paymentMethod?: PaymentMethod;
  plan?: SubscriptionPlan;
  t: TranslationFunction;
};

function formatPrice(value: number | null | undefined, t: TranslationFunction) {
  if (value === null || value === undefined) {
    return t("subscription.pricing.customPrice");
  }

  return `${new Intl.NumberFormat("fr-DZ").format(value)} DA`;
}

export function ManualPaymentNotice({
  billingPeriod,
  paymentMethod,
  plan,
  t,
}: ManualPaymentNoticeProps) {
  if (paymentMethod !== "MANUAL_TRANSFER" && paymentMethod !== "BARIDIMOB") {
    return null;
  }

  const price = billingPeriod === "ANNUAL" ? plan?.annualPrice : plan?.monthlyPrice;

  return (
    <section className="rounded-[24px] border border-amber-100 bg-amber-50/60 p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
          <FileClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {t("subscription.manual.title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("subscription.manual.description")}
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {t("subscription.manual.beneficiary")}
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">HealixDZ</dd>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {t("subscription.manual.reference")}
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">HLX-MOCK-2026</dd>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {t("subscription.manual.amount")}
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {formatPrice(price, t)}
          </dd>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {t("subscription.manual.proof")}
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-600">
            {t("subscription.manual.proofLater")}
          </dd>
        </div>
      </dl>
      <Button type="button" disabled className="mt-5 rounded-full">
        {t("subscription.manual.uploadSoon")}
      </Button>
    </section>
  );
}
