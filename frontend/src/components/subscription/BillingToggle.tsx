import { type BillingPeriod } from "@/types/subscription";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type BillingToggleProps = {
  billingPeriod: BillingPeriod;
  onChange: (billingPeriod: BillingPeriod) => void;
  t: TranslationFunction;
};

// Compact segmented control, rendered in the pricing section's heading.
export function BillingToggle({
  billingPeriod,
  onChange,
  t,
}: BillingToggleProps) {
  const options: BillingPeriod[] = ["MONTHLY", "ANNUAL"];

  return (
    <div
      className="inline-flex w-fit items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
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
            "inline-flex min-h-9 items-center rounded-[var(--radius-xs)] px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            billingPeriod === option
              ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {t(`subscription.billing.${option.toLowerCase()}`)}
          {option === "ANNUAL" ? (
            <span className="ms-2 rounded-[var(--radius-xs)] bg-[var(--success-soft)] px-1.5 py-0.5 text-[.65rem] font-semibold text-[var(--success-ink)]">
              {t("subscription.billing.freeMonths")}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
