import { type Locale } from "@/i18n";

const localeMap: Record<Locale, string> = {
  ar: "ar-DZ",
  fr: "fr-DZ",
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// YYYY-MM-DD in local time (not toISOString, which is UTC) so export file
// names match the admin's calendar day.
export function getLocalDateStamp(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatAdminDateTime(
  value: string | null | undefined,
  locale: Locale,
) {
  const date = parseDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(localeMap[locale], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Africa/Algiers",
    year: "numeric",
  }).format(date);
}
