import { LockKeyhole, ReceiptText } from "lucide-react";
import { type ReactNode } from "react";

import { type TranslationFunction } from "@/lib/i18n";
import {
  type AccountType,
  type BillingPeriod,
  type PaymentMethod,
  type SubscriptionContext,
  type SubscriptionPlan,
} from "@/types/subscription";

import { formatPlanAmount } from "./subscription-format";

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

function formatAmount(value: number | null | undefined, t: TranslationFunction): ReactNode {
  if (value === null || value === undefined) {
    return t("subscription.pricing.customPrice");
  }

  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatPlanAmount(value)} DA
    </bdi>
  );
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

function SummaryRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="text-end font-medium text-[var(--text-primary)]">{children}</dd>
    </div>
  );
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
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--line-soft)] px-5 py-4">
        <ReceiptText size={18} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("subscription.checkout.title")}
        </h2>
      </div>

      <div className="px-5 pt-2">
        <dl className="divide-y divide-[var(--line-soft)] text-[.8rem]">
          <SummaryRow label={t("subscription.checkout.accountType")}>
            {t(`subscription.accountType.${accountType}`)}
          </SummaryRow>
          <SummaryRow label={t("subscription.checkout.plan")}>
            {plan ? t(plan.name) : t("subscription.checkout.noPlan")}
          </SummaryRow>
          <SummaryRow label={t("subscription.checkout.period")}>
            {t(`subscription.billing.${billingPeriod.toLowerCase()}`)}
          </SummaryRow>
          <SummaryRow label={t("subscription.checkout.method")}>
            {paymentMethod
              ? t(`subscription.payment.methodLabels.${paymentMethod}`)
              : t("subscription.checkout.noPaymentMethod")}
          </SummaryRow>
          <SummaryRow label={t("subscription.checkout.status")}>
            {t(`subscription.status.account.${context.accountStatus}`)}
          </SummaryRow>
          {saving > 0 ? (
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[var(--text-secondary)]">{t("subscription.checkout.saving")}</dt>
              <dd className="font-semibold text-[var(--success-ink)]">
                − {formatAmount(saving, t)}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Amount due, set apart as the total line of an invoice. */}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-[var(--border)] py-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {t("subscription.checkout.price")}
          </p>
          <p className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            {formatAmount(price, t)}
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t border-[var(--line-soft)] bg-[var(--surface-muted)] px-5 py-4">
        <button
          type="button"
          className="clinical-button clinical-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canCheckout || isLoading}
          onClick={onConfirm}
        >
          {isLoading
            ? t("subscription.checkout.loading")
            : t("subscription.checkout.confirm")}
        </button>
        <p className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
          <LockKeyhole size={14} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t("subscription.security.cardData")}
        </p>
      </div>
      {/* Payment confirmation must be verified later by backend webhook. Never activate a subscription from frontend only. */}
    </section>
  );
}
