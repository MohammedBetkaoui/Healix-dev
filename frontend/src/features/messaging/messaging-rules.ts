import { type InfiniteData } from "@tanstack/react-query";

import {
  type Conversation,
  type ConversationFilter,
  type ConversationParticipant,
  type ConversationStatusParam,
  type MessagePage,
  type MessagePriority,
  type MessageView,
} from "./messaging.types";

// The rules of the Messages interface that need no React: kept apart so that
// each one is tested on its own.

export const MESSAGING_TIME_ZONE = "Africa/Algiers";
export const MESSAGE_BODY_MAX_LENGTH = 4_000;
// The counter shows from here on.
export const MESSAGE_COUNTER_FROM = 3_500;
export const EDIT_WINDOW_MS = 15 * 60_000;
export const TYPING_SEND_INTERVAL_MS = 3_000;
export const TYPING_DISPLAY_MS = 5_000;
export const READ_INTERVAL_MS = 1_000;
// "Indefinitely": the latest instant a MySQL DATETIME holds.
export const MUTED_FOREVER = "9999-12-31T23:59:59.000Z";

// --- Messages: merging, optimistic copies --------------------------------------

// A message being sent, shown at once: "sending", then removed once the
// server's copy is in the cache, or "failed" with a retry that reuses the
// same clientMessageId (the server never stores it twice).
export type PendingMessage = {
  clientMessageId: string;
  conversationId: string;
  body: string;
  priority: MessagePriority;
  replyToId: string | null;
  createdAt: string;
  status: "sending" | "failed";
  errorCode?: string;
};

export type TimelineEntry =
  | { kind: "message"; key: string; message: MessageView }
  | { kind: "pending"; key: string; pending: PendingMessage };

// One copy per id (the last one given wins: an edit or a deletion replaces
// the previous version), sorted by seq.
export function mergeMessages(...lists: MessageView[][]): MessageView[] {
  const byId = new Map<string, MessageView>();
  for (const list of lists) {
    for (const message of list) {
      byId.set(message.id, message);
    }
  }
  return [...byId.values()].sort((first, second) => first.seq - second.seq);
}

export function messagesOfPages(data: InfiniteData<MessagePage> | undefined): MessageView[] {
  // Pages come newest first (each next page is older): any order is fine,
  // mergeMessages sorts.
  return data ? mergeMessages(...data.pages.map((page) => page.items)) : [];
}

// Puts messages into the cached history: a message already there is
// replaced where it is, a new one joins the latest page.
export function insertMessages(
  data: InfiniteData<MessagePage> | undefined,
  incoming: MessageView[],
): InfiniteData<MessagePage> | undefined {
  if (!data || data.pages.length === 0 || incoming.length === 0) {
    return data;
  }

  const byId = new Map(incoming.map((message) => [message.id, message]));
  const placed = new Set<string>();
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((message) => {
      const replacement = byId.get(message.id);
      if (!replacement) return message;
      placed.add(message.id);
      return replacement;
    }),
  }));
  const fresh = incoming.filter((message) => !placed.has(message.id));
  pages[0] = { ...pages[0], items: mergeMessages(pages[0].items, fresh) };

  return { ...data, pages };
}

// The server's messages, then the copies still being sent. A copy whose
// clientMessageId the server already returned (its response, or the
// message.created of one's own sending) is dropped: never shown twice.
export function buildTimeline(messages: MessageView[], pending: PendingMessage[]): TimelineEntry[] {
  const sent = new Set(messages.map((message) => message.clientMessageId).filter(Boolean));
  return [
    ...messages.map((message): TimelineEntry => ({ key: message.id, kind: "message", message })),
    ...pending
      .filter((entry) => !sent.has(entry.clientMessageId))
      .map((entry): TimelineEntry => ({ key: entry.clientMessageId, kind: "pending", pending: entry })),
  ];
}

// "New messages" goes before the first message the user had not read when
// the conversation opened, their own aside; the messages that arrive while it
// is open (after lastSeqAtOpening) are read as they come, without it.
export function newMessagesSeparatorSeq(
  messages: MessageView[],
  lastReadSeq: number,
  myUserId: string,
  lastSeqAtOpening = Number.POSITIVE_INFINITY,
): number | null {
  return (
    messages.find(
      (message) => message.seq > lastReadSeq && message.seq <= lastSeqAtOpening && message.senderId !== myUserId,
    )?.seq ?? null
  );
}

// --- Days ---------------------------------------------------------------------------

const dayKeyFormats = new Map<string, Intl.DateTimeFormat>();

// YYYY-MM-DD of an instant, in the clinic's time zone (Algiers by default):
// the day does not change with the browser's settings.
export function dayKeyOf(iso: string, timeZone = MESSAGING_TIME_ZONE): string {
  let format = dayKeyFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" });
    dayKeyFormats.set(timeZone, format);
  }
  return format.format(new Date(iso));
}

export type DayGroup<Item> = { day: string; items: Item[] };

// Consecutive items of a same day, in their order.
export function groupByDay<Item>(
  items: Item[],
  dateOf: (item: Item) => string,
  timeZone = MESSAGING_TIME_ZONE,
): DayGroup<Item>[] {
  const groups: DayGroup<Item>[] = [];
  for (const item of items) {
    const day = dayKeyOf(dateOf(item), timeZone);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

// --- Actions on a message -------------------------------------------------------

// The author, within 15 minutes, on a text that is still there.
export function canEditMessage(message: MessageView, myUserId: string, now = Date.now()): boolean {
  return (
    message.senderId === myUserId &&
    message.kind === "TEXT" &&
    !message.deleted &&
    !message.bodyUnavailable &&
    now - Date.parse(message.createdAt) <= EDIT_WINDOW_MS
  );
}

export function canDeleteMessage(message: MessageView, myUserId: string, now = Date.now()): boolean {
  return (
    message.senderId === myUserId &&
    !message.deleted &&
    now - Date.parse(message.createdAt) <= EDIT_WINDOW_MS
  );
}

// "Sent", then "read" once another participant's read position reached it
// (read.updated). In a group, how many have read it.
export function readReceipt(
  message: MessageView,
  conversation: Conversation,
  myUserId: string,
  readPositions: ReadonlyMap<string, number>,
): { state: "sent" } | { state: "read"; readers: number } {
  const readers = conversation.participants.filter(
    (participant) =>
      participant.userId !== myUserId && (readPositions.get(participant.userId) ?? 0) >= message.seq,
  ).length;
  return readers > 0 ? { readers, state: "read" } : { state: "sent" };
}

// --- Text -------------------------------------------------------------------------

export type TextToken = { type: "text"; value: string } | { type: "link"; href: string; value: string };

const URL_CANDIDATE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?…»”’'"]+$/;

// Plain text cut into text and http(s) links. Nothing here is ever HTML: the
// interface renders each token as a text node or an <a>.
export function tokenizeMessageText(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let index = 0;

  for (const match of text.matchAll(URL_CANDIDATE)) {
    let candidate = match[0].replace(TRAILING_PUNCTUATION, "");
    // A closing bracket ends the link unless the link opened it.
    while (/[)\]}]$/.test(candidate) && count(candidate, ")]}") > count(candidate, "([{")) {
      candidate = candidate.slice(0, -1).replace(TRAILING_PUNCTUATION, "");
    }
    const start = match.index ?? 0;
    const href = safeHttpUrl(candidate);

    if (!href) continue;
    if (start > index) tokens.push({ type: "text", value: text.slice(index, start) });
    tokens.push({ href, type: "link", value: candidate });
    index = start + candidate.length;
  }

  if (index < text.length) tokens.push({ type: "text", value: text.slice(index) });
  return tokens;
}

function count(value: string, characters: string): number {
  return [...value].filter((character) => characters.includes(character)).length;
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// --- Composer --------------------------------------------------------------------

export type ComposerBlockReason =
  // The recipient of a request: accept it first.
  | "requestReceived"
  // The single message of a request is sent: wait for the answer.
  | "awaitingReply"
  // The other side left, declined, or this conversation is closed.
  | "closed"
  // The caller blocked the other side: unblock first.
  | "blockedByMe";

export type ComposerAvailability =
  | { canWrite: true; notice: "firstMessageOnly" | null }
  | { canWrite: false; reason: ComposerBlockReason };

export function otherParticipant(conversation: Conversation, myUserId: string): ConversationParticipant | null {
  return conversation.participants.find((participant) => participant.userId !== myUserId) ?? null;
}

export function composerAvailability(
  conversation: Conversation,
  myUserId: string,
  blockedUserIds: ReadonlySet<string>,
): ComposerAvailability {
  if (conversation.me.status === "PENDING") {
    return { canWrite: false, reason: "requestReceived" };
  }
  if (conversation.me.status !== "ACTIVE") {
    return { canWrite: false, reason: "closed" };
  }
  if (conversation.type === "GROUP") {
    return { canWrite: true, notice: null };
  }

  const other = otherParticipant(conversation, myUserId);
  if (other && blockedUserIds.has(other.userId)) {
    return { canWrite: false, reason: "blockedByMe" };
  }
  if (other?.status === "PENDING") {
    return conversation.lastSeq > 0
      ? { canWrite: false, reason: "awaitingReply" }
      : { canWrite: true, notice: "firstMessageOnly" };
  }
  if (other?.status !== "ACTIVE") {
    return { canWrite: false, reason: "closed" };
  }
  return { canWrite: true, notice: null };
}

// In characters as the user sees them (an emoji counts as one), as the
// server counts the body once trimmed.
export function messageLength(body: string): number {
  return Array.from(body.trim()).length;
}

export function canSubmitMessage(body: string): boolean {
  const length = messageLength(body);
  return length > 0 && length <= MESSAGE_BODY_MAX_LENGTH;
}

export function showsLengthCounter(body: string): boolean {
  return messageLength(body) > MESSAGE_COUNTER_FROM;
}

// Enter sends; Shift+Enter breaks the line; an IME composition is never
// interrupted.
export function isSendShortcut(event: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

// --- Reading ------------------------------------------------------------------------

// The last message is marked read only when it is on screen and the window
// is the one the user is looking at, at most once per second.
export function shouldMarkRead(state: {
  lastMessageVisible: boolean;
  documentVisible: boolean;
  windowFocused: boolean;
  targetSeq: number;
  lastReadSeq: number;
  lastCallAt: number;
  now: number;
}): boolean {
  return (
    state.lastMessageVisible &&
    state.documentVisible &&
    state.windowFocused &&
    state.targetSeq > state.lastReadSeq &&
    state.now - state.lastCallAt >= READ_INTERVAL_MS
  );
}

// --- List -----------------------------------------------------------------------------

export function statusOfFilter(filter: ConversationFilter): ConversationStatusParam {
  if (filter === "requests") return "pending";
  if (filter === "archived") return "archived";
  return "active";
}

// The menu badge: nothing at 0, "99+" beyond 99.
export function unreadBadgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}

// The DIRECT conversation with this professional, if already known.
export function findDirectConversation(conversations: Conversation[], userId: string): Conversation | undefined {
  return conversations.find(
    (conversation) =>
      conversation.type === "DIRECT" && conversation.participants.some((participant) => participant.userId === userId),
  );
}

// Opens the DIRECT conversation with a professional: the known one, or the
// one the server returns, which is the existing conversation of the pair if
// there is one (never a second).
export async function openDirectConversation(options: {
  knownConversations: Conversation[];
  userId: string;
  create: (userId: string) => Promise<{ conversation: Conversation }>;
}): Promise<string> {
  const known = findDirectConversation(options.knownConversations, options.userId);
  if (known) return known.id;
  const { conversation } = await options.create(options.userId);
  return conversation.id;
}

export type MuteOption = "1h" | "8h" | "24h" | "forever";

export function mutedUntilFor(option: MuteOption, now = Date.now()): string {
  const hours = { "1h": 1, "24h": 24, "8h": 8 } as const;
  return option === "forever" ? MUTED_FOREVER : new Date(now + hours[option] * 3_600_000).toISOString();
}

export function isMuted(conversation: Conversation, now = Date.now()): boolean {
  return conversation.me.mutedUntil !== null && Date.parse(conversation.me.mutedUntil) > now;
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((part) => part && !/^dr\.?$/i.test(part))
      .slice(0, 2)
      .map((part) => Array.from(part)[0]?.toLocaleUpperCase() ?? "")
      .join("") || "?"
  );
}
