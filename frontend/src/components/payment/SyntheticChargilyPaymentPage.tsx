"use client";

import { useSearchParams } from "next/navigation";

import {
  DemoPaymentBanner,
  PaymentDeclinedPanel,
  PaymentSuccessPanel,
} from "@/components/payment/PaymentOutcomePanels";
import { PaymentSecurityNotice } from "@/components/payment/PaymentSecurityNotice";
import { PaymentSummaryCard } from "@/components/payment/PaymentSummaryCard";
import { SyntheticCardPaymentForm } from "@/components/payment/SyntheticCardPaymentForm";
import { useCreatePaymentIntent } from "@/features/payments/hooks/use-create-payment-intent";
import { usePaymentStatus } from "@/features/payments/hooks/use-payment-status";
import { useSyntheticCardPayment } from "@/features/payments/hooks/use-synthetic-card-payment";
import { type PaymentSummary } from "@/features/payments/types/payment.types";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

// The card payment of a subscription, in demonstration: the recap with the
// new expiry, the card form, then either the confirmation (active at once) or
// the refusal with another attempt.
export function SyntheticChargilyPaymentPage() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId") ?? "";
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const { data } = usePaymentStatus(paymentId);
  const card = useSyntheticCardPayment(paymentId);
  const retry = useCreatePaymentIntent();

  const paid = card.paid ?? (data?.status === "PAID" ? data.subscription : null);
  const refused = card.declined || data?.status === "FAILED";

  // A payment is final: another attempt is a new one for the same plan and
  // period, on a fresh page.
  const tryAgain = (payment: PaymentSummary) => {
    if (!payment.plan) {
      return;
    }

    void retry.createIntent({
      billingPeriod: payment.billingPeriod,
      paymentMethod: "SYNTHETIC_CHARGILY",
      planId: payment.plan.code,
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <DemoPaymentBanner t={t} />
        <div className="grid gap-6 lg:grid-cols-[1fr_0.78fr]">
          <div className="space-y-6">
            {paid ? (
              <PaymentSuccessPanel
                accountType={data?.accountType}
                expiresAt={paid.expiresAt}
                locale={locale}
                t={t}
              />
            ) : refused ? (
              <PaymentDeclinedPanel
                error={retry.error}
                isRetrying={retry.isLoading}
                onRetry={() => data && tryAgain(data)}
                t={t}
              />
            ) : (
              <SyntheticCardPaymentForm
                error={card.error}
                isLoading={card.isLoading}
                onSubmit={(payload) => void card.submit(payload)}
                t={t}
              />
            )}
            <PaymentSecurityNotice t={t} />
          </div>
          <PaymentSummaryCard locale={locale} payment={data} t={t} />
        </div>
      </div>
    </main>
  );
}
