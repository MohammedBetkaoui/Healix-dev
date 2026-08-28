import { Banknote, CreditCard, Landmark } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type PaymentMethod } from "@/types/subscription";

type PaymentMethodSelectorProps = {
  disabled: boolean;
  onChange: (paymentMethod: PaymentMethod) => void;
  selectedMethod?: PaymentMethod;
  t: TranslationFunction;
};

const paymentMethods = [
  {
    badgeKey: "subscription.payment.recommended",
    descriptionKey: "subscription.payment.methods.chargily.description",
    icon: CreditCard,
    id: "SYNTHETIC_CHARGILY",
    titleKey: "subscription.payment.methods.chargily.title",
  },
  {
    descriptionKey: "subscription.payment.methods.manual.description",
    icon: Landmark,
    id: "MANUAL_POST_TRANSFER",
    titleKey: "subscription.payment.methods.manual.title",
  },
  {
    descriptionKey: "subscription.payment.methods.cash.description",
    icon: Banknote,
    id: "MANUAL_CASH",
    titleKey: "subscription.payment.methods.cash.title",
  },
  {
    descriptionKey: "subscription.payment.methods.baridimob.description",
    icon: Banknote,
    id: "BARIDIMOB_RECEIPT",
    titleKey: "subscription.payment.methods.baridimob.title",
  },
] as const;

export function PaymentMethodSelector({
  disabled,
  onChange,
  selectedMethod,
  t,
}: PaymentMethodSelectorProps) {
  return (
    <section className="rounded-[1.15rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_16px_38px_-30px_rgba(22,33,29,0.48)]">
      <h2 className="font-[var(--font-auth-display)] text-2xl font-medium text-[var(--ink)]">
        {t("subscription.payment.methodTitle")}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {paymentMethods.map((method) => {
          const Icon = method.icon;
          const selected = selectedMethod === method.id;

          return (
            <button
              key={method.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(method.id)}
              className={cn(
                "rounded-[1rem] border p-4 text-start transition",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/70 ring-2 ring-[var(--accent-line)]"
                  : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-line)] hover:bg-[var(--panel-soft)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[0.72rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
                  <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                </span>
                {"badgeKey" in method ? (
                  <span className="rounded-full border border-[var(--gold-line)] bg-[var(--gold-soft)] px-2.5 py-1 font-[var(--font-auth-mono)] text-[0.62rem] font-medium text-[var(--gold-dark)]">
                    {t(method.badgeKey)}
                  </span>
                ) : null}
              </div>
              <p className="mt-4 font-medium text-[var(--ink)]">
                {t(method.titleKey)}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {t(method.descriptionKey)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
