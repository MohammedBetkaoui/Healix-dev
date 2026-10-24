import { CalendarCheck, ReceiptText } from "lucide-react";

import { formatBillingDate } from "@/components/subscription/subscription-format";
import { type PaymentSummary } from "@/features/payments/types/payment.types";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

type PaymentSummaryCardProps = {
  locale?: Locale;
  payment?: PaymentSummary | null;
  t: TranslationFunction;
};

function formatPrice(value?: number, currency = "DZD") {
  if (!value) {
    return "-";
  }

  return `${new Intl.NumberFormat("fr-DZ").format(value)} ${currency}`;
}

// "Votre abonnement sera prolongé jusqu'au ..." : what paying would do,
// worked out by the backend with the very rule that applies it.
export function describeExpiryPreview(
  preview: NonNullable<PaymentSummary["expiryPreview"]>,
  locale: Locale,
  t: TranslationFunction,
): string {
  const date = formatBillingDate(preview.expiresAt, locale) ?? preview.expiresAt;

  return preview.endsTrial
    ? t("subscription.payNow.expiry.trial", { date })
    : t(`subscription.payNow.expiry.${preview.type}`, { date });
}

export function PaymentSummaryCard({ locale = "fr", payment, t }: PaymentSummaryCardProps) {
  const preview = payment?.expiryPreview ?? null;

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-[#0b3b5f]">
          <ReceiptText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {t("subscription.payNow.recap")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {payment?.reference ?? t("subscription.paymentFlow.reference")}
          </p>
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.payNow.plan")}</dt>
          <dd className="font-semibold text-slate-950">
            {payment?.plan?.name ? t(payment.plan.name) : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.payNow.period")}</dt>
          <dd className="font-semibold text-slate-950">
            {payment ? t(`subscription.billing.${payment.billingPeriod.toLowerCase()}`) : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            {t("subscription.paymentFlow.amount")}
          </dt>
          <dd className="font-semibold text-slate-950">
            <bdi dir="ltr" className="tabular-nums">
              {formatPrice(payment?.amount, payment?.currency)}
            </bdi>
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            {t("subscription.checkout.method")}
          </dt>
          <dd className="font-semibold text-slate-950">
            {payment
              ? t(`subscription.payment.methodLabels.${payment.method}`)
              : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            {t("subscription.paymentFlow.paymentStatus")}
          </dt>
          <dd className="font-semibold text-slate-950">
            {payment?.status
              ? t(`subscription.paymentFlow.status.${payment.status}`)
              : "-"}
          </dd>
        </div>
      </dl>

      {preview ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-900">
          <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("subscription.payNow.newExpiry")}</p>
            <p data-testid="expiry-preview">{describeExpiryPreview(preview, locale, t)}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
