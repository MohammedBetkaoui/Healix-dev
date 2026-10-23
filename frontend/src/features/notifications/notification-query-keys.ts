import { type NotificationFilters } from "./types/notification.types";

export const notificationKeys = {
  all: ["notifications"] as const,
  lists: ["notifications", "list"] as const,
  list: (filters: NotificationFilters) => ["notifications", "list", filters] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  preferences: ["notifications", "preferences"] as const,
};
