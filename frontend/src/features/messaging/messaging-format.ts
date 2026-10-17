import { type Locale } from "@/i18n";

import { dayKeyOf, MESSAGING_TIME_ZONE, MUTED_FOREVER } from "./messaging-rules";

// Dates and times of the messaging, in the clinic's time zone and the
// user's language; 24-hour clock, as the rest of the clinical workspace.

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-DZ" : "fr-DZ");

export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: MESSAGING_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    hourCycle: "h23",
    timeStyle: "short",
    timeZone: MESSAGING_TIME_ZONE,
  }).format(new Date(iso));
}

// In the list: the time today, the short date otherwise.
export function formatListDate(iso: string, locale: Locale, now = new Date()): string {
  if (dayKeyOf(iso) === dayKeyOf(now.toISOString())) {
    return formatTime(iso, locale);
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: MESSAGING_TIME_ZONE,
  }).format(new Date(iso));
}

// The heading of a day of messages: today, yesterday, or the full date.
export function formatDayHeading(
  dayKey: string,
  locale: Locale,
  labels: { today: string; yesterday: string },
  now = new Date(),
): string {
  const today = dayKeyOf(now.toISOString());
  const yesterday = dayKeyOf(new Date(now.getTime() - 86_400_000).toISOString());
  if (dayKey === today) return labels.today;
  if (dayKey === yesterday) return labels.yesterday;
  // Noon UTC of that day: the same calendar day in Algiers.
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    timeZone: MESSAGING_TIME_ZONE,
    weekday: "long",
    year: "numeric",
  }).format(new Date(`${dayKey}T12:00:00.000Z`));
}

export function formatMutedUntil(mutedUntil: string, locale: Locale): string | null {
  return mutedUntil === MUTED_FOREVER ? null : formatDateTime(mutedUntil, locale);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

// A file's size: "850 ko", "2,4 Mo" (French units; Intl in Arabic).
export function formatFileSize(bytes: number, locale: Locale): string {
  const megabytes = bytes / (1024 * 1024);
  const [value, unit] = megabytes >= 1 ? [megabytes, "megabyte"] : [Math.max(1, Math.round(bytes / 1024)), "kilobyte"];
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: unit === "megabyte" ? 1 : 0,
    style: "unit",
    unit,
    unitDisplay: "short",
  }).format(value);
}
