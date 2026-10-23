import { type TranslationFunction } from "@/lib/i18n";
import { type ClinicalNotification } from "../types/notification.types";

export function getNotificationCopy(notification: ClinicalNotification, t: TranslationFunction, locale: "fr" | "ar") {
  const base = `notifications.types.${notification.type}`;
  const scheduled = typeof notification.data?.scheduledAt === "string"
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.data.scheduledAt))
    : "";
  return {
    title: t(`${base}.title`),
    description: t(`${base}.description`, { date: scheduled, days: Number(notification.data?.daysRemaining ?? 0) }),
  };
}
