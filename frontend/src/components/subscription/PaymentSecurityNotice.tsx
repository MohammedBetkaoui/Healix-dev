import { ShieldCheck } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type PaymentSecurityNoticeProps = {
  t: TranslationFunction;
};

export function PaymentSecurityNotice({ t }: PaymentSecurityNoticeProps) {
  return (
    <section className="rounded-[24px] border border-cyan-100 bg-cyan-50/50 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            {t("subscription.security.title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("subscription.security.description")}
          </p>
        </div>
      </div>
    </section>
  );
}
