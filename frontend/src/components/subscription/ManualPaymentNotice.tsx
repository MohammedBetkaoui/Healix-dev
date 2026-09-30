import { FileClock } from "lucide-react";
import { type ReactNode } from "react";

import { type TranslationFunction } from "@/lib/i18n";
import {
  type BillingPeriod,
  type PaymentMethod,
  type SubscriptionPlan,
} from "@/types/subscription";

import { formatPlanAmount } from "./subscription-format";

type ManualPaymentNoticeProps = {
  billingPeriod: BillingPeriod;
  paymentMethod?: PaymentMethod;
  plan?: SubscriptionPlan;
  t: TranslationFunction;
};

function NoticeField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] bg-[var(--surface-muted)] px-3.5 py-3">
      <dt className="text-xs font-medium text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

// Shown for the manual methods. The proof itself is uploaded on the payment
// screen the user is redirected to after confirming, hence no action here.
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
    <section className="rounded-[var(--radius-md)] border border-s-[3px] border-[var(--border)] border-s-[color:var(--accent)] bg-[var(--surface)] p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
          <FileClock size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("subscription.manual.title")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            {paymentMethod === "MANUAL_CASH"
              ? t("subscription.manual.cashDescription")
              : t("subscription.manual.description")}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <NoticeField label={t("subscription.manual.beneficiary")} value="HealixDZ" />
        <NoticeField
          label={t("subscription.manual.reference")}
          value={t("subscription.manual.generatedLater")}
        />
        <NoticeField
          label={t("subscription.manual.amount")}
          value={
            price === null || price === undefined ? (
              t("subscription.pricing.customPrice")
            ) : (
              <bdi dir="ltr" className="tabular-nums">{formatPlanAmount(price)} DA</bdi>
            )
          }
        />
        <NoticeField
          label={t("subscription.manual.proof")}
          value={
            paymentMethod === "MANUAL_CASH"
              ? t("subscription.manual.cashActivation")
              : t("subscription.manual.proofLater")
          }
        />
      </dl>
    </section>
  );
}
