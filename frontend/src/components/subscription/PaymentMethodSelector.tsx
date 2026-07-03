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
    id: "CHARGILY",
    titleKey: "subscription.payment.methods.chargily.title",
  },
  {
    descriptionKey: "subscription.payment.methods.manual.description",
    icon: Landmark,
    id: "MANUAL_TRANSFER",
    titleKey: "subscription.payment.methods.manual.title",
  },
  {
    descriptionKey: "subscription.payment.methods.baridimob.description",
    icon: Banknote,
    id: "BARIDIMOB",
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
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-lg font-semibold text-slate-950">
        {t("subscription.payment.methodTitle")}
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                "rounded-2xl border p-4 text-start transition",
                selected
                  ? "border-cyan-300 bg-cyan-50/70 ring-2 ring-cyan-100"
                  : "border-slate-200 bg-white hover:border-cyan-200",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-[#0b3b5f]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {"badgeKey" in method ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {t(method.badgeKey)}
                  </span>
                ) : null}
              </div>
              <p className="mt-4 font-semibold text-slate-950">
                {t(method.titleKey)}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {t(method.descriptionKey)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
