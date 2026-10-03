import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";
import { type PaymentMethod } from "@/types/subscription";

type PaymentMethodBadgeProps = {
  method: PaymentMethod;
  t: TranslationFunction;
};

// Online (gateway) payments stand out from the manual ones, which go through
// an admin review.
const methodStyles: Record<PaymentMethod, string> = {
  BARIDIMOB_RECEIPT: "border-border bg-card text-foreground",
  MANUAL_CASH: "border-border bg-card text-foreground",
  MANUAL_POST_TRANSFER: "border-border bg-card text-foreground",
  SYNTHETIC_CHARGILY: "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]",
};

export function PaymentMethodBadge({ method, t }: PaymentMethodBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold",
        methodStyles[method],
      )}
    >
      {t(`admin.badges.paymentMethod.${method}`)}
    </span>
  );
}
