"use client";

import { useState } from "react";
import { FileHeart, MessagesSquare, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { type Locale } from "@/i18n";
import { caseMessagingCopy } from "@/features/messaging/case-messaging.copy";
import { messagingErrorText } from "@/features/messaging/messaging-error-text";
import { messagingCopy } from "@/features/messaging/messaging.copy";
import { formatDateTime } from "@/features/messaging/messaging-format";
import { useOpenCaseConversation } from "@/features/messaging/messaging.mutations";
import { usePatientClinicalNotes } from "@/features/patients/hooks/use-patient-clinical-notes";

type AccountType = "DOCTOR" | "ESTABLISHMENT";

const messagesPath = (accountType: AccountType) =>
  accountType === "ESTABLISHMENT" ? "/establishment/messages" : "/doctor/messages";

// "Discuter du cas": opens the patient's discussion (created on the first
// call, the caller added to it afterwards), then goes to Messages. A refusal
// is shown under the record's actions.
export function DiscussCaseButton({
  accountType,
  className,
  locale,
  patientId,
}: {
  accountType: AccountType;
  patientId: string;
  locale: Locale;
  className?: string;
}) {
  const router = useRouter();
  const open = useOpenCaseConversation();
  const copy = caseMessagingCopy[locale];
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        title={copy.record.discussCaseHint}
        disabled={open.isPending}
        aria-busy={open.isPending}
        onClick={() => {
          setError(null);
          open.mutateAsync(patientId).then(
            ({ conversation }) =>
              router.push(`${messagesPath(accountType)}?c=${encodeURIComponent(conversation.id)}`),
            (reason: unknown) => setError(messagingErrorText(reason, messagingCopy[locale], copy.errors)),
          );
        }}
      >
        <MessagesSquare className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
        {copy.record.discussCase}
      </button>
      {error ? (
        <p role="alert" className="basis-full text-xs font-medium text-[var(--danger-ink)]">{error}</p>
      ) : null}
    </>
  );
}

// The "Notes" tab of the record: the opinions filed from the case
// discussion, as written, with who filed them and a link to the message.
export function PatientClinicalNotes({
  accountType,
  locale,
  patientId,
}: {
  accountType: AccountType;
  patientId: string;
  locale: Locale;
}) {
  const notes = usePatientClinicalNotes(patientId);
  const copy = caseMessagingCopy[locale];

  return (
    <section className="surface-section p-5 sm:p-6" aria-labelledby="patient-clinical-notes">
      <div className="flex items-center gap-3">
        <FileHeart className="h-5 w-5 text-[var(--medical)]" strokeWidth={1.7} aria-hidden="true" />
        <h2 id="patient-clinical-notes" className="text-lg font-semibold text-[var(--ink)]">{copy.record.notesTitle}</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">{copy.record.notesIntro}</p>

      {notes.isPending ? (
        <p className="mt-5 text-sm text-[var(--ink-faint)]">…</p>
      ) : notes.isError ? (
        <div role="alert" className="mt-5 flex items-center gap-3 text-sm text-[var(--danger-ink)]">
          {copy.record.notesError}
          <button type="button" className="clinical-button min-h-9 px-3 text-xs" onClick={() => void notes.refetch()}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            {messagingCopy[locale].list.retry}
          </button>
        </div>
      ) : notes.data.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--ink-faint)]">{copy.record.notesEmpty}</p>
      ) : (
        <ol className="mt-5 space-y-4">
          {notes.data.map((note) => (
            <li key={note.id}>
              <article className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-4">
                <p className="text-xs font-semibold text-[var(--ink)]">
                  {copy.record.opinionBy(note.originalAuthorName, formatDateTime(note.originalSentAt, locale))}
                </p>
                <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)] [overflow-wrap:anywhere]">{note.content}</p>
                {note.comment ? (
                  <p className="mt-3 border-s-2 border-[var(--accent-line)] ps-3 text-xs text-[var(--ink-soft)]">
                    <span className="font-semibold">{copy.record.comment} : </span>
                    <span dir="auto">{note.comment}</span>
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.68rem] text-[var(--ink-faint)]">
                  <span>{copy.record.filedBy(note.authorName, formatDateTime(note.createdAt, locale))}</span>
                  {note.sourceConversationId ? (
                    <Link
                      href={`${messagesPath(accountType)}?c=${encodeURIComponent(note.sourceConversationId)}`}
                      className="clinical-link text-[0.7rem]"
                    >
                      <MessagesSquare className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                      {copy.record.openMessage}
                    </Link>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
