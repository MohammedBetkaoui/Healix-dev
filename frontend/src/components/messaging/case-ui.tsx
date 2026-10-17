"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BellRing, BrainCircuit, CheckCheck, ClipboardList, FileHeart, FolderOpen, Hourglass } from "lucide-react";
import Link from "next/link";

import { type Locale } from "@/i18n";
import { type CaseMessagingCopy } from "@/features/messaging/case-messaging.copy";
import { formatDateTime, formatTime } from "@/features/messaging/messaging-format";
import { type AckState, ageOf, CLINICAL_NOTE_COMMENT_MAX_LENGTH, patientNameOf } from "@/features/messaging/messaging-rules";
import { type CasePatient } from "@/features/messaging/messaging.types";
import { cn } from "@/lib/utils";

// The pieces of a case discussion (messaging, lot 4).

// In place of "Évitez les données patient": here they belong, and every
// access is traced in the patient's record.
export function CaseNotice({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 border-b border-[var(--accent-line)] bg-[var(--medical-soft)] px-4 py-1.5 text-[.7rem] font-medium text-[var(--text-primary)]">
      <ClipboardList size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--medical)]" />
      {text}
    </p>
  );
}

// The patient of a case discussion, in the context panel: name (both
// scripts), age, links to the record and to its AI analyses.
export function CasePatientCard({
  copy,
  locale,
  patient,
  recordBasePath,
}: {
  patient: CasePatient;
  copy: CaseMessagingCopy;
  locale: Locale;
  // "/doctor" or "/establishment".
  recordBasePath: string;
}) {
  const recordHref = `${recordBasePath}/patients/${encodeURIComponent(patient.id)}`;
  const otherScript = patientNameOf(patient, locale === "ar" ? "fr" : "ar");
  const birthDate = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(patient.birthDate));

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--medical-soft)] p-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--medical)]">{copy.panel.patient}</h3>
      <p className="text-sm font-semibold text-[var(--text-primary)]"><bdi>{patientNameOf(patient, locale)}</bdi></p>
      <p className="text-xs text-[var(--text-secondary)]" lang={locale === "ar" ? "fr" : "ar"}><bdi>{otherScript}</bdi></p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {copy.panel.age(ageOf(patient.birthDate))} · {copy.panel.born(birthDate)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={recordHref} className="clinical-button min-h-9 px-3 text-xs">
          <FolderOpen size={14} strokeWidth={1.8} aria-hidden="true" />
          {copy.panel.openRecord}
        </Link>
        <Link href={`${recordHref}?tab=imaging`} className="clinical-button min-h-9 px-3 text-xs">
          <BrainCircuit size={14} strokeWidth={1.8} aria-hidden="true" />
          {copy.panel.openAnalyses}
        </Link>
      </div>
    </section>
  );
}

// Under an urgent message that asks for it: who acknowledged it and when,
// or how many are still expected (in words, not by colour alone), and the
// recipient's button.
export function AckStatus({
  busy,
  canAck,
  copy,
  locale,
  onAck,
  state,
}: {
  state: AckState;
  canAck: boolean;
  busy: boolean;
  onAck: () => void;
  copy: CaseMessagingCopy;
  locale: Locale;
}) {
  if (state.kind === "none" && !canAck) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[.7rem]">
      {state.kind === "acked" ? (
        <span className="inline-flex items-center gap-1 font-medium text-[var(--success-ink)]">
          <CheckCheck size={13} strokeWidth={2} aria-hidden="true" />
          {copy.message.ackedBy(state.names.join(", "), formatTime(state.lastAckedAt, locale))}
        </span>
      ) : state.kind === "pending" ? (
        <span className="inline-flex items-center gap-1 font-medium text-[var(--warning-ink)]"
          title={state.names.length > 0 ? copy.message.ackPendingNames(state.names.join(", ")) : undefined}>
          <Hourglass size={13} strokeWidth={2} aria-hidden="true" />
          {copy.message.ackPending(state.count)}
        </span>
      ) : null}
      {canAck ? (
        <button type="button" className="clinical-button min-h-8 border-[var(--danger-line)] px-2.5 text-xs font-semibold text-[var(--danger-ink)]"
          disabled={busy} aria-busy={busy} onClick={onAck}>
          <BellRing size={13} strokeWidth={1.9} aria-hidden="true" />
          {copy.message.ack}
        </button>
      ) : null}
    </div>
  );
}

// "Verser au dossier": shows exactly the text that will be copied, with its
// author and date, and takes an optional comment.
export function FileToRecordDialog({
  authorName,
  busy,
  content,
  copy,
  error,
  locale,
  onCancel,
  onConfirm,
  open,
  sentAt,
}: {
  open: boolean;
  content: string;
  authorName: string;
  sentAt: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
  copy: CaseMessagingCopy;
  locale: Locale;
}) {
  const ids = { comment: useId(), hint: useId(), intro: useId(), title: useId() };
  const [comment, setComment] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onCancel, open]);

  if (!open) return null;
  const tooLong = Array.from(comment.trim()).length > CLINICAL_NOTE_COMMENT_MAX_LENGTH;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]" role="presentation">
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
        <form role="dialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={ids.intro}
          className="surface-section surface-raised w-full max-w-lg p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooLong) onConfirm(comment.trim());
          }}>
          <h2 id={ids.title} className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <FileHeart size={18} strokeWidth={1.8} aria-hidden="true" className="text-[var(--medical)]" />
            {copy.fileDialog.title}
          </h2>
          <p id={ids.intro} className="clinical-caption mt-2">{copy.fileDialog.intro}</p>
          <figure className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <blockquote dir="auto" className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm text-[var(--text-primary)] [overflow-wrap:anywhere]">
              {content}
            </blockquote>
            <figcaption className="mt-2 text-xs text-[var(--text-secondary)]">
              {copy.fileDialog.author(authorName, formatDateTime(sentAt, locale))}
            </figcaption>
          </figure>
          <label htmlFor={ids.comment} className="mt-4 block text-xs font-medium text-[var(--text-primary)]">{copy.fileDialog.comment}</label>
          <textarea id={ids.comment} rows={3} value={comment} onChange={(event) => setComment(event.target.value)}
            aria-describedby={ids.hint} aria-invalid={tooLong || undefined} dir={comment.trim() ? "auto" : undefined}
            className={cn("mt-1 w-full rounded-[var(--radius-sm)] border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
              tooLong ? "border-[var(--danger-line)]" : "border-[var(--border)]")} />
          <p id={ids.hint} className={cn("mt-1 text-[.7rem]", tooLong ? "font-semibold text-[var(--danger-ink)]" : "text-[var(--text-secondary)]")}>
            {copy.fileDialog.commentHint}
          </p>
          {error ? <p role="alert" className="mt-3 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button ref={cancelRef} type="button" className="clinical-button" onClick={onCancel} disabled={busy}>{copy.fileDialog.cancel}</button>
            <button type="submit" className="clinical-button clinical-button-primary" disabled={busy || tooLong} aria-busy={busy}>
              {copy.fileDialog.confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
