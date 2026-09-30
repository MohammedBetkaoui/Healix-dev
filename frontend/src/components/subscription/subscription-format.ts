import { type Locale } from "@/i18n";

const intlLocale: Record<Locale, string> = {
  ar: "ar-DZ",
  fr: "fr-DZ",
};

// Amounts are always shown with Latin digits and the "DA" suffix, matching
// invoices and the payment screens, whatever the interface language.
const amountFormatter = new Intl.NumberFormat("fr-DZ");

export function formatPlanAmount(value: number) {
  return amountFormatter.format(value);
}

// Billing periods are calendar dates: no time of day, month spelled out.
export function formatBillingDate(value: string | undefined, locale: Locale) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
