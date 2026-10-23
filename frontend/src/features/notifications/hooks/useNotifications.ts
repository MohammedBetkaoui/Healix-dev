"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getNotificationPreferences, getUnreadNotificationCount, listNotifications, markAllNotificationsRead, markNotification, updateNotificationPreferences } from "../api/notifications.api";
import { notificationKeys } from "../notification-query-keys";
import { type ClinicalNotification, type NotificationFilters, type NotificationPage, type NotificationPreference } from "../types/notification.types";

export function useNotifications(filters: NotificationFilters) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: ({ pageParam }) => listNotifications(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    retry: false,
    staleTime: 20_000,
  });
}

export function useRecentNotifications(enabled = true) {
  const filters: NotificationFilters = { status: "ALL" };
  return useQuery({
    enabled,
    queryKey: ["notifications", "recent"],
    queryFn: () => listNotifications(filters, 1, 5),
    retry: false,
    staleTime: 20_000,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({ queryKey: notificationKeys.unreadCount, queryFn: getUnreadNotificationCount, retry: false, staleTime: 20_000 });
}

function updateCachedNotifications(queryClient: ReturnType<typeof useQueryClient>, id: string, updater: (item: ClinicalNotification) => ClinicalNotification) {
  queryClient.setQueriesData<InfiniteData<NotificationPage>>({ queryKey: notificationKeys.lists }, (old) => old ? ({ ...old, pages: old.pages.map((page) => ({ ...page, data: page.data.map((item) => item.id === id ? updater(item) : item) })) }) : old);
  queryClient.setQueryData<NotificationPage>(["notifications", "recent"], (old) => old ? ({ ...old, data: old.data.map((item) => item.id === id ? updater(item) : item) }) : old);
}

function useActionMutation(action: "read" | "unread" | "archive") {
  const queryClient = useQueryClient();
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount }),
  ]);
  return useMutation({
    mutationFn: (id: string) => markNotification(id, action),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const snapshot = queryClient.getQueriesData({ queryKey: notificationKeys.all });
      updateCachedNotifications(queryClient, id, (item) => ({ ...item, readAt: action === "read" ? new Date().toISOString() : action === "unread" ? null : item.readAt }));
      if (action === "archive") updateCachedNotifications(queryClient, id, (item) => ({ ...item, id: `${item.id}:archived` }));
      return { snapshot };
    },
    onError: (_error, _id, context) => context?.snapshot.forEach(([key, value]) => queryClient.setQueryData(key, value)),
    onSettled: invalidate,
  });
}

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const read = useActionMutation("read");
  const unread = useActionMutation("unread");
  const archive = useActionMutation("archive");
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount }),
  ]);
  const readAll = useMutation({
    mutationFn: (category?: string) => markAllNotificationsRead(category),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const snapshot = queryClient.getQueriesData({ queryKey: notificationKeys.all });
      queryClient.setQueryData(notificationKeys.unreadCount, { count: 0 });
      queryClient.setQueriesData<InfiniteData<NotificationPage>>({ queryKey: notificationKeys.lists }, (old) => old ? ({ ...old, pages: old.pages.map((page) => ({ ...page, data: page.data.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) })) }) : old);
      return { snapshot };
    },
    onError: (_error, _category, context) => context?.snapshot.forEach(([key, value]) => queryClient.setQueryData(key, value)),
    onSettled: invalidate,
  });
  return { read, unread, archive, readAll };
}

export function useNotificationPreferences() {
  return useQuery({ queryKey: notificationKeys.preferences, queryFn: getNotificationPreferences, retry: false });
}
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (preferences: Pick<NotificationPreference, "category" | "inAppEnabled">[]) => updateNotificationPreferences(preferences), onSuccess: (data) => queryClient.setQueryData(notificationKeys.preferences, data) });
}
