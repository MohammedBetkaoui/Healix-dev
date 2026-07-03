import { CheckCircle2, Clock3, XCircle } from "lucide-react";

import { type PaymentStatus } from "@/features/payments/types/payment.types";
import { type TranslationFunction } from "@/lib/i18n";

function getStatusTone(status?: PaymentStatus) {
  if (status === "PAID") {
    return {
      icon: CheckCircle2,
      className: "border-emerald-100 bg-emerald-50 text-emerald-800",
    };
  }

  if (status === "FAILED" || status === "REJECTED") {
    return {
      icon: XCircle,
      className: "border-rose-100 bg-rose-50 text-rose-800",
    };
  }

  return {
    icon: Clock3,
    className: "border-cyan-100 bg-cyan-50 text-cyan-800",
  };
}

export function PaymentStatusCard({
  rejectionReason,
  status,
  t,
}: {
  rejectionReason?: string | null;
  status?: PaymentStatus;
  t: TranslationFunction;
}) {
  const tone = getStatusTone(status);
  const Icon = tone.icon;

  return (
    <section className={`rounded-[24px] border p-5 ${tone.className}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">
            {t("subscription.paymentFlow.statusTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6">
            {status === "PAID"
              ? t("subscription.access.active.title")
              : status === "REJECTED" || status === "FAILED"
                ? (rejectionReason ?? t("subscription.paymentFlow.rejected"))
                : t("subscription.paymentFlow.waitingAdmin")}
          </p>
        </div>
      </div>
    </section>
  );
}
