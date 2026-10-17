import { randomBytes } from 'node:crypto';

import { type HttpException } from '@nestjs/common';
import { ConversationType } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { type PatientAuditService } from '../patients/patient-audit.service';
import { type PrismaService } from '../prisma/prisma.service';
import { CaseRecordService } from './case-record.service';
import { type ConversationsService } from './conversations.service';
import { MessageCrypto } from './message-crypto';
import { type MessagingEvents } from './messaging-events';

const ME = 'user-me';
const actor: AuthenticatedUserPayload = {
  email: 'me@healix.test',
  role: UserRole.AFFILIATED_DOCTOR,
  sub: ME,
  tokenType: 'access',
};
const caseConversation = {
  id: 'conversation-1',
  patientId: 'patient-1',
  type: ConversationType.CASE,
};

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code: string }).code;

function setup() {
  const crypto = MessageCrypto.fromEnv(
    `k1:${randomBytes(32).toString('base64')}`,
  );
  const encrypted = crypto.encrypt(
    'Avis : pas de contre-indication à la chirurgie.',
    'conversation-1',
  );
  const message = (overrides: Record<string, unknown> = {}) => ({
    acks: [],
    attachments: [{ originalName: 'ECG.pdf' }],
    bodyCiphertext: encrypted.ciphertext,
    clinicalNotes: [],
    conversationId: 'conversation-1',
    createdAt: new Date('2026-10-17T11:41:00Z'),
    deletedAt: null,
    id: 'message-1',
    keyId: encrypted.keyId,
    sender: { fullName: 'Dr Samir Kaci' },
    senderId: 'user-samir',
    ...overrides,
  });
  const note = (overrides: Record<string, unknown> = {}) => ({
    author: { fullName: 'Dr Me' },
    authorId: ME,
    comment: null,
    content: 'Avis',
    createdAt: new Date(),
    id: 'note-1',
    originalAuthorName: 'Dr Samir Kaci',
    originalSentAt: new Date('2026-10-17T11:41:00Z'),
    patientId: 'patient-1',
    source: 'MESSAGING',
    sourceConversationId: 'conversation-1',
    sourceMessageId: 'message-1',
    ...overrides,
  });
  const prisma = {
    caseConversationView: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: { findUnique: jest.fn().mockResolvedValue(message()) },
    patientClinicalNote: {
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(note(args.data)),
      ),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const conversations = {
    getParticipation: jest
      .fn()
      .mockResolvedValue({ conversation: caseConversation }),
  };
  const events = { messageUpdated: jest.fn().mockResolvedValue(undefined) };
  const patientAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new CaseRecordService(
    prisma as unknown as PrismaService,
    conversations as unknown as ConversationsService,
    crypto,
    events as unknown as MessagingEvents,
    patientAudit as unknown as PatientAuditService,
  );
  return {
    conversations,
    events,
    message,
    note,
    patientAudit,
    prisma,
    service,
  };
}

describe('CaseRecordService.recordView', () => {
  it('writes MESSAGES_VIEWED to the patient trail on the first reading of the day only', async () => {
    const { patientAudit, prisma, service } = setup();
    const now = new Date('2026-10-17T23:30:00Z');

    await service.recordView(actor, caseConversation, now);

    expect(prisma.caseConversationView.createMany).toHaveBeenCalledWith({
      // The day in Algiers: 23:30 UTC is already the 18th there.
      data: [
        {
          conversationId: 'conversation-1',
          day: new Date('2026-10-18T00:00:00.000Z'),
          userId: ME,
        },
      ],
      skipDuplicates: true,
    });
    expect(patientAudit.log).toHaveBeenCalledWith(
      actor,
      'MESSAGES_VIEWED',
      'conversation-1',
      { patientId: 'patient-1' },
    );

    // Read again the same day: the row exists, nothing more is written.
    patientAudit.log.mockClear();
    prisma.caseConversationView.createMany.mockResolvedValue({ count: 0 });
    await service.recordView(actor, caseConversation, now);
    expect(patientAudit.log).not.toHaveBeenCalled();
  });

  it('traces nothing for the other conversations', async () => {
    const { prisma, service } = setup();
    await service.recordView(actor, {
      ...caseConversation,
      type: ConversationType.GROUP,
    });
    expect(prisma.caseConversationView.createMany).not.toHaveBeenCalled();
  });

  it('lets the next reading try again when the trail could not be written', async () => {
    const { patientAudit, prisma, service } = setup();
    patientAudit.log.mockRejectedValue(new Error('database down'));

    await expect(service.recordView(actor, caseConversation)).rejects.toThrow(
      'database down',
    );
    expect(prisma.caseConversationView.deleteMany).toHaveBeenCalled();
  });
});

describe('CaseRecordService.fileToRecord', () => {
  it('copies the message to the record, with its author, its date and the comment, once', async () => {
    const { events, patientAudit, prisma, service } = setup();

    const { created, note } = await service.fileToRecord(
      actor,
      'message-1',
      '  À revoir   en consultation ',
    );

    expect(created).toBe(true);
    expect(prisma.patientClinicalNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          authorId: ME,
          comment: 'À revoir en consultation',
          content:
            'Avis : pas de contre-indication à la chirurgie.\n[Pièce jointe : ECG.pdf]',
          originalAuthorName: 'Dr Samir Kaci',
          originalSentAt: new Date('2026-10-17T11:41:00Z'),
          patientId: 'patient-1',
          source: 'MESSAGING',
          sourceConversationId: 'conversation-1',
          sourceMessageId: 'message-1',
        },
      }),
    );
    expect(note).toMatchObject({ authorName: 'Dr Me', patientId: 'patient-1' });
    expect(patientAudit.log).toHaveBeenCalledWith(
      actor,
      'CASE_NOTE_FILED',
      'note-1',
      {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        patientId: 'patient-1',
      },
    );
    expect(events.messageUpdated).toHaveBeenCalledWith(
      'conversation-1',
      'message-1',
    );
  });

  it('is idempotent: a message already filed gives its note back', async () => {
    const { note, patientAudit, prisma, service } = setup();
    prisma.patientClinicalNote.findUnique.mockResolvedValue(note());

    const result = await service.fileToRecord(actor, 'message-1', undefined);

    expect(result.created).toBe(false);
    expect(result.note.id).toBe('note-1');
    expect(prisma.patientClinicalNote.create).not.toHaveBeenCalled();
    expect(patientAudit.log).not.toHaveBeenCalled();
  });

  it('is refused outside a case discussion, and for a deleted message', async () => {
    const { conversations, message, prisma, service } = setup();
    conversations.getParticipation.mockResolvedValue({
      conversation: { ...caseConversation, type: ConversationType.GROUP },
    });
    expect(
      codeOf(
        await errorOf(service.fileToRecord(actor, 'message-1', undefined)),
      ),
    ).toBe('CASE_ONLY');

    conversations.getParticipation.mockResolvedValue({
      conversation: caseConversation,
    });
    prisma.message.findUnique.mockResolvedValue(
      message({ deletedAt: new Date() }),
    );
    expect(
      codeOf(
        await errorOf(service.fileToRecord(actor, 'message-1', undefined)),
      ),
    ).toBe('MESSAGE_DELETED');
    expect(prisma.patientClinicalNote.create).not.toHaveBeenCalled();
  });

  it('refuses a comment longer than 1,000 characters', async () => {
    const { service } = setup();
    const error = await errorOf(
      service.fileToRecord(actor, 'message-1', 'x'.repeat(1_001)),
    );
    expect(codeOf(error)).toBe('INVALID_COMMENT');
  });
});
