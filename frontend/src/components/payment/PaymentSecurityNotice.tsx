import { ShieldCheck } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

export function PaymentSecurityNotice({ t }: { t: TranslationFunction }) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm leading-6 text-slate-700">
      <ShieldCheck className="me-2 inline h-4 w-4 text-cyan-700" />
      {t("subscription.paymentFlow.security")}
    </div>
  );
}
