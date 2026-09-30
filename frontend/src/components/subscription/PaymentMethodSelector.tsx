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
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        {t("subscription.payment.methodTitle")}
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {paymentMethods.map((method) => {
          const Icon = method.icon;
          const selected = selectedMethod === method.id;

          return (
            <button
              key={method.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(method.id)}
              className={cn(
                "flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
                  selected
                    ? "bg-[var(--surface)] text-[var(--accent-dark)]"
                    : "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
                )}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {t(method.titleKey)}
                  </span>
                  {"badgeKey" in method ? (
                    <span className="rounded-[var(--radius-xs)] bg-[var(--success-soft)] px-1.5 py-0.5 text-[.65rem] font-semibold text-[var(--success-ink)]">
                      {t(method.badgeKey)}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[.8rem] leading-5 text-[var(--text-secondary)]">
                  {t(method.descriptionKey)}
                </span>
              </span>
              {/* Radio-style indicator: the choice is exclusive. */}
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selected
                    ? "border-[var(--accent)]"
                    : "border-[var(--border-strong)]",
                )}
              >
                {selected ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
