import { type TranslationFunction } from "@/lib/i18n";
import { type ClinicalNotification } from "../types/notification.types";

export function getNotificationCopy(notification: ClinicalNotification, t: TranslationFunction, locale: "fr" | "ar") {
  const base = `notifications.types.${notification.type}`;
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const data = notification.data;
  // An appointment has a time; a subscription ends on a day.
  const scheduled = typeof data?.scheduledAt === "string"
    ? new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.scheduledAt))
    : typeof data?.expiresAt === "string" && data.expiresAt !== ""
      ? new Intl.DateTimeFormat(intlLocale, { dateStyle: "long" }).format(new Date(data.expiresAt))
      : "";
  return {
    title: t(`${base}.title`),
    description: t(`${base}.description`, { date: scheduled, days: Number(data?.daysRemaining ?? data?.days ?? 0) }),
  };
}
