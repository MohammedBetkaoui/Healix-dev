"use client";

import { Fragment, useEffect, useId, useRef, type ReactNode } from "react";
import { Ban, Check, Clock, ShieldAlert, Users, X } from "lucide-react";

import { initialsOf, tokenizeMessageText, unreadBadgeText } from "@/features/messaging/messaging-rules";
import { cn } from "@/lib/utils";

// The small pieces of the Messages interface.

// Plain text with its line breaks; http(s) links open in a new tab, without
// giving the page access to its opener. Never HTML: each token is a text node
// or an <a>, never dangerouslySetInnerHTML.
export function MessageText({ text }: { text: string }) {
  return (
    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {tokenizeMessageText(text).map((token, index) =>
        token.type === "link" ? (
          <a
            key={index}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="font-medium text-[var(--accent-dark)] underline underline-offset-2"
          >
            {token.value}
          </a>
        ) : (
          <Fragment key={index}>{token.value}</Fragment>
        ),
      )}
    </span>
  );
}

// A count in a pill: "99+" beyond 99, nothing at 0. The count is in words
// for assistive technologies; the colour carries nothing on its own.
export function UnreadCountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  const text = unreadBadgeText(count);
  if (!text) return null;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--medical)] px-1.5 text-[.65rem] font-semibold leading-none text-[var(--primary-foreground)]",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function Avatar({ name, group = false, size = "md" }: { name: string; group?: boolean; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--medical-soft)] font-semibold text-[var(--medical)]",
        size === "sm" ? "h-8 w-8 text-[.65rem]" : "h-10 w-10 text-xs",
      )}
    >
      {group ? <Users size={size === "sm" ? 14 : 16} strokeWidth={1.8} /> : initialsOf(name)}
    </span>
  );
}

type RequestBannerProps =
  | {
      variant: "received";
      text: string;
      labels: { accept: string; decline: string; block: string };
      busy?: boolean;
      onAccept: () => void;
      onDecline: () => void;
      onBlock: () => void;
    }
  | { variant: "sent"; text: string };

// A contact request, received (answer it) or sent (wait for the answer).
export function RequestBanner(props: RequestBannerProps) {
  if (props.variant === "sent") {
    return (
      <div role="status" className="flex items-start gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs text-[var(--text-secondary)]">
        <Clock size={15} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>{props.text}</p>
      </div>
    );
  }

  return (
    <div role="region" aria-label={props.text} className="flex flex-col gap-3 border-b border-[var(--accent-line)] bg-[var(--medical-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium text-[var(--text-primary)]">{props.text}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="clinical-button clinical-button-primary min-h-9 px-3" disabled={props.busy} onClick={props.onAccept}>
          <Check size={15} strokeWidth={1.8} aria-hidden="true" />
          {props.labels.accept}
        </button>
        <button type="button" className="clinical-button min-h-9 px-3" disabled={props.busy} onClick={props.onDecline}>
          <X size={15} strokeWidth={1.8} aria-hidden="true" />
          {props.labels.decline}
        </button>
        <button type="button" className="clinical-button min-h-9 px-3 text-[var(--danger-ink)]" disabled={props.busy} onClick={props.onBlock}>
          <Ban size={15} strokeWidth={1.8} aria-hidden="true" />
          {props.labels.block}
        </button>
      </div>
    </div>
  );
}

// Discreet, in every DIRECT and GROUP conversation (a link to a case
// discussion in lot 4).
export function PatientDataNotice({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-1.5 text-[.7rem] text-[var(--text-secondary)]">
      <ShieldAlert size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--warning-ink)]" />
      {text}
    </p>
  );
}

// A confirmation before an action that cannot be undone (delete, leave,
// block). Focus goes to the safe choice; Escape cancels.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ids = { body: useId(), title: useId() };
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={body ? ids.body : undefined}
        className="surface-section surface-raised w-full max-w-sm p-5">
        <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        {body ? <div id={ids.body} className="clinical-caption mt-2">{body}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="clinical-button" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" disabled={busy} onClick={onConfirm}
            className={cn("clinical-button", danger ? "border-[var(--danger)] bg-[var(--danger)] text-white hover:bg-[var(--danger-ink)]" : "clinical-button-primary")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="divide-y divide-[var(--border)]">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex animate-pulse items-center gap-3 px-4 py-3">
          <span className="h-10 w-10 rounded-full bg-[var(--surface-muted)]" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-2/3 rounded bg-[var(--surface-muted)]" />
            <span className="block h-3 w-1/2 rounded bg-[var(--surface-muted)]" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col gap-4 p-4">
      {[60, 40, 72, 52, 36].map((width, index) => (
        <span key={index} className={cn("block h-12 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-muted)]", index % 2 ? "ms-auto" : "")}
          style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}
