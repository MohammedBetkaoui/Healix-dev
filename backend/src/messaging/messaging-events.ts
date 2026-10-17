import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationType,
  ParticipantStatus,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  type RealtimeEventName,
  type RealtimeEventPayloads,
} from '../realtime/realtime.types';

// A user's typing notifications for one conversation: at most one per 3 s.
export const TYPING_INTERVAL_MS = 3_000;
// Above this many entries, the expired ones are dropped.
const TYPING_ENTRIES_SWEEP = 10_000;

type RecipientOptions = {
  // typing: ACTIVE participants only (a pending request shows no typing).
  activeOnly?: boolean;
  // The author of the event, when sending it to them is pointless (typing).
  exclude?: string;
  // Users who were just removed from the conversation (left, removed,
  // declined): told once, so that their lists drop it.
  also?: string[];
};

// The real-time events of the messaging, sent once the write is committed,
// to the participants of the conversation read again from the database:
// ACTIVE ones, PENDING ones too (the recipient of a request), and for a group
// or a case discussion only those still ACTIVE members of its workspace (the
// patient's, for a case). The other sockets of the
// author receive them too (another tab, another device), except typing.
// Identifiers only, never a text. A failure is logged: it never undoes nor
// fails the write.
@Injectable()
export class MessagingEvents {
  private readonly logger = new Logger(MessagingEvents.name);
  private readonly lastTyping = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  conversationUpdated(conversationId: string, options?: RecipientOptions) {
    return this.notify(
      conversationId,
      'conversation.updated',
      { conversationId },
      options,
    );
  }

  // A change that concerns these users only (muting: the caller's own state,
  // for their other tabs and devices).
  conversationUpdatedFor(userIds: string[], conversationId: string): void {
    this.realtime.emitToUsers(userIds, 'conversation.updated', {
      conversationId,
    });
  }

  messageCreated(conversationId: string, seq: number) {
    return this.notify(conversationId, 'message.created', {
      conversationId,
      seq,
    });
  }

  messageUpdated(conversationId: string, messageId: string) {
    return this.notify(conversationId, 'message.updated', {
      conversationId,
      messageId,
    });
  }

  messageDeleted(conversationId: string, messageId: string) {
    return this.notify(conversationId, 'message.deleted', {
      conversationId,
      messageId,
    });
  }

  readUpdated(conversationId: string, userId: string, seq: number) {
    return this.notify(conversationId, 'read.updated', {
      conversationId,
      seq,
      userId,
    });
  }

  // Calls less than 3 s apart, for the same user and conversation, are
  // ignored. Returns whether the event was sent.
  async typing(
    conversationId: string,
    userId: string,
    now: number = Date.now(),
  ): Promise<boolean> {
    const key = `${userId}:${conversationId}`;
    const last = this.lastTyping.get(key);

    if (last !== undefined && now - last < TYPING_INTERVAL_MS) {
      return false;
    }

    this.lastTyping.set(key, now);
    this.sweepTyping(now);
    await this.notify(
      conversationId,
      'typing',
      { conversationId, userId },
      { activeOnly: true, exclude: userId },
    );
    return true;
  }

  private async notify<Event extends RealtimeEventName>(
    conversationId: string,
    event: Event,
    payload: RealtimeEventPayloads[Event],
    options: RecipientOptions = {},
  ): Promise<void> {
    try {
      const recipients = new Set([
        ...(await this.recipients(conversationId, options.activeOnly)),
        ...(options.also ?? []),
      ]);
      if (options.exclude) {
        recipients.delete(options.exclude);
      }
      this.realtime.emitToUsers(recipients, event, payload);
    } catch (error) {
      this.logger.error(
        `Real-time event ${event} of conversation ${conversationId} not sent: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async recipients(
    conversationId: string,
    activeOnly = false,
  ): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      select: { userId: true },
      where: {
        conversationId,
        OR: [
          {
            conversation: {
              type: {
                notIn: [ConversationType.GROUP, ConversationType.CASE],
              },
            },
          },
          {
            user: {
              workspaceMemberships: {
                some: {
                  status: WorkspaceMembershipStatus.ACTIVE,
                  workspace: {
                    conversations: { some: { id: conversationId } },
                  },
                },
              },
            },
          },
        ],
        status: {
          in: activeOnly
            ? [ParticipantStatus.ACTIVE]
            : [ParticipantStatus.ACTIVE, ParticipantStatus.PENDING],
        },
      },
    });
    return participants.map(({ userId }) => userId);
  }

  private sweepTyping(now: number): void {
    if (this.lastTyping.size <= TYPING_ENTRIES_SWEEP) {
      return;
    }
    for (const [key, at] of this.lastTyping) {
      if (now - at >= TYPING_INTERVAL_MS) {
        this.lastTyping.delete(key);
      }
    }
  }
}
