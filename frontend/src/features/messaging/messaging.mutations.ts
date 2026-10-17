"use client";

import { type InfiniteData, type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";

import {
  acceptConversation,
  addParticipants,
  blockUser,
  createDirectConversation,
  createGroupConversation,
  declineConversation,
  deleteMessage,
  editMessage,
  markConversationRead,
  removeParticipant,
  sendMessage,
  unblockUser,
  updateConversation,
  updateMessagingSettings,
} from "./messaging.api";
import { messagingKeys } from "./messaging-query-keys";
import { insertMessages } from "./messaging-rules";
import { MessageSender, PendingMessagesStore } from "./message-sender";
import {
  type Conversation,
  type MessagePage,
  type MessageView,
  type MessagingSettings,
  type ReadState,
} from "./messaging.types";

// The writes of the Messages interface. Each one updates what it knows in
// the cache, then lets the lists and the badge be read again.

function refreshLists(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists });
  void queryClient.invalidateQueries({ queryKey: messagingKeys.unreadCount });
}

function storeConversation(queryClient: QueryClient, conversation: Conversation) {
  queryClient.setQueryData(messagingKeys.conversation(conversation.id), conversation);
}

export function putMessages(queryClient: QueryClient, conversationId: string, messages: MessageView[]) {
  queryClient.setQueryData<InfiniteData<MessagePage>>(messagingKeys.messages(conversationId), (data) =>
    insertMessages(data, messages),
  );
}

export function useCreateDirectConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDirectConversation,
    onSuccess: ({ conversation }) => {
      storeConversation(queryClient, conversation);
      refreshLists(queryClient);
    },
  });
}

export function useCreateGroupConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ participantIds, title }: { title: string; participantIds: string[] }) =>
      createGroupConversation(title, participantIds),
    onSuccess: (conversation) => {
      storeConversation(queryClient, conversation);
      refreshLists(queryClient);
    },
  });
}

export function useUpdateConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: { title?: string; archived?: boolean; mutedUntil?: string | null }) =>
      updateConversation(conversationId, changes),
    onSuccess: (conversation) => {
      storeConversation(queryClient, conversation);
      refreshLists(queryClient);
    },
  });
}

export function useConversationMembers(conversationId: string) {
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (userIds: string[]) => addParticipants(conversationId, userIds),
    onSuccess: (conversation) => {
      storeConversation(queryClient, conversation);
      refreshLists(queryClient);
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeParticipant(conversationId, userId),
    onSuccess: (result) => {
      if ("participants" in result) storeConversation(queryClient, result);
      else queryClient.removeQueries({ queryKey: messagingKeys.conversation(conversationId) });
      refreshLists(queryClient);
    },
  });
  return { add, remove };
}

export function useAnswerRequest(conversationId: string) {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => acceptConversation(conversationId),
    onSuccess: (conversation) => {
      storeConversation(queryClient, conversation);
      refreshLists(queryClient);
    },
  });
  const decline = useMutation({
    mutationFn: () => declineConversation(conversationId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: messagingKeys.conversation(conversationId) });
      refreshLists(queryClient);
    },
  });
  return { accept, decline };
}

export function useBlockToggle() {
  const queryClient = useQueryClient();
  const after = () => {
    void queryClient.invalidateQueries({ queryKey: messagingKeys.blocks });
    void queryClient.invalidateQueries({ queryKey: ["messaging", "directory"] });
    refreshLists(queryClient);
  };
  const block = useMutation({ mutationFn: blockUser, onSuccess: after });
  const unblock = useMutation({ mutationFn: unblockUser, onSuccess: after });
  return { block, unblock };
}

export function useUpdateMessagingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: MessagingSettings) => updateMessagingSettings(settings),
    onSuccess: (settings) => queryClient.setQueryData(messagingKeys.settings, settings),
  });
}

export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, messageId }: { messageId: string; body: string }) => editMessage(messageId, body),
    onSuccess: (message) => {
      putMessages(queryClient, conversationId, [message]);
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists });
    },
  });
}

export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onSuccess: (message) => {
      putMessages(queryClient, conversationId, [message]);
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists });
    },
  });
}

export function useMarkRead(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (seq: number) => markConversationRead(conversationId, seq),
    onSuccess: (state: ReadState) => {
      queryClient.setQueryData<Conversation>(messagingKeys.conversation(conversationId), (conversation) =>
        conversation
          ? {
              ...conversation,
              me: { ...conversation.me, lastReadSeq: Math.max(conversation.me.lastReadSeq, state.lastReadSeq) },
              unreadCount: state.unreadCount,
            }
          : conversation,
      );
      refreshLists(queryClient);
    },
  });
}

// --- Optimistic sending -----------------------------------------------------------

// One store for the tab: a copy being sent survives switching conversations.
const pendingStore = new PendingMessagesStore();

export function usePendingMessages(conversationId: string) {
  return useSyncExternalStore(
    (listener) => pendingStore.subscribe(listener),
    () => pendingStore.list(conversationId),
    () => pendingStore.list(conversationId),
  );
}

export function useMessageSender(): MessageSender {
  const queryClient = useQueryClient();
  return useMemo(
    () =>
      new MessageSender({
        onSent: (message) => {
          putMessages(queryClient, message.conversationId, [message]);
          void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(message.conversationId) });
          refreshLists(queryClient);
        },
        send: sendMessage,
        store: pendingStore,
      }),
    [queryClient],
  );
}
