import { ShieldCheck } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type PaymentSecurityNoticeProps = {
  t: TranslationFunction;
};

export function PaymentSecurityNotice({ t }: PaymentSecurityNoticeProps) {
  return (
    <section className="rounded-[1.15rem] border border-[var(--accent-line)] bg-[var(--accent-soft)]/55 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--line)] bg-[var(--panel)] text-[var(--accent-dark)]">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-medium text-[var(--ink)]">
            {t("subscription.security.title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {t("subscription.security.description")}
          </p>
        </div>
      </div>
    </section>
  );
}
