// Mirrors backend/src/messaging/message-views.ts (MessageView) and
// messages.service.ts (MessagePage).

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
  priority: "NORMAL" | "URGENT";
  requiresAck: boolean;
  replyToId: string | null;
  editedAt: string | null;
  createdAt: string;
};

export type MessagePage = {
  items: MessageView[];
  // More messages in the direction asked (newer ones for afterSeq).
  hasMore: boolean;
};
