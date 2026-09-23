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
  if (
    paymentMethod !== "MANUAL_POST_TRANSFER" &&
    paymentMethod !== "BARIDIMOB_RECEIPT" &&
    paymentMethod !== "MANUAL_CASH"
  ) {
    return null;
  }

  const price = billingPeriod === "ANNUAL" ? plan?.annualPrice : plan?.monthlyPrice;

  return (
    <section className="rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)]/65 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--accent-line)] bg-[var(--panel)] text-[var(--accent-dark)]">
          <FileClock className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-[var(--font-auth-display)] text-2xl font-medium text-[var(--ink)]">
            {t("subscription.manual.title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {paymentMethod === "MANUAL_CASH"
              ? t("subscription.manual.cashDescription")
              : t("subscription.manual.description")}
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[0.85rem] border border-[var(--line)] bg-[var(--panel)] p-4">
          <dt className="font-[var(--font-auth-mono)] text-[0.62rem] font-medium uppercase tracking-[0.13em] text-[var(--ink-faint)]">
            {t("subscription.manual.beneficiary")}
          </dt>
          <dd className="mt-1 font-medium text-[var(--ink)]">HealixDZ</dd>
        </div>
        <div className="rounded-[0.85rem] border border-[var(--line)] bg-[var(--panel)] p-4">
          <dt className="font-[var(--font-auth-mono)] text-[0.62rem] font-medium uppercase tracking-[0.13em] text-[var(--ink-faint)]">
            {t("subscription.manual.reference")}
          </dt>
          <dd className="mt-1 font-medium text-[var(--ink)]">
            {t("subscription.manual.generatedLater")}
          </dd>
        </div>
        <div className="rounded-[0.85rem] border border-[var(--line)] bg-[var(--panel)] p-4">
          <dt className="font-[var(--font-auth-mono)] text-[0.62rem] font-medium uppercase tracking-[0.13em] text-[var(--ink-faint)]">
            {t("subscription.manual.amount")}
          </dt>
          <dd className="mt-1 font-[var(--font-auth-display)] text-lg font-medium text-[var(--ink)]">
            {formatPrice(price, t)}
          </dd>
        </div>
        <div className="rounded-[0.85rem] border border-[var(--line)] bg-[var(--panel)] p-4">
          <dt className="font-[var(--font-auth-mono)] text-[0.62rem] font-medium uppercase tracking-[0.13em] text-[var(--ink-faint)]">
            {t("subscription.manual.proof")}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--ink-soft)]">
            {paymentMethod === "MANUAL_CASH"
              ? t("subscription.manual.cashActivation")
              : t("subscription.manual.proofLater")}
          </dd>
        </div>
      </dl>
      <Button type="button" disabled className="mt-5 rounded-[0.72rem]">
        {paymentMethod === "MANUAL_CASH"
          ? t("subscription.manual.cashButton")
          : t("subscription.manual.uploadSoon")}
      </Button>
    </section>
  );
}
