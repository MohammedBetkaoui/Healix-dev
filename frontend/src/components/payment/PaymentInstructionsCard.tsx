import { Landmark } from "lucide-react";

import { type PaymentSummary } from "@/features/payments/types/payment.types";
import { type TranslationFunction } from "@/lib/i18n";

export function PaymentInstructionsCard({
  payment,
  t,
  variant,
}: {
  payment?: PaymentSummary | null;
  t: TranslationFunction;
  variant: "baridimob" | "manual";
}) {
  const title =
    variant === "baridimob"
      ? t("subscription.paymentFlow.baridimobTitle")
      : t("subscription.paymentFlow.manualTitle");

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Landmark className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("subscription.paymentFlow.acceptedFormats")}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {t("subscription.paymentFlow.ccp")}
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">
            00799999002888754878
          </dd>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {t("subscription.paymentFlow.reference")}
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {payment?.reference ?? "-"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
