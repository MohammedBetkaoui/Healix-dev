import { fetchMessagesAfter } from "@/features/messaging/messaging.api";
import { type MessagePage, type MessageView } from "@/features/messaging/messaging.types";

// The conversations shown on screen (registered by the Messages interface,
// lot 3), so that what was missed while the connection was down, or the tab
// in the background, is fetched with afterSeq: no message is lost, even when
// a real-time event was.

export type OpenConversation = {
  // The last sequence number the view holds.
  lastSeq: () => number;
  // The messages that followed, oldest first, for the view to merge.
  onMessages: (messages: MessageView[]) => void;
};

// At most this many pages per conversation in one catch-up (50 messages
// each); beyond, the view reloads its history.
export const CATCH_UP_MAX_PAGES = 10;

const openConversations = new Map<string, Set<OpenConversation>>();

export function registerOpenConversation(
  conversationId: string,
  entry: OpenConversation,
): () => void {
  const entries = openConversations.get(conversationId) ?? new Set();
  entries.add(entry);
  openConversations.set(conversationId, entries);

  return () => {
    entries.delete(entry);
    if (entries.size === 0) {
      openConversations.delete(conversationId);
    }
  };
}

type FetchAfter = (conversationId: string, afterSeq: number) => Promise<MessagePage>;

// One conversation failing (no longer accessible: 404) does not stop the
// others.
export async function catchUpOpenConversations(
  fetchAfter: FetchAfter = fetchMessagesAfter,
): Promise<void> {
  await Promise.all(
    [...openConversations.entries()].map(async ([conversationId, entries]) => {
      let afterSeq = Math.max(...[...entries].map((entry) => entry.lastSeq()));

      try {
        for (let page = 0; page < CATCH_UP_MAX_PAGES; page += 1) {
          const { hasMore, items } = await fetchAfter(conversationId, afterSeq);

          if (items.length > 0) {
            entries.forEach((entry) => entry.onMessages(items));
            afterSeq = items[items.length - 1].seq;
          }
          if (!hasMore || items.length === 0) {
            return;
          }
        }
      } catch {
        // The conversation's own query reports the error.
      }
    }),
  );
}
