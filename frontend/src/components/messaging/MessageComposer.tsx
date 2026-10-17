"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Lock, Pencil, SendHorizontal, X } from "lucide-react";

import { type Locale } from "@/i18n";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import { formatNumber } from "@/features/messaging/messaging-format";
import {
  canSubmitMessage,
  type ComposerAvailability,
  isSendShortcut,
  MESSAGE_BODY_MAX_LENGTH,
  messageLength,
  showsLengthCounter,
  TYPING_SEND_INTERVAL_MS,
} from "@/features/messaging/messaging-rules";
import { type MessagePriority } from "@/features/messaging/messaging.types";
import { cn } from "@/lib/utils";

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
  onSend: (body: string, priority: MessagePriority) => void;
  onSaveEdit: (messageId: string, body: string) => void;
  onTyping: () => void;
};

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
  replyTo,
}: MessageComposerProps) {
  const ids = { counter: useId(), hint: useId(), input: useId() };
  const field = useRef<HTMLTextAreaElement>(null);
  const lastTypingAt = useRef(0);
  const [value, setValue] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
  const canSubmit = canSubmitMessage(value);

  const submit = () => {
    if (!canSubmit) return;
    if (editing) {
      onSaveEdit(editing.messageId, value.trim());
    } else {
      onSend(value.trim(), urgent ? "URGENT" : "NORMAL");
      setValue("");
      setUrgent(false);
    }
  };

  return (
    <form
      className="border-t border-[var(--border)] px-3 py-2.5 sm:px-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
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
      <div className="flex items-end gap-2">
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
          className="min-h-[42px] flex-1 resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] aria-[invalid=true]:border-[var(--danger)]"
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
        {editing ? null : (
          <button
            type="button"
            aria-pressed={urgent}
            title={copy.composer.urgentHint}
            onClick={() => setUrgent((current) => !current)}
            className={cn(
              "clinical-button min-h-[42px] shrink-0 px-2.5",
              urgent && "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
            )}
          >
            <AlertTriangle size={15} strokeWidth={1.8} aria-hidden="true" />
            <span className="hidden sm:inline">{copy.composer.urgent}</span>
            <span className="sr-only sm:hidden">{copy.composer.urgent}</span>
          </button>
        )}
        <button type="submit" disabled={!canSubmit} className="clinical-button clinical-button-primary min-h-[42px] shrink-0 px-3 disabled:opacity-50">
          <SendHorizontal size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
          <span className="hidden sm:inline">{editing ? copy.composer.save : copy.composer.send}</span>
          <span className="sr-only sm:hidden">{editing ? copy.composer.save : copy.composer.send}</span>
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[.68rem] text-[var(--text-secondary)]">
        <p id={ids.hint} className="hidden sm:block">{copy.composer.hint}</p>
        {showsLengthCounter(value) ? (
          <p id={ids.counter} aria-live="polite" className={cn("ms-auto tabular-nums", tooLong && "font-semibold text-[var(--danger-ink)]")}>
            {tooLong ? `${copy.composer.tooLong} · ` : ""}
            {copy.composer.counter(formatNumber(length, locale), formatNumber(MESSAGE_BODY_MAX_LENGTH, locale))}
          </p>
        ) : null}
      </div>
    </form>
  );
}
