import { apiClient } from "@/lib/api/http-client";

import {
  type BlockedUser,
  type ClinicalNote,
  type Conversation,
  type ConversationPage,
  type ConversationStatusParam,
  type ConversationType,
  type DirectoryEntry,
  type DirectorySearch,
  type MessagePage,
  type MessageReaders,
  type MessageView,
  type MessagingSettings,
  type ParticipationEnded,
  type PeerProfile,
  type ReadState,
  type SendMessagePayload,
  type UnreadCount,
  type UploadedAttachment,
} from "./messaging.types";

// Every route of the messaging (backend/src/messaging, lots 1 and 4). The
// ids go into paths: encoded, never trusted as path segments.

export const CATCH_UP_PAGE_LIMIT = 50;
export const MESSAGE_PAGE_LIMIT = 30;
export const CONVERSATION_PAGE_LIMIT = 20;

const conversationPath = (conversationId: string) =>
  `/messaging/conversations/${encodeURIComponent(conversationId)}`;

// --- Conversations ------------------------------------------------------------

export async function listConversations(params: {
  cursor?: string;
  status: ConversationStatusParam;
  type?: ConversationType;
}): Promise<ConversationPage> {
  const response = await apiClient.get<ConversationPage>("/messaging/conversations", {
    params: { cursor: params.cursor, limit: CONVERSATION_PAGE_LIMIT, status: params.status, type: params.type },
  });
  return response.data;
}

// The discussion of a patient: 201 when created, 200 with the open one
// (the caller is added to it).
export async function openCaseConversation(
  patientId: string,
): Promise<{ conversation: Conversation; created: boolean }> {
  const response = await apiClient.post<Conversation>("/messaging/conversations", {
    patientId,
    type: "CASE",
  });
  return { conversation: response.data, created: response.status === 201 };
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  const response = await apiClient.get<Conversation>(conversationPath(conversationId));
  return response.data;
}

// 201 when created, 200 with the existing conversation of the pair.
export async function createDirectConversation(
  participantId: string,
): Promise<{ conversation: Conversation; created: boolean }> {
  const response = await apiClient.post<Conversation>("/messaging/conversations", {
    participantId,
    type: "DIRECT",
  });
  return { conversation: response.data, created: response.status === 201 };
}

export async function createGroupConversation(
  title: string,
  participantIds: string[],
): Promise<Conversation> {
  const response = await apiClient.post<Conversation>("/messaging/conversations", {
    participantIds,
    title,
    type: "GROUP",
  });
  return response.data;
}

export async function updateConversation(
  conversationId: string,
  changes: { title?: string; archived?: boolean; mutedUntil?: string | null },
): Promise<Conversation> {
  const response = await apiClient.patch<Conversation>(conversationPath(conversationId), changes);
  return response.data;
}

export async function addParticipants(conversationId: string, userIds: string[]): Promise<Conversation> {
  const response = await apiClient.post<Conversation>(`${conversationPath(conversationId)}/participants`, {
    userIds,
  });
  return response.data;
}

// The OWNER removes a member; with one's own id, one leaves the group.
export async function removeParticipant(
  conversationId: string,
  userId: string,
): Promise<Conversation | ParticipationEnded> {
  const response = await apiClient.delete<Conversation | ParticipationEnded>(
    `${conversationPath(conversationId)}/participants/${encodeURIComponent(userId)}`,
  );
  return response.data;
}

export async function acceptConversation(conversationId: string): Promise<Conversation> {
  const response = await apiClient.post<Conversation>(`${conversationPath(conversationId)}/accept`);
  return response.data;
}

export async function declineConversation(conversationId: string): Promise<ParticipationEnded> {
  const response = await apiClient.post<ParticipationEnded>(`${conversationPath(conversationId)}/decline`);
  return response.data;
}

// --- Messages -----------------------------------------------------------------

export async function listMessages(
  conversationId: string,
  params: { beforeSeq?: number; afterSeq?: number; limit?: number } = {},
): Promise<MessagePage> {
  const response = await apiClient.get<MessagePage>(`${conversationPath(conversationId)}/messages`, {
    params: { limit: MESSAGE_PAGE_LIMIT, ...params },
  });
  return response.data;
}

// The messages that followed afterSeq, oldest first (catching up after a
// reconnection or a return to the tab).
export function fetchMessagesAfter(conversationId: string, afterSeq: number): Promise<MessagePage> {
  return listMessages(conversationId, { afterSeq, limit: CATCH_UP_PAGE_LIMIT });
}

// 201 with a new message, 200 with the one this clientMessageId already sent.
export async function sendMessage(conversationId: string, payload: SendMessagePayload): Promise<MessageView> {
  const response = await apiClient.post<MessageView>(`${conversationPath(conversationId)}/messages`, payload);
  return response.data;
}

export async function editMessage(messageId: string, body: string): Promise<MessageView> {
  const response = await apiClient.patch<MessageView>(`/messaging/messages/${encodeURIComponent(messageId)}`, {
    body,
  });
  return response.data;
}

export async function deleteMessage(messageId: string): Promise<MessageView> {
  const response = await apiClient.delete<MessageView>(`/messaging/messages/${encodeURIComponent(messageId)}`);
  return response.data;
}

export async function markConversationRead(conversationId: string, seq: number): Promise<ReadState> {
  const response = await apiClient.post<ReadState>(`${conversationPath(conversationId)}/read`, { seq });
  return response.data;
}

export async function sendTyping(conversationId: string): Promise<void> {
  await apiClient.post(`${conversationPath(conversationId)}/typing`);
}

export async function getUnreadCount(): Promise<UnreadCount> {
  const response = await apiClient.get<UnreadCount>("/messaging/unread-count");
  return response.data;
}

// Who saw one of the conversation's messages, and when.
export async function getMessageReaders(messageId: string): Promise<MessageReaders> {
  const response = await apiClient.get<MessageReaders>(`/messaging/messages/${encodeURIComponent(messageId)}/readers`);
  return response.data;
}

// The acknowledgement of an urgent message; again, nothing changes.
export async function ackMessage(messageId: string): Promise<MessageView> {
  const response = await apiClient.post<MessageView>(`/messaging/messages/${encodeURIComponent(messageId)}/ack`);
  return response.data;
}

// CASE: the message copied to the patient record (once).
export async function fileMessageToRecord(messageId: string, comment?: string): Promise<ClinicalNote> {
  const response = await apiClient.post<ClinicalNote>(
    `/messaging/messages/${encodeURIComponent(messageId)}/file-to-record`,
    comment ? { comment } : {},
  );
  return response.data;
}

// --- Attachments ----------------------------------------------------------------

// Multipart, field "file"; onProgress gets 0 to 1.
export async function uploadAttachment(
  conversationId: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiClient.post<UploadedAttachment>(`${conversationPath(conversationId)}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.min(1, event.loaded / event.total));
    },
    signal,
  });
  return response.data;
}

// CASE: a document of the patient record, shared without copy.
export async function attachRecordDocument(
  conversationId: string,
  patientDocumentId: string,
): Promise<UploadedAttachment> {
  const response = await apiClient.post<UploadedAttachment>(
    `${conversationPath(conversationId)}/attachments/from-record`,
    { patientDocumentId },
  );
  return response.data;
}

// The file itself, never a public URL: images are shown from a blob: URL.
export async function downloadAttachment(attachmentId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/messaging/attachments/${encodeURIComponent(attachmentId)}`, {
    responseType: "blob",
  });
  return response.data;
}

// --- Directory, blocks, settings ----------------------------------------------

export async function searchDirectory(params: DirectorySearch): Promise<DirectoryEntry[]> {
  const response = await apiClient.get<DirectoryEntry[]>("/messaging/directory", {
    params: {
      search: params.search || undefined,
      speciality: params.speciality || undefined,
      wilaya: params.wilaya || undefined,
    },
  });
  return response.data;
}

export async function getWorkspaceMembers(search?: string): Promise<PeerProfile[]> {
  const response = await apiClient.get<PeerProfile[]>("/messaging/workspace-members", {
    params: { search: search || undefined },
  });
  return response.data;
}

export async function listBlocks(): Promise<BlockedUser[]> {
  const response = await apiClient.get<BlockedUser[]>("/messaging/blocks");
  return response.data;
}

export async function blockUser(userId: string): Promise<void> {
  await apiClient.post(`/messaging/blocks/${encodeURIComponent(userId)}`);
}

export async function unblockUser(userId: string): Promise<void> {
  await apiClient.delete(`/messaging/blocks/${encodeURIComponent(userId)}`);
}

export async function getMessagingSettings(): Promise<MessagingSettings> {
  const response = await apiClient.get<MessagingSettings>("/messaging/settings");
  return response.data;
}

export async function updateMessagingSettings(settings: Partial<MessagingSettings>): Promise<MessagingSettings> {
  const response = await apiClient.patch<MessagingSettings>("/messaging/settings", settings);
  return response.data;
}
