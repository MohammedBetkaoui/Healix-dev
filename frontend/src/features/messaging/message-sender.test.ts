import { AxiosError, type AxiosResponse } from "axios";

import { MessageSender, PendingMessagesStore } from "./message-sender";
import { type MessageView, type SendMessagePayload } from "./messaging.types";

function serverCopy(payload: SendMessagePayload, seq = 7): MessageView {
  return {
    body: payload.body,
    bodyUnavailable: false,
    clientMessageId: payload.clientMessageId,
    conversationId: "c-1",
    createdAt: "2026-10-17T09:00:00.000Z",
    deleted: false,
    editedAt: null,
    id: `m-${seq}`,
    kind: "TEXT",
    priority: payload.priority ?? "NORMAL",
    replyToId: payload.replyToId ?? null,
    requiresAck: payload.requiresAck ?? false,
    senderId: "user-me",
    seq,
    attachments: [],
    acks: [],
    ackedByMe: false,
    pendingAck: [],
    filedToRecord: false,
  };
}

function setup(send: jest.Mock) {
  const store = new PendingMessagesStore();
  const sent: MessageView[] = [];
  let next = 0;
  const sender = new MessageSender({
    newId: () => `client-${(next += 1)}`,
    now: () => new Date("2026-10-17T09:00:00.000Z"),
    onSent: (message) => sent.push(message),
    send,
    store,
  });
  return { sender, sent, store };
}

describe("MessageSender", () => {
  it("shows the copy at once as sending, then puts the server's copy in the cache and drops it", async () => {
    let resolve: (message: MessageView) => void = () => undefined;
    const send = jest.fn((_conversationId: string, payload: SendMessagePayload) =>
      new Promise<MessageView>((done) => {
        resolve = () => done(serverCopy(payload));
      }),
    );
    const { sender, sent, store } = setup(send);

    const delivery = sender.send("c-1", { body: "Avis ?", priority: "URGENT", replyToId: "m-3" });

    expect(store.list("c-1")).toEqual([
      expect.objectContaining({ body: "Avis ?", clientMessageId: "client-1", priority: "URGENT", replyToId: "m-3", status: "sending" }),
    ]);
    expect(send).toHaveBeenCalledWith("c-1", {
      body: "Avis ?",
      clientMessageId: "client-1",
      priority: "URGENT",
      replyToId: "m-3",
    });

    resolve(serverCopy({ body: "Avis ?", clientMessageId: "client-1" }));
    await delivery;

    expect(sent.map(({ clientMessageId }) => clientMessageId)).toEqual(["client-1"]);
    expect(store.list("c-1")).toEqual([]);
  });

  it("marks a failed copy, and retries it with the same clientMessageId: no duplicate", async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new AxiosError("Network Error"))
      .mockImplementation((_conversationId: string, payload: SendMessagePayload) => Promise.resolve(serverCopy(payload)));
    const { sender, sent, store } = setup(send);

    await sender.send("c-1", { body: "Bonjour", priority: "NORMAL", replyToId: null });
    expect(store.list("c-1")).toEqual([expect.objectContaining({ clientMessageId: "client-1", errorCode: "NETWORK", status: "failed" })]);

    await sender.retry("c-1", "client-1");

    const ids = send.mock.calls.map(([, payload]) => (payload as SendMessagePayload).clientMessageId);
    expect(ids).toEqual(["client-1", "client-1"]);
    expect(sent).toHaveLength(1);
    expect(store.list("c-1")).toEqual([]);
  });

  it("keeps the server's code of a refusal, and lets the copy be discarded", async () => {
    const refusal = new AxiosError("Conflict", "ERR_BAD_REQUEST", undefined, undefined, {
      data: { code: "CONVERSATION_PENDING" },
      status: 409,
    } as AxiosResponse);
    const { sender, store } = setup(jest.fn().mockRejectedValue(refusal));

    await sender.send("c-1", { body: "Relance", priority: "NORMAL", replyToId: null });
    expect(store.list("c-1")[0]).toMatchObject({ errorCode: "CONVERSATION_PENDING", status: "failed" });

    sender.discard("c-1", "client-1");
    expect(store.list("c-1")).toEqual([]);
    expect(sender.retry("c-1", "client-1")).toBeNull();
  });

  it("tells its subscribers, and keeps each conversation's copies apart", async () => {
    const { sender, store } = setup(jest.fn(() => new Promise(() => undefined)));
    const changes = jest.fn();
    store.subscribe(changes);

    void sender.send("c-1", { body: "Un", priority: "NORMAL", replyToId: null });
    void sender.send("c-2", { body: "Deux", priority: "NORMAL", replyToId: null });

    expect(changes).toHaveBeenCalledTimes(2);
    expect(store.list("c-1").map(({ body }) => body)).toEqual(["Un"]);
    expect(store.list("c-2").map(({ body }) => body)).toEqual(["Deux"]);
  });

  it("sends the files uploaded beforehand and the acknowledgement asked, with the message", async () => {
    const send = jest.fn((_conversationId: string, payload: SendMessagePayload) => Promise.resolve(serverCopy(payload)));
    const { sender, store } = setup(send);
    const ecg = { id: "file-1", mimeType: "application/pdf", originalName: "ECG.pdf", sizeBytes: 1_000 };

    const delivery = sender.send("c-1", {
      attachments: [ecg],
      body: "",
      priority: "URGENT",
      replyToId: null,
      requiresAck: true,
    });
    // Shown at once with its files.
    expect(store.list("c-1")[0]).toMatchObject({ attachments: [ecg], requiresAck: true });
    await delivery;

    expect(send).toHaveBeenCalledWith("c-1", {
      attachmentIds: ["file-1"],
      body: "",
      clientMessageId: "client-1",
      priority: "URGENT",
      requiresAck: true,
    });
  });

  it("never asks an acknowledgement for a message that is not urgent", async () => {
    const send = jest.fn((_conversationId: string, payload: SendMessagePayload) => Promise.resolve(serverCopy(payload)));
    const { sender } = setup(send);

    await sender.send("c-1", { body: "Simple", priority: "NORMAL", replyToId: null, requiresAck: true });

    expect(send.mock.calls[0][1]).not.toHaveProperty("requiresAck");
  });
});
