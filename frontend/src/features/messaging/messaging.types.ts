// Mirrors the responses of backend/src/messaging (conversations.service.ts,
// message-views.ts, messages.service.ts, directory.service.ts).

export type ConversationType = "DIRECT" | "GROUP";
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
    mutedUntil: string | null;
  };
  unreadCount: number;
  lastMessage: LastMessage | null;
  // A DIRECT conversation names both sides; a group its current members.
  participants: ConversationParticipant[];
};

export type ConversationPage = {
  items: Conversation[];
  nextCursor: string | null;
};

// The filters of the list: "unread" is the active list, read client-side.
export type ConversationFilter = "all" | "unread" | "requests" | "archived";
export type ConversationStatusParam = "active" | "pending" | "archived";

export type MessageView = {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  // The caller's own id for the message; null for the others' messages.
  clientMessageId: string | null;
  kind: "TEXT" | "SYSTEM" | "ATTACHMENT";
  // null once deleted, or when it cannot be decrypted (bodyUnavailable).
  body: string | null;
  deleted: boolean;
  bodyUnavailable: boolean;
  priority: MessagePriority;
  requiresAck: boolean;
  replyToId: string | null;
  editedAt: string | null;
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
  body: string;
  priority?: MessagePriority;
  replyToId?: string;
};

export type DirectorySearch = {
  search?: string;
  speciality?: string;
  wilaya?: string;
};
