import { apiClient } from "@/lib/api/http-client";
import { type NotificationFilters, type NotificationPage, type NotificationPreference } from "../types/notification.types";

export async function listNotifications(filters: NotificationFilters, page = 1, limit = 20) {
  const { data } = await apiClient.get<NotificationPage>("/notifications", { params: { ...filters, page, limit } });
  return data;
}
export async function getUnreadNotificationCount() {
  const { data } = await apiClient.get<{ count: number }>("/notifications/unread-count");
  return data;
}
export async function markNotification(id: string, action: "read" | "unread" | "archive") {
  const { data } = await apiClient.patch(`/notifications/${encodeURIComponent(id)}/${action}`);
  return data;
}
export async function markAllNotificationsRead(category?: string) {
  const { data } = await apiClient.patch<{ updated: number }>("/notifications/read-all", undefined, { params: { category } });
  return data;
}
export async function getNotificationPreferences() {
  const { data } = await apiClient.get<NotificationPreference[]>("/notifications/preferences");
  return data;
}
export async function updateNotificationPreferences(preferences: Pick<NotificationPreference, "category" | "inAppEnabled">[]) {
  const { data } = await apiClient.patch<NotificationPreference[]>("/notifications/preferences", { preferences });
  return data;
}
