import { apiClient } from "@/lib/api/http-client";

import { type MessagePage } from "./messaging.types";

export const CATCH_UP_PAGE_LIMIT = 50;

// The messages that followed afterSeq, oldest first (catching up after a
// reconnection or a return to the tab).
export async function fetchMessagesAfter(
  conversationId: string,
  afterSeq: number,
): Promise<MessagePage> {
  const response = await apiClient.get<MessagePage>(
    `/messaging/conversations/${encodeURIComponent(conversationId)}/messages`,
    { params: { afterSeq, limit: CATCH_UP_PAGE_LIMIT } },
  );
  return response.data;
}
