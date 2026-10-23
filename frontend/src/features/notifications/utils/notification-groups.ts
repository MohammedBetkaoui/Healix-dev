import { type ClinicalNotification } from "../types/notification.types";

export type NotificationGroupKey = "today" | "yesterday" | "week" | "older";
export function groupNotifications(items: ClinicalNotification[]) {
  const result = new Map<NotificationGroupKey, ClinicalNotification[]>();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  items.forEach((item) => {
    const age = startToday.getTime() - new Date(item.createdAt).getTime();
    const key: NotificationGroupKey = age < 0 ? "today" : age < 86_400_000 ? "yesterday" : age < 6 * 86_400_000 ? "week" : "older";
    result.set(key, [...(result.get(key) ?? []), item]);
  });
  return result;
}
