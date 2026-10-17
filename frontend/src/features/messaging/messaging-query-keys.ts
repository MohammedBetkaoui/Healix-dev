// TanStack Query keys of the messaging, shared by the queries of the
// Messages interface (lot 3) and the real-time invalidations (lot 2).
export const messagingKeys = {
  all: ["messaging"] as const,
  // Every list of conversations, whatever its filters.
  conversationLists: ["messaging", "conversations"] as const,
  conversation: (conversationId: string) =>
    ["messaging", "conversation", conversationId] as const,
  messages: (conversationId: string) =>
    ["messaging", "messages", conversationId] as const,
  unreadCount: ["messaging", "unread-count"] as const,
};
