import { type InfiniteData } from "@tanstack/react-query";

import {
  ackStateOf,
  ageOf,
  attachmentProblemOf,
  buildTimeline,
  canAck,
  canDeleteMessage,
  canEditMessage,
  canFileToRecord,
  canSendWith,
  canSubmitMessage,
  composerAvailability,
  dayKeyOf,
  EDIT_WINDOW_MS,
  filedContentOf,
  groupByDay,
  insertMessages,
  isMuted,
  isSendShortcut,
  listParamsOfFilter,
  mergeMessages,
  messageLength,
  messagesOfPages,
  MUTED_FOREVER,
  mutedUntilFor,
  newMessagesSeparatorSeq,
  openDirectConversation,
  patientNameOf,
  type PendingMessage,
  readReceipt,
  shouldMarkRead,
  showsLengthCounter,
  tokenizeMessageText,
  unreadBadgeText,
} from "./messaging-rules";
import { type Conversation, type ConversationParticipant, type MessagePage, type MessageView } from "./messaging.types";

const ME = "user-me";
const OTHER = "user-other";

function message(seq: number, overrides: Partial<MessageView> = {}): MessageView {
  return {
    body: `Message ${seq}`,
    bodyUnavailable: false,
    clientMessageId: null,
    conversationId: "c-1",
    createdAt: "2026-10-17T09:00:00.000Z",
    deleted: false,
    editedAt: null,
    id: `m-${seq}`,
    kind: "TEXT",
    priority: "NORMAL",
    replyToId: null,
    requiresAck: false,
    senderId: OTHER,
    seq,
    attachments: [],
    acks: [],
    ackedByMe: false,
    pendingAck: [],
    filedToRecord: false,
    ...overrides,
  };
}

function participant(userId: string, overrides: Partial<ConversationParticipant> = {}): ConversationParticipant {
  return { establishmentName: null, fullName: userId, role: "MEMBER", speciality: null, status: "ACTIVE", userId, ...overrides };
}

function conversation(overrides: Partial<Conversation> = {}, participants = [participant(ME), participant(OTHER)]): Conversation {
  return {
    archivedAt: null,
    createdAt: "2026-10-17T08:00:00.000Z",
    createdById: ME,
    id: "c-1",
    lastMessage: null,
    lastMessageAt: null,
    lastSeq: 0,
    me: { lastReadSeq: 0, mutedUntil: null, role: "MEMBER", status: "ACTIVE" },
    participants,
    patient: null,
    title: null,
    type: "DIRECT",
    unreadCount: 0,
    workspaceId: null,
    ...overrides,
  };
}

const pages = (...lists: MessageView[][]): InfiniteData<MessagePage> => ({
  pageParams: lists.map((_, index) => (index === 0 ? undefined : index)),
  pages: lists.map((items) => ({ hasMore: true, items })),
});

describe("merging the history", () => {
  it("sorts by seq and keeps one copy per id, the last given", () => {
    const edited = message(2, { body: "Corrigé", editedAt: "2026-10-17T09:05:00.000Z" });

    expect(mergeMessages([message(3), message(1)], [message(2), edited]).map(({ body, seq }) => [seq, body])).toEqual([
      [1, "Message 1"],
      [2, "Corrigé"],
      [3, "Message 3"],
    ]);
  });

  it("reads the pages, newest first, as one sorted history", () => {
    expect(messagesOfPages(pages([message(4), message(5)], [message(2), message(3)])).map(({ seq }) => seq)).toEqual([2, 3, 4, 5]);
    expect(messagesOfPages(undefined)).toEqual([]);
  });

  it("replaces a message where it is, and puts a new one in the latest page", () => {
    const data = pages([message(4)], [message(2), message(3)]);
    const deleted = message(2, { body: null, deleted: true });

    const next = insertMessages(data, [deleted, message(5)]);

    expect(next?.pages[0].items.map(({ seq }) => seq)).toEqual([4, 5]);
    expect(next?.pages[1].items[0]).toEqual(deleted);
    expect(insertMessages(undefined, [message(1)])).toBeUndefined();
  });
});

describe("optimistic copies", () => {
  const pending = (clientMessageId: string): PendingMessage => ({
    body: "Envoyé tout de suite",
    clientMessageId,
    conversationId: "c-1",
    createdAt: "2026-10-17T09:10:00.000Z",
    priority: "NORMAL",
    requiresAck: false,
    replyToId: null,
    attachments: [],
    status: "sending",
  });

  it("shows a copy after the server's messages until the server returns it", () => {
    const timeline = buildTimeline([message(1)], [pending("client-a")]);
    expect(timeline.map((entry) => entry.kind)).toEqual(["message", "pending"]);
  });

  it("never shows twice a message whose message.created arrived first", () => {
    const fromServer = message(2, { clientMessageId: "client-a", senderId: ME });

    const timeline = buildTimeline([message(1), fromServer], [pending("client-a"), pending("client-b")]);

    expect(timeline.map((entry) => entry.key)).toEqual(["m-1", "m-2", "client-b"]);
  });
});

describe("the new messages separator", () => {
  it("goes before the first message the user had not read, their own aside", () => {
    const history = [message(1), message(2), message(3, { senderId: ME }), message(4), message(5)];
    expect(newMessagesSeparatorSeq(history, 2, ME)).toBe(4);
    expect(newMessagesSeparatorSeq(history, 0, ME)).toBe(1);
  });

  it("is not there when everything was read", () => {
    expect(newMessagesSeparatorSeq([message(1), message(2)], 2, ME)).toBeNull();
    expect(newMessagesSeparatorSeq([message(3, { senderId: ME })], 2, ME)).toBeNull();
  });

  it("leaves out the messages received while the conversation is open", () => {
    const history = [message(1), message(2), message(3)];
    expect(newMessagesSeparatorSeq(history, 2, ME, 2)).toBeNull();
    expect(newMessagesSeparatorSeq([...history, message(4)], 1, ME, 3)).toBe(2);
  });
});

describe("days, in Algiers", () => {
  it("changes day at midnight in Algiers, not in UTC", () => {
    // 23:30 UTC on the 16th is 00:30 on the 17th in Algiers (UTC+1).
    expect(dayKeyOf("2026-10-16T23:30:00.000Z")).toBe("2026-10-17");
    expect(dayKeyOf("2026-10-16T22:30:00.000Z")).toBe("2026-10-16");
  });

  it("groups consecutive messages of a same day", () => {
    const groups = groupByDay(
      [
        message(1, { createdAt: "2026-10-16T21:00:00.000Z" }),
        message(2, { createdAt: "2026-10-16T22:59:00.000Z" }),
        message(3, { createdAt: "2026-10-16T23:01:00.000Z" }),
        message(4, { createdAt: "2026-10-17T10:00:00.000Z" }),
      ],
      (item) => item.createdAt,
    );

    expect(groups.map(({ day, items }) => [day, items.map(({ seq }) => seq)])).toEqual([
      ["2026-10-16", [1, 2]],
      ["2026-10-17", [3, 4]],
    ]);
  });
});

describe("editing and deleting", () => {
  const sentAt = Date.parse("2026-10-17T09:00:00.000Z");
  const mine = message(1, { senderId: ME });

  it("is the author's, within 15 minutes", () => {
    expect(canEditMessage(mine, ME, sentAt + EDIT_WINDOW_MS)).toBe(true);
    expect(canEditMessage(mine, ME, sentAt + EDIT_WINDOW_MS + 1)).toBe(false);
    expect(canDeleteMessage(mine, ME, sentAt + 60_000)).toBe(true);
    expect(canDeleteMessage(mine, ME, sentAt + EDIT_WINDOW_MS + 1)).toBe(false);
  });

  it("is never another participant's, nor on a deleted message", () => {
    expect(canEditMessage(message(1), ME, sentAt)).toBe(false);
    expect(canDeleteMessage(message(1), ME, sentAt)).toBe(false);
    expect(canEditMessage({ ...mine, body: null, deleted: true }, ME, sentAt)).toBe(false);
    expect(canDeleteMessage({ ...mine, deleted: true }, ME, sentAt)).toBe(false);
  });
});

describe("read receipts", () => {
  it("says read once another participant's position reached the message", () => {
    const mine = message(4, { senderId: ME });
    expect(readReceipt(mine, conversation(), ME, new Map([[OTHER, 3]]))).toEqual({ state: "sent" });
    expect(readReceipt(mine, conversation(), ME, new Map([[OTHER, 4]]))).toEqual({ readers: 1, state: "read" });
  });
});

describe("links in a message", () => {
  it("finds http(s) links, without the punctuation that follows them", () => {
    expect(tokenizeMessageText("Voir https://healix.dz/doc?id=1, puis (https://exemple.org/a_(b)).")).toEqual([
      { type: "text", value: "Voir " },
      { href: "https://healix.dz/doc?id=1", type: "link", value: "https://healix.dz/doc?id=1" },
      { type: "text", value: ", puis (" },
      { href: "https://exemple.org/a_(b)", type: "link", value: "https://exemple.org/a_(b)" },
      { type: "text", value: ")." },
    ]);
  });

  it("leaves anything else as text, javascript: and HTML included", () => {
    expect(tokenizeMessageText("javascript:alert(1) <b>gras</b>")).toEqual([
      { type: "text", value: "javascript:alert(1) <b>gras</b>" },
    ]);
  });
});

describe("the composer", () => {
  it("is closed to the recipient of a request until they accept", () => {
    expect(composerAvailability(conversation({ me: { lastReadSeq: 0, mutedUntil: null, role: "MEMBER", status: "PENDING" } }), ME, new Set())).toEqual({
      canWrite: false,
      reason: "requestReceived",
    });
  });

  it("lets a request carry one message, then waits for the answer", () => {
    const request = (lastSeq: number) =>
      conversation({ lastSeq }, [participant(ME), participant(OTHER, { status: "PENDING" })]);
    expect(composerAvailability(request(0), ME, new Set())).toEqual({ canWrite: true, notice: "firstMessageOnly" });
    expect(composerAvailability(request(1), ME, new Set())).toEqual({ canWrite: false, reason: "awaitingReply" });
  });

  it("is closed when the other side left, and for a blocked contact", () => {
    const left = conversation({}, [participant(ME), participant(OTHER, { status: "LEFT" })]);
    expect(composerAvailability(left, ME, new Set())).toEqual({ canWrite: false, reason: "closed" });
    expect(composerAvailability(conversation(), ME, new Set([OTHER]))).toEqual({ canWrite: false, reason: "blockedByMe" });
    expect(composerAvailability(conversation(), ME, new Set())).toEqual({ canWrite: true, notice: null });
  });

  it("is open in a case discussion or a group, even alone in it", () => {
    const alone = [participant(ME)];
    expect(composerAvailability(conversation({ type: "CASE" }, alone), ME, new Set())).toEqual({ canWrite: true, notice: null });
    expect(composerAvailability(conversation({ type: "GROUP" }, alone), ME, new Set())).toEqual({ canWrite: true, notice: null });
  });

  it("counts characters as the user sees them, shows the counter beyond 3,500, refuses beyond 4,000", () => {
    expect(messageLength("  🩺 ok  ")).toBe(4);
    expect(canSubmitMessage("   \n  ")).toBe(false);
    expect(showsLengthCounter("x".repeat(3_500))).toBe(false);
    expect(showsLengthCounter("x".repeat(3_501))).toBe(true);
    expect(canSubmitMessage("x".repeat(4_000))).toBe(true);
    expect(canSubmitMessage("x".repeat(4_001))).toBe(false);
  });

  it("sends with Enter, breaks the line with Shift+Enter, never during an IME composition", () => {
    expect(isSendShortcut({ key: "Enter", shiftKey: false })).toBe(true);
    expect(isSendShortcut({ key: "Enter", shiftKey: true })).toBe(false);
    expect(isSendShortcut({ isComposing: true, key: "Enter", shiftKey: false })).toBe(false);
    expect(isSendShortcut({ key: "a", shiftKey: false })).toBe(false);
  });
});

describe("marking read", () => {
  const ready = {
    documentVisible: true,
    lastCallAt: 0,
    lastMessageVisible: true,
    lastReadSeq: 3,
    now: 10_000,
    targetSeq: 5,
    windowFocused: true,
  };

  it("happens only when the last message is visible and the window active", () => {
    expect(shouldMarkRead(ready)).toBe(true);
    expect(shouldMarkRead({ ...ready, documentVisible: false })).toBe(false);
    expect(shouldMarkRead({ ...ready, windowFocused: false })).toBe(false);
    expect(shouldMarkRead({ ...ready, lastMessageVisible: false })).toBe(false);
  });

  it("happens at most once per second, and only forward", () => {
    expect(shouldMarkRead({ ...ready, lastCallAt: 9_500 })).toBe(false);
    expect(shouldMarkRead({ ...ready, lastCallAt: 9_000 })).toBe(true);
    expect(shouldMarkRead({ ...ready, targetSeq: 3 })).toBe(false);
  });
});

describe("the list", () => {
  it("shows 99+ beyond 99 unread messages, nothing at 0", () => {
    expect([0, -1, 1, 99, 100, 2_500].map(unreadBadgeText)).toEqual([null, null, "1", "99", "99+", "99+"]);
  });

  it("asks the server for active, pending or archived conversations, and the active case discussions", () => {
    expect(
      ["all", "unread", "cases", "requests", "archived"].map((filter) => listParamsOfFilter(filter as never)),
    ).toEqual([
      { status: "active" },
      { status: "active" },
      { status: "active", type: "CASE" },
      { status: "pending" },
      { status: "archived" },
    ]);
  });
});

describe("a new DIRECT conversation", () => {
  it("reopens the known conversation with that professional, without creating one", async () => {
    const create = jest.fn();
    await expect(
      openDirectConversation({ create, knownConversations: [conversation({ id: "c-known" })], userId: OTHER }),
    ).resolves.toBe("c-known");
    expect(create).not.toHaveBeenCalled();
  });

  it("opens the conversation the server returns, which is the existing one of the pair if any", async () => {
    const create = jest.fn().mockResolvedValue({ conversation: conversation({ id: "c-existing" }), created: false });
    await expect(openDirectConversation({ create, knownConversations: [], userId: OTHER })).resolves.toBe("c-existing");
    expect(create).toHaveBeenCalledWith(OTHER);
  });
});

describe("muting", () => {
  it("lasts 1 h, 8 h, 24 h or indefinitely", () => {
    const now = Date.parse("2026-10-17T09:00:00.000Z");
    expect(mutedUntilFor("8h", now)).toBe("2026-10-17T17:00:00.000Z");
    expect(mutedUntilFor("forever", now)).toBe(MUTED_FOREVER);
    expect(isMuted(conversation({ me: { lastReadSeq: 0, mutedUntil: "2026-10-17T10:00:00.000Z", role: "MEMBER", status: "ACTIVE" } }), now)).toBe(true);
    expect(isMuted(conversation(), now)).toBe(false);
  });
});

describe("case discussions", () => {
  const caseConversation = { type: "CASE" as const };
  const patient = {
    birthDate: "1980-05-01T00:00:00.000Z",
    firstName: "Amina",
    firstNameAr: "أمينة",
    id: "p-1",
    lastName: "Benali",
    lastNameAr: "بن علي",
  };

  it("names the patient in the interface's script", () => {
    expect(patientNameOf(patient, "fr")).toBe("BENALI Amina");
    expect(patientNameOf(patient, "ar")).toBe("بن علي أمينة");
  });

  it("counts the age in whole years, birthday included", () => {
    expect(ageOf(patient.birthDate, new Date("2026-04-30T12:00:00Z"))).toBe(45);
    expect(ageOf(patient.birthDate, new Date("2026-05-01T00:00:00Z"))).toBe(46);
  });

  it("offers to file a message of a case discussion only, once, with something to file", () => {
    expect(canFileToRecord(message(1), caseConversation)).toBe(true);
    expect(canFileToRecord(message(1), { type: "GROUP" })).toBe(false);
    expect(canFileToRecord(message(1, { deleted: true }), caseConversation)).toBe(false);
    expect(canFileToRecord(message(1, { filedToRecord: true }), caseConversation)).toBe(false);
    expect(canFileToRecord(message(1, { body: null, bodyUnavailable: true }), caseConversation)).toBe(false);
    const filesOnly = message(1, {
      attachments: [{ fromRecord: false, id: "a-1", mimeType: "application/pdf", originalName: "ECG.pdf", sizeBytes: 1 }],
      body: null,
      kind: "ATTACHMENT",
    });
    expect(canFileToRecord(filesOnly, caseConversation)).toBe(true);
  });

  it("shows exactly what will be filed: the text, then one line per file", () => {
    const filed = message(1, {
      attachments: [{ fromRecord: true, id: "a-1", mimeType: "application/pdf", originalName: "Bilan.pdf", sizeBytes: 1 }],
      body: "Avis : pas de contre-indication.",
    });
    expect(filedContentOf(filed, "Pièce jointe")).toBe("Avis : pas de contre-indication.\n[Pièce jointe : Bilan.pdf]");
  });
});

describe("urgent messages with acknowledgement", () => {
  const urgent = (overrides: Partial<MessageView> = {}) =>
    message(1, { priority: "URGENT", requiresAck: true, senderId: ME, ...overrides });

  it("says how many recipients are still expected", () => {
    expect(ackStateOf(urgent({ pendingAck: [{ fullName: "Dr B", userId: "b" }, { fullName: "Dr C", userId: "c" }] }))).toEqual({
      count: 2,
      kind: "pending",
      names: [],
    });
  });

  it("says who acknowledged it, and when the last one did", () => {
    expect(
      ackStateOf(
        urgent({
          acks: [
            { ackedAt: "2026-10-17T11:30:00.000Z", fullName: "Dr B", userId: "b" },
            { ackedAt: "2026-10-17T11:41:00.000Z", fullName: "Dr C", userId: "c" },
          ],
        }),
      ),
    ).toEqual({ kind: "acked", lastAckedAt: "2026-10-17T11:41:00.000Z", names: ["Dr B", "Dr C"] });
    expect(ackStateOf(message(1))).toEqual({ kind: "none" });
    expect(ackStateOf(urgent({ deleted: true }))).toEqual({ kind: "none" });
  });

  it("asks the recipients only, until they acknowledge", () => {
    expect(canAck(urgent({ senderId: OTHER }), ME)).toBe(true);
    expect(canAck(urgent({ senderId: OTHER, ackedByMe: true }), ME)).toBe(false);
    expect(canAck(urgent(), ME)).toBe(false);
    expect(canAck(message(1), ME)).toBe(false);
  });
});

describe("attachments in the composer", () => {
  const file = (name: string, size: number, type: string) => ({ name, size, type });

  it("accepts PDF, PNG and JPEG of 10 MB at most, 5 per message", () => {
    expect(attachmentProblemOf(file("ECG.pdf", 1_000, "application/pdf"), 0)).toBeNull();
    expect(attachmentProblemOf(file("IRM.jpeg", 1_000, "image/jpeg"), 4)).toBeNull();
    // No type from the browser: the extension decides here, the server on the content.
    expect(attachmentProblemOf(file("scan.png", 1_000, ""), 0)).toBeNull();
    expect(attachmentProblemOf(file("big.pdf", 10 * 1024 * 1024 + 1, "application/pdf"), 0)).toBe("tooLarge");
    expect(attachmentProblemOf(file("setup.exe", 1_000, "application/x-msdownload"), 0)).toBe("type");
    expect(attachmentProblemOf(file("page.svg", 1_000, "image/svg+xml"), 0)).toBe("type");
    expect(attachmentProblemOf(file("ECG.pdf", 1_000, "application/pdf"), 5)).toBe("tooMany");
  });

  it("sends text, files, or both; never while a file is still uploading or failed", () => {
    expect(canSendWith("Bonjour", [])).toBe(true);
    expect(canSendWith("", [{ status: "ready" }])).toBe(true);
    expect(canSendWith("", [])).toBe(false);
    expect(canSendWith("Voir pièce", [{ status: "uploading" }])).toBe(false);
    expect(canSendWith("Voir pièce", [{ status: "failed" }])).toBe(false);
    expect(canSendWith("x".repeat(4_001), [{ status: "ready" }])).toBe(false);
  });
});
