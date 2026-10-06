"use client";

import Link from "next/link";

import { PaymentStatusCard } from "@/components/payment/PaymentStatusCard";
import { PaymentSummaryCard } from "@/components/payment/PaymentSummaryCard";
import { usePaymentStatus } from "@/features/payments/hooks/use-payment-status";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

type PaymentStatusPageProps = {
  paymentId: string;
  redirectedFromPendingPayment?: boolean;
};

export function PaymentStatusPage({
  paymentId,
  redirectedFromPendingPayment = false,
}: PaymentStatusPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const { data, error, isLoading } = usePaymentStatus(paymentId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Only while the payment is still under review: a reloaded ?pending=1
            URL must not claim so once an admin has decided. */}
        {redirectedFromPendingPayment &&
        data?.status === "WAITING_ADMIN_REVIEW" ? (
          <p
            role="status"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
          >
            {t("subscription.paymentFlow.alreadyPending")}
          </p>
        ) : null}
        <PaymentStatusCard
          rejectionReason={data?.rejectionReason}
          status={data?.status}
          t={t}
        />
        <PaymentSummaryCard payment={data} t={t} />

        {isLoading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            {t("subscription.paymentFlow.loading")}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#0b3b5f] px-5 text-sm font-medium text-white shadow-sm shadow-sky-950/15 transition hover:bg-[#092f4d]"
            href={
              data?.accountType === "ESTABLISHMENT"
                ? "/establishment/dashboard"
                : "/doctor/dashboard"
            }
          >
            {t("subscription.paymentFlow.dashboard")}
          </Link>
          {/* A refused or failed payment is final: a new attempt starts from
              the plan choice on the role's subscription page. */}
          {data?.status === "REJECTED" || data?.status === "FAILED" ? (
            <Link
              className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
              href={
                data.accountType === "ESTABLISHMENT"
                  ? "/establishment/subscription"
                  : "/doctor/subscription"
              }
            >
              {t("subscription.paymentFlow.retry")}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
