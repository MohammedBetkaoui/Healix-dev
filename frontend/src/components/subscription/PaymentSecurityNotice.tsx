import { ShieldCheck } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type PaymentSecurityNoticeProps = {
  t: TranslationFunction;
};

export function PaymentSecurityNotice({ t }: PaymentSecurityNoticeProps) {
  return (
    <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <ShieldCheck
        size={18}
        strokeWidth={1.8}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[var(--medical)]"
      />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("subscription.security.title")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          {t("subscription.security.description")}
        </p>
      </div>
    </section>
  );
}
