import { Logger } from '@nestjs/common';
import { type Message } from '@prisma/client';

import { MessageCrypto, MessageDecryptionError } from './message-crypto';
import { previewOf } from './messaging-rules';

const logger = new Logger('Messaging');

type StoredBody = Pick<
  Message,
  'bodyCiphertext' | 'conversationId' | 'id' | 'keyId'
>;

// The text of a stored body; null when there is none. A body that does not
// decrypt (altered data, missing key) is reported by id, never by content,
// and shown as unavailable rather than failing the whole page.
export function readBody(
  crypto: MessageCrypto,
  message: StoredBody,
): { text: string | null; unavailable: boolean } {
  if (!message.bodyCiphertext || !message.keyId) {
    return { text: null, unavailable: false };
  }

  try {
    return {
      text: crypto.decrypt(
        message.bodyCiphertext,
        message.keyId,
        message.conversationId,
      ),
      unavailable: false,
    };
  } catch (error) {
    if (!(error instanceof MessageDecryptionError)) {
      throw error;
    }
    logger.error(
      `Message ${message.id} could not be decrypted (key ${message.keyId}).`,
    );
    return { text: null, unavailable: true };
  }
}

export type LastMessageView = {
  id: string;
  seq: number;
  senderId: string | null;
  kind: Message['kind'];
  // One line of 120 characters at most; null once deleted.
  preview: string | null;
  deleted: boolean;
  createdAt: Date;
};

export function toLastMessageView(
  crypto: MessageCrypto,
  message: Message,
): LastMessageView {
  const deleted = message.deletedAt !== null;
  const body = deleted ? null : readBody(crypto, message).text;

  return {
    createdAt: message.createdAt,
    deleted,
    id: message.id,
    kind: message.kind,
    preview: body === null ? null : previewOf(body),
    senderId: message.senderId,
    seq: message.seq,
  };
}

export type MessageView = {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  // The sender's own id for the message, so that a client matches its
  // optimistic copy; null for the other participants.
  clientMessageId: string | null;
  kind: Message['kind'];
  // null once deleted (deleted: true) or when it cannot be decrypted
  // (bodyUnavailable: true).
  body: string | null;
  deleted: boolean;
  bodyUnavailable: boolean;
  priority: Message['priority'];
  requiresAck: boolean;
  replyToId: string | null;
  editedAt: Date | null;
  createdAt: Date;
};

// The text is decrypted only when the message is not deleted: a deleted
// message stays encrypted in the database, for the audit, and is never sent.
export function toMessageView(
  crypto: MessageCrypto,
  message: Message,
  viewerId: string,
  knownBody?: string,
): MessageView {
  const deleted = message.deletedAt !== null;
  const body = deleted
    ? { text: null, unavailable: false }
    : knownBody !== undefined
      ? { text: knownBody, unavailable: false }
      : readBody(crypto, message);

  return {
    body: body.text,
    bodyUnavailable: body.unavailable,
    clientMessageId:
      message.senderId === viewerId ? message.clientMessageId : null,
    conversationId: message.conversationId,
    createdAt: message.createdAt,
    deleted,
    editedAt: message.editedAt,
    id: message.id,
    kind: message.kind,
    priority: message.priority,
    replyToId: message.replyToId,
    requiresAck: message.requiresAck,
    senderId: message.senderId,
    seq: message.seq,
  };
}
