import { type InfiniteData } from "@tanstack/react-query";

import {
  type CasePatient,
  type Conversation,
  type ConversationFilter,
  type ConversationListParams,
  type ConversationParticipant,
  type MessagePage,
  type MessagePriority,
  type MessageView,
  type UploadedAttachment,
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
  requiresAck: boolean;
  replyToId: string | null;
  // Uploaded already: sent with the message, shown with the copy.
  attachments: UploadedAttachment[];
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
  // A group or a case discussion has no other side to wait for: an ACTIVE
  // participant writes, even alone in it.
  if (conversation.type !== "DIRECT") {
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

export function listParamsOfFilter(filter: ConversationFilter): ConversationListParams {
  if (filter === "requests") return { status: "pending" };
  if (filter === "archived") return { status: "archived" };
  if (filter === "cases") return { status: "active", type: "CASE" };
  return { status: "active" };
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

// --- Case discussions -------------------------------------------------------------

// The comment that goes with a note filed to the record.
export const CLINICAL_NOTE_COMMENT_MAX_LENGTH = 1_000;

// The patient as the interface names them: in Arabic letters in Arabic.
export function patientNameOf(patient: CasePatient, locale: "fr" | "ar"): string {
  return locale === "ar"
    ? `${patient.lastNameAr} ${patient.firstNameAr}`.trim()
    : `${patient.lastName.toLocaleUpperCase("fr")} ${patient.firstName}`.trim();
}

// In whole years, at the day given.
export function ageOf(birthDate: string, now = new Date()): number {
  const birth = new Date(birthDate);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

// "Verser au dossier": a message of a case discussion, not deleted, with
// something to file (text or files), not filed yet.
export function canFileToRecord(message: MessageView, conversation: Pick<Conversation, "type">): boolean {
  return (
    conversation.type === "CASE" &&
    !message.deleted &&
    !message.filedToRecord &&
    !message.bodyUnavailable &&
    (Boolean(message.body) || message.attachments.length > 0)
  );
}

// What "verser au dossier" will copy, shown before confirming: as the
// server composes it (backend messaging-rules filedContentOf).
export function filedContentOf(message: Pick<MessageView, "body" | "attachments">, attachmentLabel: string): string {
  return [
    ...(message.body ? [message.body] : []),
    ...message.attachments.map(({ originalName }) => `[${attachmentLabel} : ${originalName}]`),
  ].join("\n");
}

// --- Urgent messages ---------------------------------------------------------------

export type AckState =
  // Not asked, or deleted.
  | { kind: "none" }
  // Everyone acknowledged it: the last of them, and when.
  | { kind: "acked"; names: string[]; lastAckedAt: string }
  // Some recipients still expected.
  | { kind: "pending"; count: number; names: string[] };

export function ackStateOf(message: MessageView): AckState {
  if (!message.requiresAck || message.deleted) return { kind: "none" };
  if (message.pendingAck.length > 0) {
    return { count: message.pendingAck.length, kind: "pending", names: message.acks.map(({ fullName }) => fullName) };
  }
  const last = message.acks.at(-1);
  return last
    ? { kind: "acked", lastAckedAt: last.ackedAt, names: message.acks.map(({ fullName }) => fullName) }
    : { kind: "none" };
}

// A recipient who has not acknowledged a message that asks for it.
export function canAck(message: MessageView, myUserId: string): boolean {
  return message.requiresAck && !message.deleted && message.senderId !== myUserId && !message.ackedByMe;
}

// --- Attachments ----------------------------------------------------------------------

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE_MAX = 5;
// For the file picker; the server decides on the file's first bytes.
export const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";
const ATTACHMENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const ATTACHMENT_EXTENSIONS = /\.(pdf|png|jpe?g)$/i;

export type AttachmentProblem = "tooLarge" | "type" | "tooMany";

// Checked before uploading, to answer at once; the server checks again, on
// the content.
export function attachmentProblemOf(
  file: { name: string; size: number; type: string },
  alreadyAttached: number,
): AttachmentProblem | null {
  if (alreadyAttached >= ATTACHMENTS_PER_MESSAGE_MAX) return "tooMany";
  if (file.size > ATTACHMENT_MAX_BYTES) return "tooLarge";
  const typeKnown = file.type ? ATTACHMENT_TYPES.has(file.type) : ATTACHMENT_EXTENSIONS.test(file.name);
  return typeKnown ? null : "type";
}

export function isImageAttachment(attachment: { mimeType: string }): boolean {
  return attachment.mimeType === "image/png" || attachment.mimeType === "image/jpeg";
}

// A message is ready to send with text, or with files and nothing being
// uploaded.
export function canSendWith(body: string, attachments: { status: "uploading" | "ready" | "failed" }[]): boolean {
  if (attachments.some(({ status }) => status !== "ready")) return false;
  const length = messageLength(body);
  if (length > MESSAGE_BODY_MAX_LENGTH) return false;
  return length > 0 || attachments.length > 0;
}
