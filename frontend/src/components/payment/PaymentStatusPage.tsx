"use client";

import Link from "next/link";

import { PaymentStatusCard } from "@/components/payment/PaymentStatusCard";
import { PaymentSummaryCard } from "@/components/payment/PaymentSummaryCard";
import { usePaymentStatus } from "@/features/payments/hooks/use-payment-status";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

export function PaymentStatusPage({ paymentId }: { paymentId: string }) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const { data, error, isLoading } = usePaymentStatus(paymentId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
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
      </div>
    </main>
  );
}
