"use client";

import { UploadCloud } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PaymentInstructionsCard } from "@/components/payment/PaymentInstructionsCard";
import { PaymentSecurityNotice } from "@/components/payment/PaymentSecurityNotice";
import { PaymentSummaryCard } from "@/components/payment/PaymentSummaryCard";
import { usePaymentStatus } from "@/features/payments/hooks/use-payment-status";
import { useUploadPaymentProof } from "@/features/payments/hooks/use-upload-payment-proof";
import { type PaymentProofType } from "@/features/payments/types/payment.types";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

type ManualProofUploadPageProps = {
  proofType: PaymentProofType;
  variant: "baridimob" | "manual";
};

export function ManualProofUploadPage({
  proofType,
  variant,
}: ManualProofUploadPageProps) {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId") ?? "";
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const { data } = usePaymentStatus(paymentId);
  const { error, isLoading, upload } = useUploadPaymentProof(paymentId, proofType);
  const [file, setFile] = useState<File | null>(null);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_0.78fr]">
        <div className="space-y-6">
          <PaymentInstructionsCard payment={data} t={t} variant={variant} />

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {t("subscription.paymentFlow.proofUpload")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("subscription.paymentFlow.acceptedFormats")}
                </p>
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-cyan-300 hover:bg-cyan-50/50">
              <UploadCloud className="h-7 w-7 text-slate-400" aria-hidden="true" />
              <span className="mt-3 text-sm font-semibold text-slate-700">
                {file?.name ?? t("subscription.paymentFlow.selectFile")}
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {error ? (
              <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              disabled={!file || isLoading}
              onClick={() => file && upload(file)}
              className="mt-5 w-full rounded-full"
            >
              {variant === "baridimob"
                ? t("subscription.paymentFlow.sendReceipt")
                : t("subscription.paymentFlow.sendProof")}
            </Button>
          </section>

          <PaymentSecurityNotice t={t} />
        </div>
        <PaymentSummaryCard payment={data} t={t} />
      </div>
    </main>
  );
}
