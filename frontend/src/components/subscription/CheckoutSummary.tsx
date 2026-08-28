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
    <section className="rounded-[1.15rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_16px_38px_-30px_rgba(22,33,29,0.48)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
          <ReceiptText className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-[var(--font-auth-display)] text-2xl font-medium text-[var(--ink)]">
            {t("subscription.checkout.title")}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {t("subscription.checkout.subtitle")}
          </p>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-[var(--line-soft)] text-sm">
        <div className="flex justify-between gap-4">
          <dt className="py-3 text-[var(--ink-faint)]">{t("subscription.checkout.accountType")}</dt>
          <dd className="py-3 font-medium text-[var(--ink)]">
            {t(`subscription.accountType.${accountType}`)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="py-3 text-[var(--ink-faint)]">{t("subscription.checkout.plan")}</dt>
          <dd className="py-3 font-medium text-[var(--ink)]">
            {plan ? t(plan.name) : t("subscription.checkout.noPlan")}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="py-3 text-[var(--ink-faint)]">{t("subscription.checkout.period")}</dt>
          <dd className="py-3 font-medium text-[var(--ink)]">
            {t(`subscription.billing.${billingPeriod.toLowerCase()}`)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="py-3 text-[var(--ink-faint)]">{t("subscription.checkout.price")}</dt>
          <dd className="py-3 font-[var(--font-auth-display)] text-lg font-medium text-[var(--ink)]">
            {formatPrice(price, t)}
          </dd>
        </div>
        {saving > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="py-3 text-[var(--ink-faint)]">{t("subscription.checkout.saving")}</dt>
            <dd className="py-3 font-medium text-[var(--positive)]">
              {formatPrice(saving, t)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="py-3 text-[var(--ink-faint)]">{t("subscription.checkout.method")}</dt>
          <dd className="py-3 text-end font-medium text-[var(--ink)]">
            {paymentMethod
              ? t(`subscription.payment.methodLabels.${paymentMethod}`)
              : t("subscription.checkout.noPaymentMethod")}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="py-3 text-[var(--ink-faint)]">{t("subscription.checkout.status")}</dt>
          <dd className="py-3 font-medium text-[var(--ink)]">
            {t(`subscription.status.account.${context.accountStatus}`)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 rounded-[0.85rem] border border-[var(--accent-line)] bg-[var(--accent-soft)]/55 p-4 text-sm leading-6 text-[var(--ink-soft)]">
        <LockKeyhole className="me-2 inline h-4 w-4 text-[var(--accent-dark)]" strokeWidth={1.7} />
        {t("subscription.security.cardData")}
      </div>

      <Button
        type="button"
        className="mt-5 w-full rounded-[0.72rem]"
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
