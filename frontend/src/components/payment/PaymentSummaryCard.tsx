import { ReceiptText } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { type PaymentSummary } from "@/features/payments/types/payment.types";

type PaymentSummaryCardProps = {
  payment?: PaymentSummary | null;
  t: TranslationFunction;
};

function formatPrice(value?: number, currency = "DZD") {
  if (!value) {
    return "-";
  }

  return `${new Intl.NumberFormat("fr-DZ").format(value)} ${currency}`;
}

export function PaymentSummaryCard({ payment, t }: PaymentSummaryCardProps) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-[#0b3b5f]">
          <ReceiptText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {t("subscription.checkout.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {payment?.reference ?? t("subscription.paymentFlow.reference")}
          </p>
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">{t("subscription.checkout.plan")}</dt>
          <dd className="font-semibold text-slate-950">
            {payment?.plan?.name ?? "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            {t("subscription.paymentFlow.amount")}
          </dt>
          <dd className="font-semibold text-slate-950">
            {formatPrice(payment?.amount, payment?.currency)}
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
    </section>
  );
}
