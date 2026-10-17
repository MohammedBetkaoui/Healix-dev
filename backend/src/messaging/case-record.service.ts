import { Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalNoteSource, ConversationType, Prisma } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { sanitizeTextInput } from '../common/utils/sanitize';
import {
  type ClinicalNoteView,
  toClinicalNoteView,
} from '../patients/clinical-note-view';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ConversationWithParticipants,
  ConversationsService,
} from './conversations.service';
import { MessageCrypto } from './message-crypto';
import { MessagingEvents } from './messaging-events';
import { messageDetailsInclude, readBody } from './message-views';
import {
  caseOnly,
  invalidComment,
  messageDeleted,
  messageNotFound,
  messageUnavailable,
} from './messaging-errors';
import {
  CLINICAL_NOTE_COMMENT_MAX_LENGTH,
  filedContentOf,
  viewDayOf,
} from './messaging-rules';

// Shown as the author of a message without sender (a system message).
const SYSTEM_AUTHOR = 'HealixDz';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

// What a case discussion writes into the patient record: the trace of who
// read it (MESSAGES_VIEWED, once a day per user and conversation), and the
// opinions filed to the record ("verser au dossier").
@Injectable()
export class CaseRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly crypto: MessageCrypto,
    private readonly events: MessagingEvents,
    private readonly patientAudit: PatientAuditService,
  ) {}

  // The first reading of the day writes MESSAGES_VIEWED to the patient's
  // trail; the unique (conversation, user, day) row decides which call does,
  // even when several arrive at once.
  async recordView(
    actor: AuthenticatedUserPayload,
    conversation: Pick<
      ConversationWithParticipants,
      'id' | 'patientId' | 'type'
    >,
    now: Date = new Date(),
  ): Promise<void> {
    if (
      conversation.type !== ConversationType.CASE ||
      !conversation.patientId
    ) {
      return;
    }

    const day = viewDayOf(now);
    const { count } = await this.prisma.caseConversationView.createMany({
      data: [{ conversationId: conversation.id, day, userId: actor.sub }],
      skipDuplicates: true,
    });
    if (count === 0) return;

    try {
      await this.patientAudit.log(actor, 'MESSAGES_VIEWED', conversation.id, {
        patientId: conversation.patientId,
      });
    } catch (error) {
      // Not traced: the next reading tries again.
      await this.prisma.caseConversationView.deleteMany({
        where: { conversationId: conversation.id, day, userId: actor.sub },
      });
      throw error;
    }
  }

  // Copies a message of a case discussion into the patient record, with its
  // author, its date and the filer's comment. A message is filed once: again,
  // the same note (created: false).
  async fileToRecord(
    actor: AuthenticatedUserPayload,
    messageId: string,
    rawComment: string | undefined,
  ): Promise<{ note: ClinicalNoteView; created: boolean }> {
    const message = await this.prisma.message.findUnique({
      include: {
        ...messageDetailsInclude,
        sender: { select: { fullName: true } },
      },
      where: { id: messageId },
    });
    if (!message) throw messageNotFound();

    const { conversation } = await this.conversations
      .getParticipation(actor, message.conversationId)
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) throw messageNotFound();
        throw error;
      });

    if (
      conversation.type !== ConversationType.CASE ||
      !conversation.patientId
    ) {
      throw caseOnly();
    }
    if (message.deletedAt !== null) throw messageDeleted();

    const body = readBody(this.crypto, message);
    if (body.unavailable) throw messageUnavailable();
    const content = filedContentOf(
      body.text,
      message.attachments.map(({ originalName }) => originalName),
    );
    if (!content) throw messageUnavailable();

    const comment = this.readComment(rawComment);
    const patientId = conversation.patientId;
    const existing = await this.findFiled(patientId, message.id);
    if (existing) return { created: false, note: existing };

    let note: ClinicalNoteView;
    try {
      note = toClinicalNoteView(
        await this.prisma.patientClinicalNote.create({
          data: {
            authorId: actor.sub,
            comment,
            content,
            originalAuthorName: message.sender?.fullName ?? SYSTEM_AUTHOR,
            originalSentAt: message.createdAt,
            patientId,
            source: ClinicalNoteSource.MESSAGING,
            sourceConversationId: conversation.id,
            sourceMessageId: message.id,
          },
          include: { author: { select: { fullName: true } } },
        }),
      );
    } catch (error) {
      // Filed at the same moment by another participant.
      const raced = isUniqueViolation(error)
        ? await this.findFiled(patientId, message.id)
        : null;
      if (!raced) throw error;
      return { created: false, note: raced };
    }

    await this.patientAudit.log(actor, 'CASE_NOTE_FILED', note.id, {
      conversationId: conversation.id,
      messageId: message.id,
      patientId,
    });
    // The message now shows "Versé au dossier".
    await this.events.messageUpdated(conversation.id, message.id);

    return { created: true, note };
  }

  private async findFiled(
    patientId: string,
    messageId: string,
  ): Promise<ClinicalNoteView | null> {
    const note = await this.prisma.patientClinicalNote.findUnique({
      include: { author: { select: { fullName: true } } },
      where: {
        patientId_sourceMessageId: { patientId, sourceMessageId: messageId },
      },
    });
    return note ? toClinicalNoteView(note) : null;
  }

  private readComment(value: string | undefined): string | null {
    const comment = sanitizeTextInput(value ?? '');
    if (Array.from(comment).length > CLINICAL_NOTE_COMMENT_MAX_LENGTH) {
      throw invalidComment();
    }
    return comment || null;
  }
}
