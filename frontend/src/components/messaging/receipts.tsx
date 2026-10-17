"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CheckCheck, X } from "lucide-react";

import { type Locale } from "@/i18n";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import { formatTime } from "@/features/messaging/messaging-format";
import { useMessageReaders } from "@/features/messaging/messaging.queries";
import { type Receipt } from "@/features/messaging/messaging-rules";

// The status under one of my messages (read receipts): "Envoyé" with one
// check, "Vu" with two checks in the accent colour, "Vu par 3 sur 5" in a
// group. Never by the colour alone: the text says it.

export function ReceiptStatus({
  copy,
  locale,
  messageId,
  receipt,
}: {
  receipt: Receipt;
  messageId: string;
  copy: MessagingCopy;
  locale: Locale;
}) {
  if (receipt.kind === "sent") {
    return (
      <span className="inline-flex items-center gap-0.5">
        · <Check size={12} strokeWidth={2} aria-hidden="true" />
        {copy.message.sent}
      </span>
    );
  }
  if (receipt.kind === "seen") return <SeenStatus copy={copy} locale={locale} messageId={messageId} />;
  return <SeenByStatus copy={copy} locale={locale} messageId={messageId} seen={receipt.seen} total={receipt.total} />;
}

// A direct conversation: "Vu", and when ("Vu à 14:32"), the time read on
// demand (the first reading that reached this message).
function SeenStatus({ copy, locale, messageId }: { messageId: string; copy: MessagingCopy; locale: Locale }) {
  const readers = useMessageReaders(messageId);
  const seenAt = readers.data?.seen[0]?.seenAt ?? null;
  const when = seenAt ? copy.message.seenAt(formatTime(seenAt, locale)) : undefined;

  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-[var(--medical)]" title={when}>
      · <CheckCheck size={13} strokeWidth={2} aria-hidden="true" />
      {copy.message.read}
      {when ? <span className="sr-only"> ({when})</span> : null}
    </span>
  );
}

// A group or a case discussion: "Vu par 3 sur 5", which opens who saw it.
function SeenByStatus({
  copy,
  locale,
  messageId,
  seen,
  total,
}: {
  messageId: string;
  seen: number;
  total: number;
  copy: MessagingCopy;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 rounded-[var(--radius-xs)] font-medium text-[var(--medical)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        · <CheckCheck size={13} strokeWidth={2} aria-hidden="true" />
        {copy.message.seenBy(seen, total)}
      </button>
      <ReadersDialog open={open} onClose={() => setOpen(false)} messageId={messageId} copy={copy} locale={locale} />
    </>
  );
}

// Who saw a message ("Vu par", with the time), who has not yet, and whose
// reading is not shared.
export function ReadersDialog({
  copy,
  locale,
  messageId,
  onClose,
  open,
}: {
  open: boolean;
  messageId: string;
  onClose: () => void;
  copy: MessagingCopy;
  locale: Locale;
}) {
  const ids = { title: useId() };
  const readers = useMessageReaders(messageId, open);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const section = (title: string, people: { userId: string; fullName: string; seenAt?: string | null }[]) =>
    people.length > 0 ? (
      <section className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {title} ({people.length})
        </h3>
        <ul className="mt-2 space-y-1.5">
          {people.map((person) => (
            <li key={person.userId} className="flex items-center justify-between gap-3 text-sm text-[var(--text-primary)]">
              <bdi className="truncate">{person.fullName}</bdi>
              {person.seenAt ? (
                <time dateTime={person.seenAt} className="shrink-0 text-xs text-[var(--text-secondary)]">
                  {formatTime(person.seenAt, locale)}
                </time>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]" role="presentation">
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
        <div role="dialog" aria-modal="true" aria-labelledby={ids.title} className="surface-section surface-raised w-full max-w-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{copy.message.readersTitle}</h2>
            <button ref={closeRef} type="button" className="clinical-icon-button -me-2 -mt-1" onClick={onClose} aria-label={copy.message.readersClose}>
              <X size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <div aria-live="polite" aria-busy={readers.isFetching}>
            {readers.isPending ? (
              <p className="clinical-caption mt-4">{copy.message.readersLoading}</p>
            ) : readers.isError ? (
              <p role="alert" className="mt-4 text-sm text-[var(--danger-ink)]">{copy.message.readersError}</p>
            ) : (
              <>
                {section(copy.message.readersSeen, readers.data.seen)}
                {section(copy.message.readersNotSeen, readers.data.notSeen)}
                {section(copy.message.readersNotShared, readers.data.notShared)}
                {readers.data.notShared.length > 0 ? (
                  <p className="clinical-caption mt-2">{copy.message.readersNotSharedHint}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
