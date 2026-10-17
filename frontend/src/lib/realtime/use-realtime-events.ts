"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { messagingKeys } from "@/features/messaging/messaging-query-keys";

import { catchUpOpenConversations } from "./open-conversations";
import { getRealtimeClient } from "./realtime-client";
import {
  applyRealtimeEvent,
  type RealtimeEventPayloads,
} from "./realtime-events";

type Options = {
  // "Is typing": shown by the interface, no data to read again.
  onTyping?: (payload: RealtimeEventPayloads["typing"]) => void;
};

// After a reconnection or a return to the tab: the lists and the badge are
// read again, the open conversations fetch what followed their last message.
export function catchUp(queryClient: QueryClient): Promise<void> {
  void queryClient.invalidateQueries({
    queryKey: messagingKeys.conversationLists,
  });
  void queryClient.invalidateQueries({ queryKey: messagingKeys.unreadCount });
  return catchUpOpenConversations();
}

// Wires the tab's real-time connection to TanStack Query: each event
// invalidates the queries it concerns. To be used by the pages of a signed-in
// professional (the Messages interface and the menu badge, lot 3): the
// connection opens with the first of them and closes with the last.
export function useRealtimeEvents(options: Options = {}): void {
  const queryClient = useQueryClient();
  const onTyping = useRef(options.onTyping);

  useEffect(() => {
    onTyping.current = options.onTyping;
  }, [options.onTyping]);

  useEffect(() => {
    const client = getRealtimeClient();
    const unsubscribe = client.subscribe((event, payload) => {
      if (event === "typing") {
        onTyping.current?.(payload as RealtimeEventPayloads["typing"]);
      } else {
        applyRealtimeEvent(queryClient, event, payload);
      }
    });
    // The first connection catches up too: events may have been missed
    // while the page was loading.
    const unwatch = client.onConnectionChange((connected) => {
      if (connected) void catchUp(queryClient);
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void catchUp(queryClient);
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const release = client.retain();

    return () => {
      unsubscribe();
      unwatch();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      release();
    };
  }, [queryClient]);
}
