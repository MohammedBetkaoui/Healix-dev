"use client";

import { useSearchParams } from "next/navigation";

import { PaymentSecurityNotice } from "@/components/payment/PaymentSecurityNotice";
import { PaymentSummaryCard } from "@/components/payment/PaymentSummaryCard";
import { SyntheticCardPaymentForm } from "@/components/payment/SyntheticCardPaymentForm";
import { usePaymentStatus } from "@/features/payments/hooks/use-payment-status";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

export function SyntheticChargilyPaymentPage() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId") ?? "";
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const { data } = usePaymentStatus(paymentId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_0.78fr]">
        <div className="space-y-6">
          <SyntheticCardPaymentForm paymentId={paymentId} t={t} />
          <PaymentSecurityNotice t={t} />
        </div>
        <PaymentSummaryCard payment={data} t={t} />
      </div>
    </main>
  );
}
