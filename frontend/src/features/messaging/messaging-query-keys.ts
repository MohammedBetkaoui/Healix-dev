import { type ConversationFilter, type DirectorySearch } from "./messaging.types";

// TanStack Query keys of the messaging, shared by the queries of the
// Messages interface (lot 3) and the real-time invalidations (lot 2).
export const messagingKeys = {
  all: ["messaging"] as const,
  // Every list of conversations, whatever its filter.
  conversationLists: ["messaging", "conversations"] as const,
  conversationList: (filter: ConversationFilter) => ["messaging", "conversations", filter] as const,
  conversation: (conversationId: string) => ["messaging", "conversation", conversationId] as const,
  messages: (conversationId: string) => ["messaging", "messages", conversationId] as const,
  unreadCount: ["messaging", "unread-count"] as const,
  directory: (search: DirectorySearch) => ["messaging", "directory", search] as const,
  workspaceMembers: (search: string) => ["messaging", "workspace-members", search] as const,
  blocks: ["messaging", "blocks"] as const,
  settings: ["messaging", "settings"] as const,
  attachment: (attachmentId: string) => ["messaging", "attachment", attachmentId] as const,
  // Every message's readers: read again on read.updated.
  readersAll: ["messaging", "readers"] as const,
  readers: (messageId: string) => ["messaging", "readers", messageId] as const,
};
