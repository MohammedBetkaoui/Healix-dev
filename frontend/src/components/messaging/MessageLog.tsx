"use client";

import { Fragment, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MessageSquare } from "lucide-react";

import { type Locale } from "@/i18n";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import { formatDayHeading } from "@/features/messaging/messaging-format";
import { groupByDay, type TimelineEntry } from "@/features/messaging/messaging-rules";
import styles from "./messaging.module.css";

// Loads older messages when the reader gets this close to the top.
const LOAD_OLDER_THRESHOLD_PX = 80;
// Follows new messages when the reader is this close to the bottom.
const STICK_TO_BOTTOM_PX = 120;

type MessageLogProps = {
  conversationId: string;
  entries: TimelineEntry[];
  // Where "New messages" goes (the seq it precedes), fixed when the
  // conversation opened.
  separatorSeq: number | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  // Observed to mark the conversation read.
  endRef: (element: HTMLElement | null) => void;
  renderEntry: (entry: TimelineEntry) => ReactNode;
  copy: MessagingCopy;
  locale: Locale;
};

const dateOf = (entry: TimelineEntry) =>
  entry.kind === "message" ? entry.message.createdAt : entry.pending.createdAt;

export function MessageLog({
  conversationId,
  copy,
  endRef,
  entries,
  hasOlder,
  loadingOlder,
  locale,
  onLoadOlder,
  renderEntry,
  separatorSeq,
}: MessageLogProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [showLatest, setShowLatest] = useState(false);
  const separator = useRef<HTMLLIElement>(null);
  // The position to restore after older messages come in above.
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const openedFor = useRef<string | null>(null);
  const wasAtBottom = useRef(true);
  const groups = useMemo(() => groupByDay(entries, dateOf), [entries]);
  const firstKey = entries[0]?.key;
  const lastKey = entries.at(-1)?.key;

  const loadOlder = () => {
    const element = scroller.current;
    if (!element || !hasOlder || loadingOlder) return;
    anchor.current = { height: element.scrollHeight, top: element.scrollTop };
    onLoadOlder();
  };

  // Older messages came in above: the reader stays on the same message.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !anchor.current) return;
    element.scrollTop = anchor.current.top + (element.scrollHeight - anchor.current.height);
    anchor.current = null;
  }, [firstKey]);

  // On opening: the first unread message, else the latest one.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || entries.length === 0 || openedFor.current === conversationId) return;
    openedFor.current = conversationId;
    if (separator.current) {
      separator.current.scrollIntoView({ block: "center" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, [conversationId, entries.length]);

  // A new message at the end: followed if the reader was at the bottom.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && wasAtBottom.current && openedFor.current === conversationId) {
      element.scrollTop = element.scrollHeight;
    }
  }, [conversationId, lastKey]);

  return (
    <div className={styles.logArea}>
    <div
      ref={scroller}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={copy.thread.logLabel}
      tabIndex={0}
      className={styles.logScroller}
      onScroll={(event) => {
        const element = event.currentTarget;
        wasAtBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
        setShowLatest(!wasAtBottom.current);
        if (element.scrollTop < LOAD_OLDER_THRESHOLD_PX) loadOlder();
      }}
    >
      {hasOlder ? (
        <div className="mb-3 flex justify-center">
          <button type="button" className="clinical-link text-xs" disabled={loadingOlder} onClick={loadOlder}>
            {loadingOlder ? "…" : copy.thread.loadOlder}
          </button>
        </div>
      ) : null}
      {entries.length === 0 ? <div className={styles.emptyThread}>
        <MessageSquare size={27} strokeWidth={1.3} aria-hidden="true" />
        <h3>{copy.thread.startTitle}</h3>
        <p>{copy.thread.startHint}</p>
      </div> : null}
      <ol className={styles.timeline}>
        {groups.map((group) => (
          <li key={group.day}>
            <h3 className={styles.dayHeading}>
              <span>
                {formatDayHeading(group.day, locale, { today: copy.thread.today, yesterday: copy.thread.yesterday })}
              </span>
            </h3>
            <ol className={styles.dayMessages}>
              {group.items.map((entry) => (
                <Fragment key={entry.key}>
                  {entry.kind === "message" && entry.message.seq === separatorSeq ? (
                    <li ref={separator} className="flex items-center gap-2 py-1" aria-label={copy.thread.newMessages}>
                      <span className="h-px flex-1 bg-[var(--danger)]" />
                      <span className="text-[.68rem] font-semibold uppercase tracking-wide text-[var(--danger-ink)]">{copy.thread.newMessages}</span>
                      <span className="h-px flex-1 bg-[var(--danger)]" />
                    </li>
                  ) : null}
                  <li id={entry.kind === "message" ? `message-${entry.message.id}` : undefined} tabIndex={-1}
                    className="rounded-[var(--radius-md)] outline-none transition-colors focus:bg-[var(--surface-muted)]">
                    {renderEntry(entry)}
                  </li>
                </Fragment>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <div ref={endRef} aria-hidden="true" className="h-px" />
    </div>
    {showLatest ? <button type="button" className={styles.latestButton} onClick={() => {
      const element = scroller.current;
      if (element) element.scrollTop = element.scrollHeight;
    }}>
      <ArrowDown size={15} aria-hidden="true" />{copy.thread.latest}
    </button> : null}
    </div>
  );
}
