import { QueryClient } from "@tanstack/react-query";

import { messagingKeys } from "@/features/messaging/messaging-query-keys";

import { applyRealtimeEvent, queriesToInvalidate } from "./realtime-events";

const conversationId = "conversation-1";

describe("queriesToInvalidate", () => {
  it("reads a conversation's messages, lists and badge again on a new message", () => {
    expect(queriesToInvalidate("message.created", { conversationId, seq: 4 })).toEqual([
      ["messaging", "messages", conversationId],
      ["messaging", "conversation", conversationId],
      ["messaging", "conversations"],
      ["messaging", "unread-count"],
    ]);
  });

  it("reads the messages and the previews again on an edit or a deletion", () => {
    for (const event of ["message.updated", "message.deleted"] as const) {
      expect(queriesToInvalidate(event, { conversationId, messageId: "m-1" })).toEqual([
        messagingKeys.messages(conversationId),
        messagingKeys.conversationLists,
      ]);
    }
  });

  it("reads the conversation, the lists and the badge again on a read position", () => {
    expect(
      queriesToInvalidate("read.updated", { conversationId, seq: 3, userId: "user-a" }),
    ).toEqual([
      messagingKeys.conversation(conversationId),
      messagingKeys.conversationLists,
      messagingKeys.unreadCount,
    ]);
  });

  it("reads everything about the conversation again when it changed", () => {
    expect(queriesToInvalidate("conversation.updated", { conversationId })).toEqual([
      messagingKeys.conversation(conversationId),
      messagingKeys.messages(conversationId),
      messagingKeys.conversationLists,
      messagingKeys.unreadCount,
    ]);
  });

  it("changes no data on typing", () => {
    expect(queriesToInvalidate("typing", { conversationId, userId: "user-a" })).toEqual([]);
  });
});

describe("applyRealtimeEvent", () => {
  it("invalidates the cached queries of the event, and only those", async () => {
    const queryClient = new QueryClient();
    const data = { items: [] };
    queryClient.setQueryData(messagingKeys.messages(conversationId), data);
    queryClient.setQueryData(messagingKeys.messages("conversation-2"), data);
    queryClient.setQueryData([...messagingKeys.conversationLists, { status: "active" }], data);
    queryClient.setQueryData(messagingKeys.unreadCount, { total: 1 });
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    applyRealtimeEvent(queryClient, "message.created", { conversationId, seq: 2 });
    await Promise.resolve();

    expect(invalidate).toHaveBeenCalledTimes(4);
    const state = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect(state(messagingKeys.messages(conversationId))).toBe(true);
    expect(state([...messagingKeys.conversationLists, { status: "active" }])).toBe(true);
    expect(state(messagingKeys.unreadCount)).toBe(true);
    expect(state(messagingKeys.messages("conversation-2"))).toBe(false);
  });
});
