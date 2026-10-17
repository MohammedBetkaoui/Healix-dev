import { type QueryClient, type QueryKey } from "@tanstack/react-query";

import { messagingKeys } from "@/features/messaging/messaging-query-keys";

// Mirrors backend/src/realtime/realtime.types.ts. The events carry
// identifiers only: the client reads the data again in REST.
export type RealtimeEventPayloads = {
  "message.created": { conversationId: string; seq: number };
  "message.updated": { conversationId: string; messageId: string };
  "message.deleted": { conversationId: string; messageId: string };
  "conversation.updated": { conversationId: string };
  // readAt: ISO 8601. Sent only between people who share read receipts.
  "read.updated": { conversationId: string; userId: string; seq: number; readAt: string };
  typing: { conversationId: string; userId: string };
};

export type RealtimeEventName = keyof RealtimeEventPayloads;

export const REALTIME_EVENTS = [
  "message.created",
  "message.updated",
  "message.deleted",
  "conversation.updated",
  "read.updated",
  "typing",
] as const satisfies readonly RealtimeEventName[];

// Why the server closed a socket (session.closed), or refused it
// (connect_error).
export type RealtimeCloseReason =
  | "token_expired"
  | "session_ended"
  | "too_many_sockets"
  | "protocol_violation";

export type RealtimeRefusalCode =
  | "origin_not_allowed"
  | "unauthorized"
  | "token_expired";

// The queries an event makes stale. typing changes no data: none.
export function queriesToInvalidate<Event extends RealtimeEventName>(
  event: Event,
  payload: RealtimeEventPayloads[Event],
): QueryKey[] {
  if (event === "typing") {
    return [];
  }

  const { conversationId } = payload as { conversationId: string };

  switch (event) {
    case "message.created":
      return [
        messagingKeys.messages(conversationId),
        messagingKeys.conversation(conversationId),
        messagingKeys.conversationLists,
        messagingKeys.unreadCount,
      ];
    case "message.updated":
    case "message.deleted":
      // The text and, for the last message, the preview of the list.
      return [
        messagingKeys.messages(conversationId),
        messagingKeys.conversationLists,
      ];
    case "read.updated":
      return [
        messagingKeys.conversation(conversationId),
        // "Vu à 14:32", "Vu par 3 sur 5": read again.
        messagingKeys.readersAll,
        messagingKeys.conversationLists,
        messagingKeys.unreadCount,
      ];
    default:
      // conversation.updated: members, status, title, archiving; the caller
      // may also have lost access to the messages.
      return [
        messagingKeys.conversation(conversationId),
        messagingKeys.messages(conversationId),
        messagingKeys.conversationLists,
        messagingKeys.unreadCount,
      ];
  }
}

export function applyRealtimeEvent<Event extends RealtimeEventName>(
  queryClient: QueryClient,
  event: Event,
  payload: RealtimeEventPayloads[Event],
): void {
  for (const queryKey of queriesToInvalidate(event, payload)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
