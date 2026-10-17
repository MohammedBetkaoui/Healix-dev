"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Copy,
  CornerUpLeft,
  FileCheck2,
  FileHeart,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { type Locale } from "@/i18n";
import { caseMessagingCopy } from "@/features/messaging/case-messaging.copy";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import { formatDateTime, formatTime } from "@/features/messaging/messaging-format";
import { type AckState, type PendingMessage } from "@/features/messaging/messaging-rules";
import { type MessageView } from "@/features/messaging/messaging.types";
import { cn } from "@/lib/utils";

import { MessageAttachments } from "./attachments";
import { AckStatus } from "./case-ui";
import { MessageText } from "./messaging-ui";
import styles from "./messaging.module.css";

export type BubbleQuote = { authorName: string; text: string; messageId: string | null };

type Common = {
  mine: boolean;
  // Shown above the text in a group, for the others' messages.
  authorName: string | null;
  quote: BubbleQuote | null;
  copy: MessagingCopy;
  locale: Locale;
  onJumpTo: (messageId: string) => void;
};

type MessageBubbleProps =
  | (Common & {
      kind: "message";
      message: MessageView;
      // My own messages: "Envoyé", "Lu", "Lu par N".
      receipt: string | null;
      canEdit: boolean;
      canDelete: boolean;
      onReply: () => void;
      onEdit: () => void;
      onDelete: () => void;
      // An urgent message that asks for an acknowledgement.
      ack?: { state: AckState; canAck: boolean; busy: boolean; onAck: () => void };
      // A case discussion: "Verser au dossier", when the message can be.
      onFileToRecord?: () => void;
    })
  | (Common & {
      kind: "pending";
      pending: PendingMessage;
      failureText: string | null;
      onRetry: () => void;
      onDiscard: () => void;
    });

export function MessageBubble(props: MessageBubbleProps) {
  const { copy, locale, mine } = props;
  const caseCopy = caseMessagingCopy[locale];
  const isPending = props.kind === "pending";
  const createdAt = isPending ? props.pending.createdAt : props.message.createdAt;
  // A deleted message keeps its place only: no quote, no URGENT badge.
  const deleted = !isPending && props.message.deleted;
  const urgent = !deleted && (isPending ? props.pending.priority : props.message.priority) === "URGENT";
  const failed = isPending && props.pending.status === "failed";

  const requiresAck = !deleted && (isPending ? props.pending.requiresAck : props.message.requiresAck);

  const body = (() => {
    if (isPending) return props.pending.body ? <MessageText text={props.pending.body} /> : null;
    const { message } = props;
    if (message.deleted) return <span className="italic text-[var(--text-secondary)]">{copy.message.deleted}</span>;
    // Files sent without text: the files alone.
    if (message.kind === "ATTACHMENT" && message.body === null && !message.bodyUnavailable) return null;
    if (message.bodyUnavailable || message.body === null) {
      return <span className="italic text-[var(--text-secondary)]">{copy.message.unavailable}</span>;
    }
    return <MessageText text={message.body} />;
  })();

  return (
    <div className={cn("group flex items-end gap-1.5", mine ? "justify-end" : "justify-start")}>
      {mine && props.kind === "message" ? <MessageActions {...props} /> : null}
      <div
        className={cn(
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleReceived,
          failed && styles.bubbleFailed,
        )}
      >
        {props.authorName ? (
          <p className="mb-0.5 text-[.72rem] font-semibold text-[var(--medical)]"><bdi>{props.authorName}</bdi></p>
        ) : null}
        {urgent ? (
          <p className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-1.5 py-0.5 text-[.68rem] font-semibold uppercase tracking-wide text-[var(--danger-ink)]">
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              {copy.message.urgent}
            </span>
            {requiresAck ? (
              <span className="inline-flex items-center gap-1 text-[.66rem] font-medium text-[var(--danger-ink)]">
                <BellRing size={11} strokeWidth={2} aria-hidden="true" />
                {caseCopy.message.ackRequested}
              </span>
            ) : null}
          </p>
        ) : null}
        {props.quote && !deleted ? (
          <button
            type="button"
            disabled={!props.quote.messageId}
            onClick={() => props.quote?.messageId && props.onJumpTo(props.quote.messageId)}
            title={copy.message.jumpTo}
            className="mb-1.5 block w-full rounded-[var(--radius-sm)] border-s-2 border-[var(--medical)] bg-[var(--surface-muted)] px-2 py-1 text-start text-xs text-[var(--text-secondary)] enabled:hover:bg-[var(--border)]"
          >
            <span className="block font-semibold text-[var(--text-primary)]"><bdi>{props.quote.authorName}</bdi></span>
            <span dir="auto" className="line-clamp-2">{props.quote.text}</span>
          </button>
        ) : null}
        {props.kind === "message" && !deleted ? (
          <MessageAttachments attachments={props.message.attachments} copy={caseCopy} locale={locale} />
        ) : null}
        {isPending && props.pending.attachments.length > 0 ? (
          <ul aria-label={caseCopy.message.attachments} className="mb-1.5 space-y-1 text-xs text-[var(--text-secondary)]">
            {props.pending.attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-1.5">
                <Paperclip size={12} strokeWidth={1.8} aria-hidden="true" />
                <bdi className="truncate">{attachment.originalName}</bdi>
              </li>
            ))}
          </ul>
        ) : null}
        {/* Its own direction: a French message reads left to right in the Arabic interface. */}
        {body ? <div dir="auto">{body}</div> : null}
        {props.kind === "message" && props.message.filedToRecord && !deleted ? (
          <p className="mt-1 inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--accent-line)] bg-[var(--medical-soft)] px-1.5 py-0.5 text-[.66rem] font-semibold text-[var(--medical)]">
            <FileCheck2 size={12} strokeWidth={2} aria-hidden="true" />
            {caseCopy.message.filed}
          </p>
        ) : null}
        <p className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-[.68rem] text-[var(--text-secondary)]", mine && "justify-end")}>
          <time dateTime={createdAt} title={formatDateTime(createdAt, locale)}>{formatTime(createdAt, locale)}</time>
          {props.kind === "message" && props.message.editedAt && !props.message.deleted ? (
            <span>· {copy.message.edited}</span>
          ) : null}
          {props.kind === "message" && props.receipt ? <span>· {props.receipt}</span> : null}
          {isPending && !failed ? <span>· {copy.message.sending}</span> : null}
          {failed ? (
            <span className="font-medium text-[var(--danger-ink)]" role="alert">
              · {copy.message.failed}
              {props.failureText ? ` : ${props.failureText}` : ""}
            </span>
          ) : null}
        </p>
        {props.kind === "message" && props.ack ? (
          <AckStatus state={props.ack.state} canAck={props.ack.canAck} busy={props.ack.busy} onAck={props.ack.onAck}
            copy={caseCopy} locale={locale} />
        ) : null}
        {failed ? (
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button type="button" className="clinical-button min-h-8 px-2 text-xs" onClick={props.onRetry}>
              <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
              {copy.message.retry}
            </button>
            <button type="button" className="clinical-button min-h-8 px-2 text-xs" onClick={props.onDiscard}>
              <X size={13} strokeWidth={1.8} aria-hidden="true" />
              {copy.message.discard}
            </button>
          </div>
        ) : null}
      </div>
      {!mine && props.kind === "message" ? <MessageActions {...props} /> : null}
    </div>
  );
}

// Reply and copy for everyone; edit and delete for the author, within 15
// minutes. A menu button, Arrow keys between the items, Escape to close.
function MessageActions(props: Extract<MessageBubbleProps, { kind: "message" }>) {
  const { copy, message } = props;
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && event.target !== triggerRef.current) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (message.deleted) return null;

  const choose = (action: () => void) => {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  };
  const copyText = () => {
    if (message.body) void navigator.clipboard?.writeText(message.body).catch(() => undefined);
  };
  const fileToRecord = props.onFileToRecord;
  const items = [
    { action: props.onReply, icon: CornerUpLeft, label: copy.message.reply, show: true },
    { action: copyText, icon: Copy, label: copy.message.copy, show: Boolean(message.body) },
    {
      action: () => fileToRecord?.(),
      icon: FileHeart,
      label: caseMessagingCopy[props.locale].message.fileToRecord,
      show: Boolean(fileToRecord),
    },
    { action: props.onEdit, icon: Pencil, label: copy.message.edit, show: props.canEdit },
    { action: props.onDelete, danger: true, icon: Trash2, label: copy.message.delete, show: props.canDelete },
  ].filter((item) => item.show);

  return (
    <div className="relative shrink-0 self-center">
      <button
        ref={triggerRef}
        type="button"
        className="clinical-icon-button h-8 min-w-8 opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        aria-label={copy.message.actions}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={copy.message.actions}
          className="absolute bottom-full z-20 mb-1 min-w-40 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-raised)] [inset-inline-end:0]"
          onKeyDown={(event) => {
            const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              buttons[(index + step + buttons.length) % buttons.length]?.focus();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-start text-xs hover:bg-[var(--surface-muted)] focus:bg-[var(--surface-muted)] focus:outline-none",
                item.danger ? "text-[var(--danger-ink)]" : "text-[var(--text-primary)]",
              )}
              onClick={() => choose(item.action)}
            >
              <item.icon size={14} strokeWidth={1.8} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
