import { type PatientClinicalNote } from '@prisma/client';

export type ClinicalNoteView = {
  id: string;
  patientId: string;
  source: PatientClinicalNote['source'];
  // The opinion: its text, who wrote it and when.
  content: string;
  originalAuthorName: string;
  originalSentAt: Date;
  // Who filed it to the record, with their comment.
  authorId: string;
  authorName: string;
  comment: string | null;
  // The message it comes from (a link to the discussion).
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  createdAt: Date;
};

export function toClinicalNoteView(
  note: PatientClinicalNote & { author: { fullName: string } },
): ClinicalNoteView {
  return {
    authorId: note.authorId,
    authorName: note.author.fullName,
    comment: note.comment,
    content: note.content,
    createdAt: note.createdAt,
    id: note.id,
    originalAuthorName: note.originalAuthorName,
    originalSentAt: note.originalSentAt,
    patientId: note.patientId,
    source: note.source,
    sourceConversationId: note.sourceConversationId,
    sourceMessageId: note.sourceMessageId,
  };
}
