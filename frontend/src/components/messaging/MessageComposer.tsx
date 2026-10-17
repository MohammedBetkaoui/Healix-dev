"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, FolderOpen, Lock, Paperclip, Pencil, SendHorizontal, X } from "lucide-react";

import { type Locale } from "@/i18n";
import { caseMessagingCopy } from "@/features/messaging/case-messaging.copy";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import { formatNumber } from "@/features/messaging/messaging-format";
import {
  ATTACHMENT_ACCEPT,
  type AttachmentProblem,
  canSendWith,
  canSubmitMessage,
  type ComposerAvailability,
  isSendShortcut,
  MESSAGE_BODY_MAX_LENGTH,
  messageLength,
  showsLengthCounter,
  TYPING_SEND_INTERVAL_MS,
} from "@/features/messaging/messaging-rules";
import { type MessagePriority, type UploadedAttachment } from "@/features/messaging/messaging.types";
import { useDraftAttachments } from "@/features/messaging/use-draft-attachments";
import { cn } from "@/lib/utils";

import { DraftAttachmentList, RecordDocumentPicker } from "./attachments";
import styles from "./messaging.module.css";

const MAX_ROWS = 6;

type MessageComposerProps = {
  conversationId: string;
  availability: ComposerAvailability;
  copy: MessagingCopy;
  locale: Locale;
  replyTo: { authorName: string; text: string } | null;
  onCancelReply: () => void;
  editing: { messageId: string; body: string } | null;
  onCancelEdit: () => void;
  onSend: (
    body: string,
    priority: MessagePriority,
    options: { requiresAck: boolean; attachments: UploadedAttachment[] },
  ) => void;
  onSaveEdit: (messageId: string, body: string) => void;
  onTyping: () => void;
  // A case discussion: its documents can be attached from the record.
  patientId?: string | null;
  errorText?: (error: unknown) => string;
};

const noErrorText = () => "";

export function MessageComposer({
  availability,
  conversationId,
  copy,
  editing,
  locale,
  onCancelEdit,
  onCancelReply,
  onSaveEdit,
  onSend,
  onTyping,
  patientId = null,
  errorText = noErrorText,
  replyTo,
}: MessageComposerProps) {
  const ids = { ack: useId(), ackHint: useId(), counter: useId(), files: useId(), hint: useId(), input: useId() };
  const caseCopy = caseMessagingCopy[locale];
  const field = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const lastTypingAt = useRef(0);
  const [value, setValue] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [requiresAck, setRequiresAck] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<AttachmentProblem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const attachments = useDraftAttachments(conversationId, errorText);

  // An edit starts with the message's text in the field.
  if (editing && editing.messageId !== editingId) {
    setEditingId(editing.messageId);
    setValue(editing.body);
  } else if (!editing && editingId) {
    setEditingId(null);
    setValue("");
  }

  // Focus on opening a conversation, on replying and on editing.
  useEffect(() => {
    if (availability.canWrite) field.current?.focus();
  }, [availability.canWrite, conversationId, replyTo, editing]);

  // Grows with its text, up to 6 lines.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, lineHeight * MAX_ROWS + padding)}px`;
  }, [value]);

  if (!availability.canWrite) {
    return (
      <div className="border-t border-[var(--border)] px-4 py-3">
        <p role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
          <Lock size={14} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0" />
          {copy.composer.blocked[availability.reason]}
        </p>
      </div>
    );
  }

  const length = messageLength(value);
  const tooLong = length > MESSAGE_BODY_MAX_LENGTH;
  // A message carries text, files, or both; never while a file uploads.
  const canSubmit = editing ? canSubmitMessage(value) : canSendWith(value, attachments.drafts);

  const submit = () => {
    if (!canSubmit) return;
    if (editing) {
      onSaveEdit(editing.messageId, value.trim());
    } else {
      onSend(value.trim(), urgent ? "URGENT" : "NORMAL", {
        attachments: attachments.drafts.flatMap(({ uploaded }) => (uploaded ? [uploaded] : [])),
        requiresAck: urgent && requiresAck,
      });
      setValue("");
      setUrgent(false);
      setRequiresAck(false);
      setProblem(null);
      attachments.clear();
    }
  };

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    setProblem(attachments.addFiles(files));
  };

  return (
    <form
      className={cn(styles.composer, "relative")}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      // Files dropped on the composer are attached, as with "Joindre".
      onDragOver={(event) => {
        if (editing || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (editing) return;
        event.preventDefault();
        setDragging(false);
        addFiles([...event.dataTransfer.files]);
      }}
    >
      {dragging ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--medical)] bg-[var(--medical-soft)] px-4 text-center text-xs font-medium text-[var(--medical)]">
          {caseCopy.composer.dropHere}
        </div>
      ) : null}
      {replyTo && !editing ? (
        <div className="mb-2 flex items-start gap-2 rounded-[var(--radius-sm)] border-s-2 border-[var(--medical)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--text-primary)]">{copy.composer.replyTo(replyTo.authorName)}</p>
            <p dir="auto" className="truncate text-[var(--text-secondary)]">{replyTo.text}</p>
          </div>
          <button type="button" className="clinical-icon-button h-7 min-w-7" onClick={onCancelReply} aria-label={copy.composer.cancelReply}>
            <X size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {editing ? (
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--medical)]">
          <Pencil size={13} strokeWidth={1.8} aria-hidden="true" />
          <span className="flex-1">{copy.composer.editing}</span>
          <button type="button" className="clinical-link min-h-0 text-xs" onClick={onCancelEdit}>{copy.composer.cancelEdit}</button>
        </div>
      ) : null}
      {availability.notice === "firstMessageOnly" ? (
        <p className="mb-2 text-[.7rem] text-[var(--text-secondary)]">{copy.thread.firstMessageOnly}</p>
      ) : null}
      {!editing ? (
        <DraftAttachmentList drafts={attachments.drafts} onRemove={attachments.remove} onRetry={attachments.retry}
          copy={caseCopy} locale={locale} />
      ) : null}
      {problem ? (
        <p role="alert" className="mb-2 text-[.7rem] font-medium text-[var(--danger-ink)]">{caseCopy.composer.problems[problem]}</p>
      ) : null}
      <div className={styles.composerBox} data-urgent={urgent && !editing}>
        <label htmlFor={ids.input} className="sr-only">{copy.composer.label}</label>
        <textarea
          ref={field}
          id={ids.input}
          rows={1}
          // Empty, the page's direction (its placeholder); then the text's own.
          dir={value.trim() ? "auto" : undefined}
          value={value}
          placeholder={copy.composer.placeholder}
          aria-describedby={`${ids.hint}${showsLengthCounter(value) ? ` ${ids.counter}` : ""}`}
          aria-invalid={tooLong || undefined}
          className={styles.composerInput}
          onChange={(event) => {
            setValue(event.target.value);
            const now = Date.now();
            if (!editing && event.target.value.trim() && now - lastTypingAt.current >= TYPING_SEND_INTERVAL_MS) {
              lastTypingAt.current = now;
              onTyping();
            }
          }}
          onKeyDown={(event) => {
            if (isSendShortcut({ isComposing: event.nativeEvent.isComposing, key: event.key, shiftKey: event.shiftKey })) {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape" && (editing || replyTo)) {
              event.preventDefault();
              if (editing) onCancelEdit();
              else onCancelReply();
            }
          }}
        />
        <div className={styles.composerToolbar}>
        {editing ? <span className={styles.editingLabel}><Pencil size={14} aria-hidden="true" />{copy.composer.editing}</span> : (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              aria-pressed={urgent}
              title={copy.composer.urgentHint}
              onClick={() => {
                setUrgent((current) => !current);
                if (urgent) setRequiresAck(false);
              }}
              className={styles.priorityButton}
            >
              <AlertTriangle size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>{copy.composer.urgent}</span>
            </button>
            {/* Asked with an urgent message only: unavailable until it is one. */}
            <label htmlFor={ids.ack} className={cn("inline-flex items-center gap-1.5 px-1.5 text-[.7rem]",
              urgent ? "cursor-pointer text-[var(--text-primary)]" : "cursor-not-allowed text-[var(--text-muted)]")}>
              <input id={ids.ack} type="checkbox" checked={urgent && requiresAck} disabled={!urgent}
                aria-describedby={urgent ? undefined : ids.ackHint} onChange={(event) => setRequiresAck(event.target.checked)} />
              {caseCopy.composer.requiresAck}
              {!urgent ? <span id={ids.ackHint} className="sr-only">{caseCopy.composer.requiresAckHint}</span> : null}
            </label>
            <input ref={filePicker} id={ids.files} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" tabIndex={-1}
              aria-hidden="true" onChange={(event) => {
                addFiles([...(event.target.files ?? [])]);
                event.target.value = "";
              }} />
            <button type="button" className={styles.priorityButton} onClick={() => filePicker.current?.click()}>
              <Paperclip size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>{caseCopy.composer.attach}</span>
            </button>
            {patientId ? (
              <button type="button" className={styles.priorityButton} onClick={() => setPickerOpen(true)}>
                <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" />
                <span>{caseCopy.composer.attachFromRecord}</span>
              </button>
            ) : null}
          </div>
        )}
        <button type="submit" disabled={!canSubmit} className={styles.sendButton}>
          <span>{editing ? copy.composer.save : copy.composer.send}</span>
          <SendHorizontal size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
        </button>
        </div>
      </div>
      <div className={styles.composerFooter}>
        <p id={ids.hint} className={styles.keyboardHint}>{copy.composer.hint}</p>
        {showsLengthCounter(value) ? (
          <p id={ids.counter} aria-live="polite" className={cn("ms-auto tabular-nums", tooLong && "font-semibold text-[var(--danger-ink)]")}>
            {tooLong ? `${copy.composer.tooLong} · ` : ""}
            {copy.composer.counter(formatNumber(length, locale), formatNumber(MESSAGE_BODY_MAX_LENGTH, locale))}
          </p>
        ) : null}
      </div>
      {patientId ? (
        <RecordDocumentPicker open={pickerOpen} conversationId={conversationId} patientId={patientId}
          onClose={() => setPickerOpen(false)} onPick={attachments.addUploaded} copy={caseCopy} errorText={errorText} />
      ) : null}
    </form>
  );
}
