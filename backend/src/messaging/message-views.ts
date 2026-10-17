import { Logger } from '@nestjs/common';
import { type Message, type Prisma } from '@prisma/client';

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

// What a message view needs besides the message: its files, its
// acknowledgements, whether it was filed to the patient record.
export const messageDetailsInclude = {
  acks: {
    include: { user: { select: { fullName: true } } },
    orderBy: [{ ackedAt: 'asc' }, { id: 'asc' }],
  },
  attachments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      mimeType: true,
      originalName: true,
      patientDocumentId: true,
      sizeBytes: true,
    },
  },
  clinicalNotes: { select: { id: true } },
} satisfies Prisma.MessageInclude;

export type MessageWithDetails = Prisma.MessageGetPayload<{
  include: typeof messageDetailsInclude;
}>;

export type AttachmentView = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  // A document of the patient record, shared without copy (CASE).
  fromRecord: boolean;
};

export type AckView = { userId: string; fullName: string; ackedAt: Date };

// A participant of the conversation, for the acknowledgements still due.
export type RecipientView = { userId: string; fullName: string };

export type MessageView = {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  // The sender's own id for the message, so that a client matches its
  // optimistic copy; null for the other participants.
  clientMessageId: string | null;
  kind: Message['kind'];
  // null once deleted (deleted: true), when it cannot be decrypted
  // (bodyUnavailable: true), or for files sent without text (ATTACHMENT).
  body: string | null;
  deleted: boolean;
  bodyUnavailable: boolean;
  priority: Message['priority'];
  requiresAck: boolean;
  replyToId: string | null;
  editedAt: Date | null;
  createdAt: Date;
  attachments: AttachmentView[];
  // requiresAck: who acknowledged it, and the ACTIVE recipients who have not
  // yet. Empty otherwise.
  acks: AckView[];
  ackedByMe: boolean;
  pendingAck: RecipientView[];
  // CASE: copied to the patient record ("verser au dossier").
  filedToRecord: boolean;
};

export type MessageViewOptions = {
  // The text just written, not decrypted again.
  knownBody?: string;
  // The ACTIVE participants of the conversation: the recipients of an
  // acknowledgement are those of them other than the sender.
  participants?: RecipientView[];
};

// The text is decrypted only when the message is not deleted: a deleted
// message stays encrypted in the database, for the audit, and is never sent,
// nor are its files.
export function toMessageView(
  crypto: MessageCrypto,
  message: MessageWithDetails,
  viewerId: string,
  { knownBody, participants = [] }: MessageViewOptions = {},
): MessageView {
  const deleted = message.deletedAt !== null;
  const body = deleted
    ? { text: null, unavailable: false }
    : knownBody !== undefined
      ? { text: knownBody, unavailable: false }
      : readBody(crypto, message);
  const tracked = message.requiresAck && !deleted;
  const acks = tracked
    ? message.acks.map((ack) => ({
        ackedAt: ack.ackedAt,
        fullName: ack.user.fullName,
        userId: ack.userId,
      }))
    : [];
  const acked = new Set(acks.map(({ userId }) => userId));

  return {
    ackedByMe: acked.has(viewerId),
    acks,
    attachments: deleted
      ? []
      : message.attachments.map((attachment) => ({
          fromRecord: attachment.patientDocumentId !== null,
          id: attachment.id,
          mimeType: attachment.mimeType,
          originalName: attachment.originalName,
          sizeBytes: attachment.sizeBytes,
        })),
    body: body.text,
    bodyUnavailable: body.unavailable,
    clientMessageId:
      message.senderId === viewerId ? message.clientMessageId : null,
    conversationId: message.conversationId,
    createdAt: message.createdAt,
    deleted,
    editedAt: message.editedAt,
    filedToRecord: message.clinicalNotes.length > 0,
    id: message.id,
    kind: message.kind,
    pendingAck: tracked
      ? participants.filter(
          ({ userId }) => userId !== message.senderId && !acked.has(userId),
        )
      : [],
    priority: message.priority,
    replyToId: message.replyToId,
    requiresAck: message.requiresAck,
    senderId: message.senderId,
    seq: message.seq,
  };
}
