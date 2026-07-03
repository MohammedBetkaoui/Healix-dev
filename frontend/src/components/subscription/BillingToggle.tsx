import { type BillingPeriod } from "@/types/subscription";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type BillingToggleProps = {
  billingPeriod: BillingPeriod;
  onChange: (billingPeriod: BillingPeriod) => void;
  t: TranslationFunction;
};

export function BillingToggle({
  billingPeriod,
  onChange,
  t,
}: BillingToggleProps) {
  const options: BillingPeriod[] = ["MONTHLY", "ANNUAL"];

  return (
    <section className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-950">
          {t("subscription.billing.title")}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {t("subscription.billing.annualSaving")}
        </p>
      </div>
      <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              billingPeriod === option
                ? "bg-[#0b3b5f] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-950",
            )}
          >
            {t(`subscription.billing.${option.toLowerCase()}`)}
            {option === "ANNUAL" ? (
              <span className="ms-2 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-700">
                {t("subscription.billing.freeMonths")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
