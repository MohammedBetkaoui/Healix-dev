"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { BellOff, ChevronRight, Inbox, MessageSquarePlus, RotateCcw } from "lucide-react";

import { type Locale } from "@/i18n";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import { formatListDate } from "@/features/messaging/messaging-format";
import { useUpdateMessagingSettings } from "@/features/messaging/messaging.mutations";
import { useConversations, useMessagingSettings } from "@/features/messaging/messaging.queries";
import { isMuted, otherParticipant } from "@/features/messaging/messaging-rules";
import { type Conversation, type ConversationFilter } from "@/features/messaging/messaging.types";
import { cn } from "@/lib/utils";

import { Avatar, ListSkeleton, UnreadCountBadge } from "./messaging-ui";

const FILTERS: ConversationFilter[] = ["all", "unread", "requests", "archived"];

type ConversationListProps = {
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  myUserId: string;
  copy: MessagingCopy;
  locale: Locale;
};

export function conversationName(conversation: Conversation, myUserId: string, fallback: string): string {
  if (conversation.type === "GROUP") return conversation.title ?? fallback;
  return otherParticipant(conversation, myUserId)?.fullName ?? fallback;
}

export function conversationSubtitle(conversation: Conversation, myUserId: string, copy: MessagingCopy): string {
  if (conversation.type === "GROUP") {
    return copy.thread.group(conversation.participants.filter((participant) => participant.status === "ACTIVE").length);
  }
  const other = otherParticipant(conversation, myUserId);
  return [other?.speciality, other?.establishmentName].filter(Boolean).join(" · ");
}

// The text isolated (bdi): a French preview keeps its direction in Arabic.
function preview(conversation: Conversation, myUserId: string, copy: MessagingCopy): ReactNode {
  const last = conversation.lastMessage;
  if (!last) return copy.list.noMessages;
  const text = <bdi>{last.deleted ? copy.list.deletedPreview : (last.preview ?? "")}</bdi>;
  return last.senderId === myUserId ? <>{copy.list.you} : {text}</> : text;
}

export function ConversationList({
  copy,
  filter,
  locale,
  myUserId,
  onFilterChange,
  onNewConversation,
  onSelect,
  selectedId,
}: ConversationListProps) {
  const ids = { heading: useId() };
  const list = useRef<HTMLUListElement>(null);
  const query = useConversations(filter);
  const items = (query.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((conversation) => filter !== "unread" || conversation.unreadCount > 0);
  // A request received is not in "Toutes" (the API lists it apart): its
  // count is shown on its filter, and from "Toutes".
  const requests = useConversations("requests");
  const requestCount = (requests.data?.pages ?? []).reduce((total, page) => total + page.items.length, 0);

  // Arrow keys move between the conversations, Home and End to the ends.
  const moveFocus = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button[data-conversation]") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      event.key === "ArrowDown" ? index + 1
      : event.key === "ArrowUp" ? index - 1
      : event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
      : null;
    if (target === null || buttons.length === 0) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, target))]?.focus();
  };

  return (
    <section aria-labelledby={ids.heading} className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <header className="space-y-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id={ids.heading} className="text-base font-semibold text-[var(--text-primary)]">{copy.list.label}</h2>
          <button type="button" className="clinical-button clinical-button-primary min-h-9 px-3" onClick={onNewConversation}>
            <MessageSquarePlus size={16} strokeWidth={1.8} aria-hidden="true" />
            {copy.list.newConversation}
          </button>
        </div>
        <div role="group" aria-label={copy.list.filtersLabel} className="flex flex-wrap gap-1">
          {FILTERS.map((value) => {
            const count = value === "requests" ? requestCount : 0;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                aria-label={count > 0 ? `${copy.list.filters[value]}, ${copy.list.pendingRequests(count)}` : undefined}
                onClick={() => onFilterChange(value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                  filter === value
                    ? "border-[var(--medical)] bg-[var(--medical-soft)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]",
                )}
              >
                {copy.list.filters[value]}
                {count > 0 ? (
                  <span aria-hidden="true" className="rounded-full bg-[var(--medical)] px-1.5 text-[.65rem] font-semibold leading-4 text-white">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filter === "all" && requestCount > 0 ? (
          <button
            type="button"
            onClick={() => onFilterChange("requests")}
            className="flex w-full items-center gap-2 border-b border-[var(--accent-line)] bg-[var(--medical-soft)] px-4 py-2.5 text-start text-xs font-medium text-[var(--text-primary)] hover:underline"
          >
            <Inbox size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--medical)]" />
            <span className="flex-1">{copy.list.pendingRequests(requestCount)}</span>
            <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0 rtl:rotate-180" />
          </button>
        ) : null}
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <div role="alert" className="space-y-3 px-4 py-6 text-center">
            <p className="text-sm text-[var(--text-primary)]">{copy.list.errorTitle}</p>
            <button type="button" className="clinical-button" onClick={() => void query.refetch()}>
              <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
              {copy.list.retry}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">{copy.list.empty[filter]}</p>
            {filter === "all" ? <p className="clinical-caption mt-1">{copy.list.emptyHint}</p> : null}
          </div>
        ) : (
          <ul ref={list} onKeyDown={moveFocus} className="divide-y divide-[var(--border)]">
            {items.map((conversation) => (
              <li key={conversation.id}>
                <ConversationRow
                  conversation={conversation}
                  selected={conversation.id === selectedId}
                  onSelect={() => onSelect(conversation.id)}
                  myUserId={myUserId}
                  copy={copy}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        )}
        {query.hasNextPage ? (
          <div className="flex justify-center p-3">
            <button type="button" className="clinical-link text-xs" disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? "…" : copy.list.loadMore}
            </button>
          </div>
        ) : null}
      </div>

      <DiscoverableSetting copy={copy} />
    </section>
  );
}

function ConversationRow({
  conversation,
  copy,
  locale,
  myUserId,
  onSelect,
  selected,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
  myUserId: string;
  copy: MessagingCopy;
  locale: Locale;
}) {
  const name = conversationName(conversation, myUserId, copy.list.group);
  const subtitle = conversationSubtitle(conversation, myUserId, copy);
  const date = conversation.lastMessage?.createdAt ?? conversation.lastMessageAt ?? conversation.createdAt;
  const muted = isMuted(conversation);
  const unread = conversation.unreadCount;

  return (
    <button
      type="button"
      data-conversation
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 border-s-[3px] px-4 py-3 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]",
        selected ? "border-[var(--medical)] bg-[var(--medical-soft)]" : "border-transparent hover:bg-[var(--surface-muted)]",
      )}
    >
      <Avatar name={name} group={conversation.type === "GROUP"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]", unread > 0 ? "font-semibold" : "font-medium")}>
            <bdi>{name}</bdi>
          </span>
          <time dateTime={date} className="shrink-0 text-[.68rem] text-[var(--text-secondary)]">{formatListDate(date, locale)}</time>
        </span>
        {subtitle ? <span className="block truncate text-[.72rem] text-[var(--text-secondary)]">{subtitle}</span> : null}
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs", unread > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
            {conversation.me.status === "PENDING" ? (
              <span className="me-1 rounded-[var(--radius-xs)] border border-[var(--accent-line)] px-1 text-[.65rem] font-semibold text-[var(--medical)]">{copy.list.request}</span>
            ) : null}
            {preview(conversation, myUserId, copy)}
          </span>
          {muted ? (
            <span role="img" aria-label={copy.list.muted} title={copy.list.muted} className="shrink-0 text-[var(--text-secondary)]">
              <BellOff size={13} strokeWidth={1.8} aria-hidden="true" />
            </span>
          ) : null}
          <UnreadCountBadge count={unread} label={copy.list.unread(unread)} />
        </span>
      </span>
    </button>
  );
}

// "Reachable by professionals of other workspaces" (the directory).
function DiscoverableSetting({ copy }: { copy: MessagingCopy }) {
  const ids = { hint: useId(), label: useId() };
  const settings = useMessagingSettings();
  const update = useUpdateMessagingSettings();
  const value = settings.data?.discoverableByPeers;

  return (
    <div className="border-t border-[var(--border)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span id={ids.label} className="text-xs font-medium text-[var(--text-primary)]">{copy.panel.discoverable}</span>
        <button
          type="button"
          role="switch"
          aria-checked={value ?? false}
          aria-labelledby={ids.label}
          aria-describedby={ids.hint}
          disabled={value === undefined || update.isPending}
          onClick={() => value !== undefined && update.mutate({ discoverableByPeers: !value })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
            value ? "border-[var(--medical)] bg-[var(--medical)]" : "border-[var(--border-strong)] bg-[var(--surface-muted)]",
          )}
        >
          <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", value ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1")} />
        </button>
      </div>
      <p id={ids.hint} className="clinical-caption mt-1">{copy.panel.discoverableHint}</p>
    </div>
  );
}
