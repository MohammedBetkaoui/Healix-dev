"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MessageSquarePlus, Search, Users, X } from "lucide-react";

import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import {
  useBlockToggle,
  useCreateDirectConversation,
  useCreateGroupConversation,
} from "@/features/messaging/messaging.mutations";
import { useDirectory, useWorkspaceMembers } from "@/features/messaging/messaging.queries";
import { openDirectConversation } from "@/features/messaging/messaging-rules";
import { type Conversation } from "@/features/messaging/messaging.types";
import { type Direction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { Avatar } from "./messaging-ui";
import styles from "./messaging.module.css";

export const SEARCH_DEBOUNCE_MS = 300;
const TITLE_MAX_LENGTH = 120;

// The value, once it has stopped changing for 300 ms.
export function useDebouncedValue<Value>(value: Value, delayMs = SEARCH_DEBOUNCE_MS): Value {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return settled;
}

type NewConversationDialogProps = {
  initialTab?: "peer" | "group";
  open: boolean;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
  // The conversations already loaded: a DIRECT one is reopened directly.
  knownConversations: Conversation[];
  copy: MessagingCopy;
  direction: Direction;
  errorText: (error: unknown) => string;
};

const fieldClass =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export function NewConversationDialog(props: NewConversationDialogProps) {
  const { copy, direction, onClose, open } = props;
  const ids = { group: useId(), peer: useId(), subtitle: useId(), title: useId() };
  const [tab, setTab] = useState<"peer" | "group">(props.initialTab ?? "peer");
  const dialog = useRef<HTMLDivElement>(null);

  // Focus inside on opening, back where it was on closing.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>("input")?.focus();
    return () => previous?.focus();
  }, [open, tab]);

  // Escape closes it, even when the focus fell back to the page (a button
  // replaced under it).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]"
      role="presentation"
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={ids.subtitle} dir={direction}
          className={styles.newDialog}>
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="healix-mark"><MessageSquarePlus size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{copy.newConversation.title}</h2>
                <p id={ids.subtitle} className="clinical-caption mt-0.5">{copy.newConversation.subtitle}</p>
              </div>
            </div>
            <button type="button" className="clinical-icon-button -me-2 shrink-0" onClick={onClose} aria-label={copy.newConversation.close}>
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </header>

          <div role="tablist" aria-label={copy.newConversation.title} className="flex gap-1 border-b border-[var(--border)] px-5 pt-2"
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              setTab((current) => (current === "peer" ? "group" : "peer"));
            }}>
            {(["peer", "group"] as const).map((value) => (
              <button key={value} type="button" role="tab" id={`${ids[value]}-tab`} aria-controls={ids[value]}
                aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
                className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                  tab === value ? "border-[var(--medical)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
                {copy.newConversation.tabs[value]}
              </button>
            ))}
          </div>

          <div id={ids[tab]} role="tabpanel" aria-labelledby={`${ids[tab]}-tab`} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === "peer" ? <PeerTab {...props} /> : <GroupTab {...props} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function PeerTab({ copy, errorText, knownConversations, onOpenConversation }: NewConversationDialogProps) {
  const ids = { search: useId(), speciality: useId(), wilaya: useId() };
  const [search, setSearch] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Strings, not an object: a new object each render would never settle.
  const filters = {
    search: useDebouncedValue(search.trim()),
    speciality: useDebouncedValue(speciality.trim()),
    wilaya: useDebouncedValue(wilaya.trim()),
  };
  const directory = useDirectory(filters);
  const create = useCreateDirectConversation();
  const { unblock } = useBlockToggle();

  const write = (userId: string) => {
    setError(null);
    openDirectConversation({ create: create.mutateAsync, knownConversations, userId }).then(
      onOpenConversation,
      (reason: unknown) => setError(errorText(reason)),
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={ids.search} className="text-xs font-medium text-[var(--text-primary)]">{copy.newConversation.search}</label>
        <div className="relative">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input id={ids.search} type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.newConversation.searchPlaceholder} className={cn(fieldClass, "ps-9")} autoComplete="off" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={ids.speciality} className="text-xs font-medium text-[var(--text-primary)]">{copy.newConversation.speciality}</label>
          <input id={ids.speciality} value={speciality} onChange={(event) => setSpeciality(event.target.value)} className={fieldClass} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.wilaya} className="text-xs font-medium text-[var(--text-primary)]">{copy.newConversation.wilaya}</label>
          <input id={ids.wilaya} value={wilaya} onChange={(event) => setWilaya(event.target.value)} className={fieldClass} autoComplete="off" />
        </div>
      </div>

      {error ? <p role="alert" className="rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]">{error}</p> : null}

      <div aria-live="polite" aria-busy={directory.isFetching}>
        {directory.isPending ? (
          <p className="clinical-caption">{copy.newConversation.searching}</p>
        ) : directory.isError ? (
          <p role="alert" className="text-xs text-[var(--danger-ink)]">{errorText(directory.error)}</p>
        ) : directory.data.length === 0 ? (
          <p className="clinical-caption">{filters.search || filters.speciality || filters.wilaya ? copy.newConversation.noResults : copy.newConversation.startHint}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {directory.data.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={entry.fullName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]"><bdi>{entry.fullName}</bdi></p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {[entry.speciality, entry.establishmentName, entry.wilaya].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-[.68rem] text-[var(--text-secondary)]">
                    {entry.blockedByMe ? copy.newConversation.blocked : entry.sameWorkspace ? copy.newConversation.sameWorkspace : copy.newConversation.otherWorkspace}
                  </p>
                </div>
                {/* Blocked: unblocking first (a declined request no longer shows its
                    conversation). Not disabled while pending: the focus stays on the
                    button, which becomes "Écrire". */}
                {entry.blockedByMe ? (
                  <button type="button" className="clinical-button min-h-9 shrink-0 px-3" aria-busy={unblock.isPending}
                    aria-label={copy.panel.unblock(entry.fullName)}
                    onClick={() => {
                      if (unblock.isPending) return;
                      setError(null);
                      unblock.mutate(entry.id, { onError: (reason) => setError(errorText(reason)) });
                    }}>
                    {copy.newConversation.unblock}
                  </button>
                ) : (
                  <button type="button" className="clinical-button min-h-9 shrink-0 px-3" disabled={create.isPending}
                    onClick={() => write(entry.id)}>
                    {copy.newConversation.write}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GroupTab({ copy, errorText, onOpenConversation }: NewConversationDialogProps) {
  const ids = { members: useId(), search: useId(), title: useId(), titleError: useId() };
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settledSearch = useDebouncedValue(search.trim());
  const members = useWorkspaceMembers(settledSearch);
  const create = useCreateGroupConversation();
  const trimmed = title.trim();
  const titleError = !trimmed
    ? copy.newConversation.groupTitleRequired
    : Array.from(trimmed).length > TITLE_MAX_LENGTH
      ? copy.newConversation.groupTitleTooLong
      : null;
  const membersError = selected.length === 0 ? copy.newConversation.selectMembers : null;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        setError(null);
        if (titleError || membersError) return;
        create.mutateAsync({ participantIds: selected, title: trimmed }).then(
          (conversation) => onOpenConversation(conversation.id),
          (reason: unknown) => setError(errorText(reason)),
        );
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor={ids.title} className="text-xs font-medium text-[var(--text-primary)]">
          {copy.newConversation.groupTitle}<span aria-hidden="true" className="text-[var(--danger)]"> *</span>
        </label>
        <input id={ids.title} value={title} required maxLength={TITLE_MAX_LENGTH + 20} onChange={(event) => setTitle(event.target.value)}
          aria-invalid={submitted && titleError ? true : undefined} aria-describedby={submitted && titleError ? ids.titleError : undefined}
          className={cn(fieldClass, "aria-[invalid=true]:border-[var(--danger)]")} autoComplete="off" />
        {submitted && titleError ? <p id={ids.titleError} className="text-xs text-[var(--danger-ink)]">{titleError}</p> : null}
      </div>

      <fieldset className="space-y-2" aria-describedby={ids.members}>
        <legend className="text-xs font-medium text-[var(--text-primary)]">{copy.newConversation.members}</legend>
        <div className="relative">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input id={ids.search} type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            aria-label={copy.newConversation.membersSearch} placeholder={copy.newConversation.membersSearch}
            className={cn(fieldClass, "ps-9")} autoComplete="off" />
        </div>
        {members.isPending ? (
          <p className="clinical-caption">{copy.newConversation.searching}</p>
        ) : members.isError ? (
          <p role="alert" className="text-xs text-[var(--danger-ink)]">{errorText(members.error)}</p>
        ) : members.data.length === 0 ? (
          <p className="clinical-caption">{settledSearch ? copy.newConversation.noResults : copy.newConversation.noMembers}</p>
        ) : (
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-1">
            {members.data.map((member) => (
              <li key={member.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--surface-muted)]">
                  <input type="checkbox" checked={selected.includes(member.id)}
                    onChange={(event) => setSelected((value) => event.target.checked ? [...value, member.id] : value.filter((id) => id !== member.id))} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--text-primary)]"><bdi>{member.fullName}</bdi></span>
                    {member.speciality ? <span className="block truncate text-xs text-[var(--text-secondary)]">{member.speciality}</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p id={ids.members} className={cn("text-xs", submitted && membersError ? "text-[var(--danger-ink)]" : "text-[var(--text-secondary)]")}>
          {submitted && membersError ? membersError : copy.newConversation.selected(selected.length)}
        </p>
      </fieldset>

      {error ? <p role="alert" className="rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]">{error}</p> : null}

      <div className="flex justify-end">
        <button type="submit" className="clinical-button clinical-button-primary" disabled={create.isPending}>
          <Users size={16} strokeWidth={1.8} aria-hidden="true" />
          {copy.newConversation.create}
        </button>
      </div>
    </form>
  );
}
