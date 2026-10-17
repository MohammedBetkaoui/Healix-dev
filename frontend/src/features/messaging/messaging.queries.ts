"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getConversation,
  getMessagingSettings,
  getUnreadCount,
  getWorkspaceMembers,
  listBlocks,
  listConversations,
  listMessages,
  searchDirectory,
} from "./messaging.api";
import { messagingKeys } from "./messaging-query-keys";
import { statusOfFilter } from "./messaging-rules";
import { type ConversationFilter, type DirectorySearch } from "./messaging.types";

// The queries of the Messages interface. No automatic retry: a refused
// account (VERIFICATION_REQUIRED) or a closed conversation (404) is shown at
// once; the real-time events and the catch-up keep the data current.

export function useConversations(filter: ConversationFilter, enabled = true) {
  // queryFn before getNextPageParam: TypeScript infers the page type in
  // the order of the object.
  return useInfiniteQuery({
    queryKey: messagingKeys.conversationList(filter),
    queryFn: ({ pageParam }) => listConversations({ cursor: pageParam, status: statusOfFilter(filter) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    retry: false,
    staleTime: 15_000,
  });
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    enabled: Boolean(conversationId),
    queryFn: () => getConversation(conversationId as string),
    queryKey: messagingKeys.conversation(conversationId ?? ""),
    retry: false,
    staleTime: 15_000,
  });
}

// The history, going back: the first page is the latest; each next page is
// the one before its oldest message (beforeSeq).
export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: messagingKeys.messages(conversationId ?? ""),
    queryFn: ({ pageParam }) => listMessages(conversationId as string, { beforeSeq: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.items.length > 0 ? lastPage.items[0].seq : undefined,
    enabled: Boolean(conversationId),
    retry: false,
    staleTime: 30_000,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    enabled,
    queryFn: getUnreadCount,
    queryKey: messagingKeys.unreadCount,
    retry: false,
    staleTime: 30_000,
  });
}

export function useDirectory(search: DirectorySearch, enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => searchDirectory(search),
    queryKey: messagingKeys.directory(search),
    retry: false,
    staleTime: 30_000,
  });
}

export function useWorkspaceMembers(search: string, enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => getWorkspaceMembers(search),
    queryKey: messagingKeys.workspaceMembers(search),
    retry: false,
    staleTime: 60_000,
  });
}

export function useBlocks(enabled = true) {
  return useQuery({
    enabled,
    queryFn: listBlocks,
    queryKey: messagingKeys.blocks,
    retry: false,
    staleTime: 60_000,
  });
}

export function useMessagingSettings(enabled = true) {
  return useQuery({
    enabled,
    queryFn: getMessagingSettings,
    queryKey: messagingKeys.settings,
    retry: false,
    staleTime: 60_000,
  });
}
