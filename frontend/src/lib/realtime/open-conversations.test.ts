import { type MessagePage, type MessageView } from "@/features/messaging/messaging.types";

import {
  CATCH_UP_MAX_PAGES,
  catchUpOpenConversations,
  registerOpenConversation,
} from "./open-conversations";

function message(conversationId: string, seq: number): MessageView {
  return {
    body: `Message ${seq}`,
    bodyUnavailable: false,
    clientMessageId: null,
    conversationId,
    createdAt: "2026-10-17T08:00:00.000Z",
    deleted: false,
    editedAt: null,
    id: `${conversationId}-${seq}`,
    kind: "TEXT",
    priority: "NORMAL",
    replyToId: null,
    requiresAck: false,
    senderId: "user-b",
    seq,
  };
}

const page = (items: MessageView[], hasMore = false): MessagePage => ({ hasMore, items });

describe("catchUpOpenConversations", () => {
  it("fetches what followed the last message of each open conversation, page after page", async () => {
    const received: number[] = [];
    const unregister = registerOpenConversation("c-1", {
      lastSeq: () => 4,
      onMessages: (messages) => received.push(...messages.map(({ seq }) => seq)),
    });
    const fetchAfter = jest
      .fn()
      .mockResolvedValueOnce(page([message("c-1", 5), message("c-1", 6)], true))
      .mockResolvedValueOnce(page([message("c-1", 7)]));

    await catchUpOpenConversations(fetchAfter);
    unregister();

    expect(fetchAfter.mock.calls).toEqual([
      ["c-1", 4],
      ["c-1", 6],
    ]);
    expect(received).toEqual([5, 6, 7]);
  });

  it("stops after a bounded number of pages, and ignores closed conversations", async () => {
    const unregister = registerOpenConversation("c-2", {
      lastSeq: () => 0,
      onMessages: () => undefined,
    });
    let seq = 0;
    const fetchAfter = jest.fn(() => {
      seq += 1;
      return Promise.resolve(page([message("c-2", seq)], true));
    });

    await catchUpOpenConversations(fetchAfter);
    unregister();
    await catchUpOpenConversations(fetchAfter);

    expect(fetchAfter).toHaveBeenCalledTimes(CATCH_UP_MAX_PAGES);
  });

  it("goes on with the other conversations when one cannot be read", async () => {
    const received: string[] = [];
    const unregisterA = registerOpenConversation("c-a", {
      lastSeq: () => 1,
      onMessages: () => received.push("c-a"),
    });
    const unregisterB = registerOpenConversation("c-b", {
      lastSeq: () => 1,
      onMessages: () => received.push("c-b"),
    });
    const fetchAfter = jest.fn((conversationId: string) =>
      conversationId === "c-a"
        ? Promise.reject(new Error("404"))
        : Promise.resolve(page([message("c-b", 2)])),
    );

    await catchUpOpenConversations(fetchAfter);
    unregisterA();
    unregisterB();

    expect(received).toEqual(["c-b"]);
  });
});
