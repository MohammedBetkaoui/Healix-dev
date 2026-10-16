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
