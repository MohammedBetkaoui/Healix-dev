// Mirrors the responses of backend/src/messaging (conversations.service.ts,
// message-views.ts, messages.service.ts, directory.service.ts).

export type ConversationType = "DIRECT" | "GROUP" | "CASE";
export type ParticipantStatus = "PENDING" | "ACTIVE" | "LEFT" | "BLOCKED";
export type ParticipantRole = "OWNER" | "MEMBER";
export type MessagePriority = "NORMAL" | "URGENT";

export type ConversationParticipant = {
  userId: string;
  fullName: string;
  speciality: string | null;
  establishmentName: string | null;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinedAt: string;
  // How far they read, and when; null when they or I do not share read
  // receipts (always given for me).
  lastReadSeq: number | null;
  lastReadAt: string | null;
};

export type LastMessage = {
  id: string;
  seq: number;
  senderId: string | null;
  kind: "TEXT" | "SYSTEM" | "ATTACHMENT";
  // One line of 120 characters at most; null once deleted.
  preview: string | null;
  deleted: boolean;
  createdAt: string;
};

export type Conversation = {
  id: string;
  type: ConversationType;
  title: string | null;
  workspaceId: string | null;
  createdById: string;
  lastSeq: number;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  me: {
    role: ParticipantRole;
    status: ParticipantStatus;
    lastReadSeq: number;
    lastReadAt: string | null;
    mutedUntil: string | null;
  };
  unreadCount: number;
  lastMessage: LastMessage | null;
  // A DIRECT conversation names both sides; a group its current members.
  participants: ConversationParticipant[];
  // CASE: the patient discussed (in the caller's scope).
  patient: CasePatient | null;
};

export type CasePatient = {
  id: string;
  firstName: string;
  lastName: string;
  firstNameAr: string;
  lastNameAr: string;
  birthDate: string;
};

export type ConversationPage = {
  items: Conversation[];
  nextCursor: string | null;
};

// The filters of the list: "unread" is the active list, read client-side;
// "cases" the active case discussions.
export type ConversationFilter = "all" | "unread" | "cases" | "requests" | "archived";
export type ConversationStatusParam = "active" | "pending" | "archived";
export type ConversationListParams = { status: ConversationStatusParam; type?: ConversationType };

export type MessageView = {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  // The caller's own id for the message; null for the others' messages.
  clientMessageId: string | null;
  kind: "TEXT" | "SYSTEM" | "ATTACHMENT";
  // null once deleted, when it cannot be decrypted (bodyUnavailable), or
  // for files sent without text (ATTACHMENT).
  body: string | null;
  deleted: boolean;
  bodyUnavailable: boolean;
  priority: MessagePriority;
  requiresAck: boolean;
  replyToId: string | null;
  editedAt: string | null;
  createdAt: string;
  attachments: MessageAttachment[];
  // requiresAck: who acknowledged it, and the recipients still expected.
  acks: MessageAck[];
  ackedByMe: boolean;
  pendingAck: Recipient[];
  // CASE: copied to the patient record.
  filedToRecord: boolean;
};

export type MessageAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  // A document of the patient record, shared without copy.
  fromRecord: boolean;
};

export type MessageAck = { userId: string; fullName: string; ackedAt: string };

export type Recipient = { userId: string; fullName: string };

// POST /messaging/conversations/:id/attachments (and /from-record).
export type UploadedAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

// A note of the patient record, filed from a case discussion
// (backend/src/patients/clinical-note-view.ts).
export type ClinicalNote = {
  id: string;
  patientId: string;
  source: "MESSAGING";
  content: string;
  originalAuthorName: string;
  originalSentAt: string;
  authorId: string;
  authorName: string;
  comment: string | null;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
};

export type MessagePage = {
  items: MessageView[];
  // More messages in the direction asked: older for the latest page and
  // beforeSeq, newer for afterSeq.
  hasMore: boolean;
};

export type PeerProfile = {
  id: string;
  fullName: string;
  role: string;
  speciality: string | null;
  wilaya: string | null;
  establishmentName: string | null;
};

export type DirectoryEntry = PeerProfile & {
  // A DIRECT conversation opens at once; otherwise it starts as a request.
  sameWorkspace: boolean;
  blockedByMe: boolean;
};

export type BlockedUser = {
  userId: string;
  fullName: string;
  createdAt: string;
};

export type MessagingSettings = {
  discoverableByPeers: boolean;
  // Reciprocal: off, the others do not see when I read, nor I when they do.
  shareReadReceipts: boolean;
};

// GET /messaging/messages/:id/readers (the sender is not listed).
export type MessageReaders = {
  seen: { userId: string; fullName: string; seenAt: string | null }[];
  notSeen: { userId: string; fullName: string }[];
  // They, or I, do not share read receipts.
  notShared: { userId: string; fullName: string }[];
};

export type UnreadCount = {
  total: number;
  conversations: number;
};

export type ReadState = {
  conversationId: string;
  lastReadSeq: number;
  unreadCount: number;
};

export type ParticipationEnded = {
  id: string;
  status: "LEFT";
};

export type SendMessagePayload = {
  clientMessageId: string;
  // Empty with attachments only.
  body: string;
  priority?: MessagePriority;
  // With priority URGENT only.
  requiresAck?: boolean;
  replyToId?: string;
  attachmentIds?: string[];
};

export type DirectorySearch = {
  search?: string;
  speciality?: string;
  wilaya?: string;
};
