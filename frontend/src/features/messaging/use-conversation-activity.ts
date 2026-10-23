"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtimeSubscription } from "@/lib/realtime/use-realtime-events";

import { READ_INTERVAL_MS, shouldMarkRead, TYPING_DISPLAY_MS } from "./messaging-rules";

// What the other participants do in the open conversation, from the
// real-time events: how far each one has read (read.updated), who is
// typing (shown for 5 s after their last typing event). To be used by a
// component keyed by the conversation: its state starts afresh with each.
export function useConversationActivity(conversationId: string, myUserId: string) {
  const [readPositions, setReadPositions] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [typingUntil, setTypingUntil] = useState<ReadonlyMap<string, number>>(() => new Map());

  useRealtimeSubscription((event, payload) => {
    if (!("conversationId" in payload)) return;
    if (payload.conversationId !== conversationId) return;

    if (event === "read.updated") {
      const { seq, userId } = payload as { seq: number; userId: string };
      if (userId === myUserId) return;
      setReadPositions((current) => {
        if ((current.get(userId) ?? 0) >= seq) return current;
        return new Map(current).set(userId, seq);
      });
    } else if (event === "typing") {
      const { userId } = payload as { userId: string };
      if (userId === myUserId) return;
      setTypingUntil((current) => new Map(current).set(userId, Date.now() + TYPING_DISPLAY_MS));
    } else if (event === "message.created") {
      // The message is in: whoever was typing has sent it. The event does not
      // say who, so the indicator ends a little earlier for everyone.
      setTypingUntil((current) => (current.size === 0 ? current : new Map()));
    }
  });

  // Drops each typing entry when its 5 s are over.
  useEffect(() => {
    if (typingUntil.size === 0) return;
    const next = Math.min(...typingUntil.values());
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setTypingUntil((current) => new Map([...current].filter(([, until]) => until > now)));
    }, Math.max(0, next - Date.now()) + 20);
    return () => window.clearTimeout(timer);
  }, [typingUntil]);

  return { readPositions, typingUserIds: [...typingUntil.keys()] };
}

// Marks the conversation read up to its last message, when that message is
// on screen and the window is the active one, at most once per second.
export function useReadTracker(options: {
  targetSeq: number;
  lastReadSeq: number;
  markRead: (seq: number) => void;
}): (element: HTMLElement | null) => void {
  const latest = useRef(options);
  const visible = useRef(false);
  const lastCallAt = useRef(0);
  const sent = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);

  // A stable callback for the observers and timers; its body reads the
  // latest options.
  const run = useRef<() => void>(() => undefined);
  const check = useCallback(() => run.current(), []);

  useEffect(() => {
    latest.current = options;
    run.current = () => {
      const { lastReadSeq, markRead, targetSeq } = latest.current;
      const now = Date.now();
      const state = {
        documentVisible: document.visibilityState === "visible",
        lastCallAt: lastCallAt.current,
        lastMessageVisible: visible.current,
        // Already asked for this position: not again.
        lastReadSeq: Math.max(lastReadSeq, sent.current),
        now,
        targetSeq,
        windowFocused: document.hasFocus(),
      };

      if (shouldMarkRead(state)) {
        lastCallAt.current = now;
        sent.current = targetSeq;
        markRead(targetSeq);
        return;
      }

      // Only the interval stood in the way: try again when it is over.
      if (shouldMarkRead({ ...state, now: lastCallAt.current + READ_INTERVAL_MS })) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(check, lastCallAt.current + READ_INTERVAL_MS - now);
      }
    };
  });

  useEffect(() => {
    check();
  }, [check, options.targetSeq, options.lastReadSeq]);

  useEffect(() => {
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearTimeout(retryTimer.current);
    };
  }, [check]);

  const observer = useRef<IntersectionObserver | null>(null);

  // The element after the last message: read once it is in view.
  return useCallback(
    (element: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      visible.current = false;
      if (!element || typeof IntersectionObserver === "undefined") return;
      observer.current = new IntersectionObserver((entries) => {
        visible.current = entries.some((entry) => entry.isIntersecting);
        if (visible.current) check();
      });
      observer.current.observe(element);
    },
    [check],
  );
}
