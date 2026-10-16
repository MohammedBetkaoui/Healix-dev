// The rules of the messaging that need no database: kept apart so that each
// one is tested on its own.

import { BadRequestException } from '@nestjs/common';

import { UserRole } from '../common/enums/user-role.enum';

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
