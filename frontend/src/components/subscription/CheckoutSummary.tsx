import { LockKeyhole, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type AccountType,
  type BillingPeriod,
  type PaymentMethod,
  type SubscriptionContext,
  type SubscriptionPlan,
} from "@/types/subscription";

type CheckoutSummaryProps = {
  accountType: AccountType;
  billingPeriod: BillingPeriod;
  canCheckout: boolean;
  context: SubscriptionContext;
  isLoading?: boolean;
  onConfirm: () => void;
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

function getPrice(plan: SubscriptionPlan | undefined, period: BillingPeriod) {
  if (!plan) {
    return undefined;
  }

  return period === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
}

function getAnnualSaving(plan: SubscriptionPlan | undefined) {
  if (!plan?.monthlyPrice || !plan.annualPrice) {
    return 0;
  }

  return plan.monthlyPrice * 12 - plan.annualPrice;
}

export function CheckoutSummary({
  accountType,
  billingPeriod,
  canCheckout,
  context,
  isLoading = false,
  onConfirm,
  paymentMethod,
  plan,
  t,
}: CheckoutSummaryProps) {
  const price = getPrice(plan, billingPeriod);
  const saving = billingPeriod === "ANNUAL" ? getAnnualSaving(plan) : 0;

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <ReceiptText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {t("subscription.checkout.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("subscription.checkout.subtitle")}
          </p>
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.checkout.accountType")}</dt>
          <dd className="font-semibold text-slate-950">
            {t(`subscription.accountType.${accountType}`)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.checkout.plan")}</dt>
          <dd className="font-semibold text-slate-950">
            {plan ? t(plan.name) : t("subscription.checkout.noPlan")}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.checkout.period")}</dt>
          <dd className="font-semibold text-slate-950">
            {t(`subscription.billing.${billingPeriod.toLowerCase()}`)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.checkout.price")}</dt>
          <dd className="font-semibold text-slate-950">
            {formatPrice(price, t)}
          </dd>
        </div>
        {saving > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("subscription.checkout.saving")}</dt>
            <dd className="font-semibold text-emerald-700">
              {formatPrice(saving, t)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.checkout.method")}</dt>
          <dd className="font-semibold text-slate-950">
            {paymentMethod
              ? t(`subscription.payment.methodLabels.${paymentMethod}`)
              : t("subscription.checkout.noPaymentMethod")}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.checkout.status")}</dt>
          <dd className="font-semibold text-slate-950">
            {t(`subscription.status.account.${context.accountStatus}`)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <LockKeyhole className="me-2 inline h-4 w-4 text-cyan-700" />
        {t("subscription.security.cardData")}
      </div>

      <Button
        type="button"
        className="mt-5 w-full rounded-full"
        disabled={!canCheckout || isLoading}
        onClick={onConfirm}
      >
        {isLoading
          ? t("subscription.checkout.loading")
          : t("subscription.checkout.confirm")}
      </Button>
      {/* Payment confirmation must be verified later by backend webhook. Never activate a subscription from frontend only. */}
    </section>
  );
}
