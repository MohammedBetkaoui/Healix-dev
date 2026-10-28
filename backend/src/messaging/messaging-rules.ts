// The rules of the messaging that need no database: kept apart so that each
// one is tested on its own.

import { BadRequestException } from '@nestjs/common';

import { UserRole } from '../common/enums/user-role.enum';
import { sanitizeOriginalFileName } from '../common/utils/file-name.util';
import { detectRealFileType } from '../common/utils/file-type.util';
import { sanitizeTextInput } from '../common/utils/sanitize';

// The professionals who use the messaging (the controllers' @Roles).
export const MESSAGING_ROLES = [
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.INDEPENDENT_DOCTOR,
  UserRole.AFFILIATED_DOCTOR,
] as const;

// conversation_participants.role. The OWNER of a GROUP manages its members.
export const PARTICIPANT_ROLE = {
  MEMBER: 'MEMBER',
  OWNER: 'OWNER',
} as const;

export const CONVERSATION_TITLE_MAX_LENGTH = 120;
export const CONVERSATION_PAGE_LIMIT_DEFAULT = 20;
export const CONVERSATION_PAGE_LIMIT_MAX = 50;
export const GROUP_MEMBERS_MAX = 100;
export const PREVIEW_MAX_LENGTH = 120;
export const MESSAGE_BODY_MAX_LENGTH = 4_000;
export const MESSAGE_PAGE_LIMIT_DEFAULT = 30;
export const MESSAGE_PAGE_LIMIT_MAX = 50;
export const EDIT_WINDOW_MS = 15 * 60_000;

// A DIRECT conversation is unique per pair, whoever started it.
export function directKeyFor(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join(':');
}

// The list is sorted by lastMessageAt then id, newest first; conversations
// without a message come last (MySQL sorts NULL last in descending order).
export type ConversationCursor = {
  id: string;
  lastMessageAt: Date | null;
};

export function encodeCursor(cursor: ConversationCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.lastMessageAt?.toISOString() ?? null, cursor.id]),
  ).toString('base64url');
}

export function decodeCursor(value: string): ConversationCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );

    if (Array.isArray(decoded) && decoded.length === 2) {
      const [lastMessageAt, id] = decoded as unknown[];
      const date =
        typeof lastMessageAt === 'string' ? new Date(lastMessageAt) : null;

      if (
        typeof id === 'string' &&
        id !== '' &&
        (lastMessageAt === null ||
          (date !== null && !Number.isNaN(date.getTime())))
      ) {
        return { id, lastMessageAt: date };
      }
    }
  } catch {
    // Reported below.
  }

  throw new BadRequestException({
    code: 'INVALID_CURSOR',
    message: 'Curseur de pagination invalide.',
  });
}

// One line of at most 120 characters, an ellipsis included when cut; never
// splits a character outside the Basic Multilingual Plane (emoji).
export function previewOf(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(line);

  return characters.length <= PREVIEW_MAX_LENGTH
    ? line
    : `${characters.slice(0, PREVIEW_MAX_LENGTH - 1).join('')}…`;
}

// Plain text: each line normalized by sanitizeTextInput (trimmed, inner
// whitespace collapsed), the line breaks kept (Shift+Enter in the composer),
// at most one empty line in a row.
export function sanitizeMessageBody(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .split(/\r\n|\r|\n/)
    .map(sanitizeTextInput)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// In characters as the user sees them: an emoji counts as one.
export function bodyLength(body: string): number {
  return Array.from(body).length;
}

export function isWithinEditWindow(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= EDIT_WINDOW_MS;
}

// The read position only moves forward, and never past the last message.
export function nextReadSeq(
  current: number,
  requested: number,
  lastSeq: number,
): number {
  return Math.max(current, Math.min(requested, lastSeq));
}

// --- Case discussions --------------------------------------------------------

export const MESSAGING_TIME_ZONE = 'Africa/Algiers';
export const CLINICAL_NOTE_COMMENT_MAX_LENGTH = 1_000;

// "Cas — BENALI Amina": the default title of a patient's discussion.
export function caseTitleFor(patient: {
  firstName: string;
  lastName: string;
}): string {
  const title = `Cas — ${patient.lastName.toLocaleUpperCase('fr')} ${patient.firstName}`;
  return Array.from(title).slice(0, CONVERSATION_TITLE_MAX_LENGTH).join('');
}

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: MESSAGING_TIME_ZONE,
  year: 'numeric',
});

// The day of an instant in Algiers (YYYY-MM-DD), as a DATE column takes it:
// MESSAGES_VIEWED is written once per such day.
export function viewDayOf(instant: Date): Date {
  return new Date(`${dayFormat.format(instant)}T00:00:00.000Z`);
}

// What a message files to the patient record: its text, then one line per
// attachment (the files themselves stay in the conversation).
export function filedContentOf(
  body: string | null,
  attachmentNames: string[],
): string {
  return [
    ...(body ? [body] : []),
    ...attachmentNames.map((name) => `[Pièce jointe : ${name}]`),
  ].join('\n');
}

// --- Attachments ---------------------------------------------------------------

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE_MAX = 5;
// An attachment never sent is deleted after this.
export const UNSENT_ATTACHMENT_TTL_MS = 24 * 60 * 60_000;

export type AttachmentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

export const ATTACHMENT_MIME_TYPES: readonly AttachmentMimeType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

// The type of a file read from its first bytes: neither its name nor the
// type the browser declared count. null for anything else (an executable
// named .png, an HTML page, an SVG...).
export function detectAttachmentType(
  content: Buffer,
): AttachmentMimeType | null {
  return detectRealFileType(content);
}

const EXTENSIONS: Record<AttachmentMimeType, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

// The name shown and downloaded: cleaned of path characters, and ending
// with the extension of the type found in the content ("scan.exe" holding a
// PDF becomes "scan.pdf").
export function attachmentNameOf(
  originalName: string,
  mimeType: AttachmentMimeType,
): string {
  const cleaned = sanitizeOriginalFileName(originalName);
  const allowed = EXTENSIONS[mimeType];
  // Letters and digits after the last dot only: "..-..-etc-passwd" has none.
  const found = /\.[A-Za-z0-9]{1,10}$/.exec(cleaned)?.[0] ?? '';

  if (allowed.includes(found.toLowerCase())) return cleaned;

  const stem = found ? cleaned.slice(0, -found.length) : cleaned;
  return `${stem || 'document'}${allowed[0]}`;
}

// --- Read receipts -------------------------------------------------------------

// Reciprocal, as in the consumer messaging apps: a participant's read
// position is shown to another only when both share their read receipts;
// always to the participant themselves. The unread count and the urgent
// acknowledgements (MessageAck) do not depend on it.
export function readPositionVisible(
  viewer: { userId: string; sharesReadReceipts: boolean },
  participant: { userId: string; sharesReadReceipts: boolean },
): boolean {
  return (
    viewer.userId === participant.userId ||
    (viewer.sharesReadReceipts && participant.sharesReadReceipts)
  );
}
