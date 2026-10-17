import { isAxiosError } from "axios";

import { type PendingMessage } from "./messaging-rules";
import { type MessagePriority, type MessageView, type SendMessagePayload } from "./messaging.types";

// Optimistic sending, without React: the copies being sent live here, per
// conversation, until the server's copy is in the cache. Kept outside the
// components so that a copy survives switching conversations.

type Listener = () => void;

export class PendingMessagesStore {
  private readonly byConversation = new Map<string, PendingMessage[]>();
  private readonly listeners = new Set<Listener>();
  private static readonly empty: PendingMessage[] = [];

  list(conversationId: string): PendingMessage[] {
    return this.byConversation.get(conversationId) ?? PendingMessagesStore.empty;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  upsert(entry: PendingMessage): void {
    const current = this.list(entry.conversationId).filter((item) => item.clientMessageId !== entry.clientMessageId);
    this.byConversation.set(entry.conversationId, [...current, entry]);
    this.notify();
  }

  remove(conversationId: string, clientMessageId: string): void {
    const remaining = this.list(conversationId).filter((item) => item.clientMessageId !== clientMessageId);
    if (remaining.length === 0) this.byConversation.delete(conversationId);
    else this.byConversation.set(conversationId, remaining);
    this.notify();
  }

  find(conversationId: string, clientMessageId: string): PendingMessage | undefined {
    return this.list(conversationId).find((item) => item.clientMessageId === clientMessageId);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export type MessageSenderOptions = {
  store: PendingMessagesStore;
  send: (conversationId: string, payload: SendMessagePayload) => Promise<MessageView>;
  // Puts the server's copy into the cached history.
  onSent: (message: MessageView) => void;
  newId?: () => string;
  now?: () => Date;
};

function errorCodeOf(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  if (!error.response) return "NETWORK";
  const code = (error.response.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

export class MessageSender {
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: MessageSenderOptions) {
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
  }

  // Shown at once as "sending"; returns its clientMessageId.
  send(
    conversationId: string,
    input: { body: string; priority: MessagePriority; replyToId: string | null },
  ): Promise<string> {
    const entry: PendingMessage = {
      body: input.body,
      clientMessageId: this.newId(),
      conversationId,
      createdAt: this.now().toISOString(),
      priority: input.priority,
      replyToId: input.replyToId,
      status: "sending",
    };
    this.options.store.upsert(entry);
    return this.deliver(entry);
  }

  // The same clientMessageId: if the first attempt reached the server after
  // all, the server returns that message instead of storing another one.
  retry(conversationId: string, clientMessageId: string): Promise<string> | null {
    const entry = this.options.store.find(conversationId, clientMessageId);
    if (!entry) return null;
    const retried: PendingMessage = { ...entry, errorCode: undefined, status: "sending" };
    this.options.store.upsert(retried);
    return this.deliver(retried);
  }

  discard(conversationId: string, clientMessageId: string): void {
    this.options.store.remove(conversationId, clientMessageId);
  }

  private async deliver(entry: PendingMessage): Promise<string> {
    try {
      const message = await this.options.send(entry.conversationId, {
        body: entry.body,
        clientMessageId: entry.clientMessageId,
        priority: entry.priority,
        ...(entry.replyToId ? { replyToId: entry.replyToId } : {}),
      });
      // Into the cache first: the copy disappears only once the message is
      // shown, never leaving a gap.
      this.options.onSent(message);
      this.options.store.remove(entry.conversationId, entry.clientMessageId);
    } catch (error) {
      this.options.store.upsert({ ...entry, errorCode: errorCodeOf(error), status: "failed" });
    }
    return entry.clientMessageId;
  }
}
