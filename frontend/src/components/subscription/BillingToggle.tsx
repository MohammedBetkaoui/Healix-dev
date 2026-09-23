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
    <section className="flex flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-[var(--font-auth-mono)] text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[var(--ink)]">
          {t("subscription.billing.title")}
        </p>
        <p className="mt-1.5 text-sm text-[var(--ink-soft)]">
          {t("subscription.billing.annualSaving")}
        </p>
      </div>
      <div
        className="inline-flex w-fit rounded-full border border-[var(--line)] bg-[var(--panel-soft)] p-1"
        role="group"
        aria-label={t("subscription.billing.title")}
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={billingPeriod === option}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel-soft)]",
              billingPeriod === option
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]",
            )}
          >
            {t(`subscription.billing.${option.toLowerCase()}`)}
            {option === "ANNUAL" ? (
              <span className="ms-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 font-[var(--font-auth-mono)] text-[10px] font-medium text-[var(--accent-dark)]">
                {t("subscription.billing.freeMonths")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
