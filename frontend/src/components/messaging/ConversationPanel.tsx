"use client";

import { useId, useState } from "react";
import { Archive, ArchiveRestore, Ban, BellOff, BellRing, LogOut, UserMinus, UserPlus, X } from "lucide-react";

import { type Locale } from "@/i18n";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import { formatMutedUntil } from "@/features/messaging/messaging-format";
import {
  useBlockToggle,
  useConversationMembers,
  useUpdateConversation,
} from "@/features/messaging/messaging.mutations";
import { useWorkspaceMembers } from "@/features/messaging/messaging.queries";
import { isMuted, type MuteOption, mutedUntilFor, otherParticipant } from "@/features/messaging/messaging-rules";
import { type Conversation } from "@/features/messaging/messaging.types";
import { cn } from "@/lib/utils";

import { Avatar, ConfirmDialog } from "./messaging-ui";

type ConversationPanelProps = {
  conversation: Conversation;
  myUserId: string;
  blockedUserIds: ReadonlySet<string>;
  copy: MessagingCopy;
  locale: Locale;
  onClose: () => void;
  // The caller left the group: back to the list.
  onLeft: () => void;
  errorText: (error: unknown) => string;
};

const MUTE_OPTIONS: MuteOption[] = ["1h", "8h", "24h", "forever"];

export function ConversationPanel({
  blockedUserIds,
  conversation,
  copy,
  errorText,
  locale,
  myUserId,
  onClose,
  onLeft,
}: ConversationPanelProps) {
  const ids = { add: useId(), title: useId(), titleField: useId() };
  const update = useUpdateConversation(conversation.id);
  const members = useConversationMembers(conversation.id);
  const blocks = useBlockToggle();
  const [title, setTitle] = useState(conversation.title ?? "");
  const [adding, setAdding] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<"leave" | "block" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGroup = conversation.type === "GROUP";
  const isOwner = conversation.me.role === "OWNER";
  const canManage = isGroup && isOwner && conversation.me.status === "ACTIVE";
  const other = isGroup ? null : otherParticipant(conversation, myUserId);
  const blocked = other ? blockedUserIds.has(other.userId) : false;
  const muted = isMuted(conversation);
  const candidates = useWorkspaceMembers("", canManage);
  const current = new Set(conversation.participants.filter((p) => p.status === "ACTIVE").map((p) => p.userId));
  const addable = (candidates.data ?? []).filter((member) => !current.has(member.id));
  const canArchive = !isGroup || isOwner;

  const run = (promise: Promise<unknown>, then?: () => void) => {
    setError(null);
    promise.then(then, (reason: unknown) => setError(errorText(reason)));
  };

  return (
    <aside aria-labelledby={ids.title} className="flex h-full min-h-0 flex-col overflow-y-auto border-[var(--border)] bg-[var(--surface)] lg:border-s">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <h2 id={ids.title} className="text-sm font-semibold text-[var(--text-primary)]">{copy.panel.title}</h2>
        <button type="button" className="clinical-icon-button" onClick={onClose} aria-label={copy.panel.close}>
          <X size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <div className="space-y-6 px-4 py-4 text-sm">
        {error ? <p role="alert" className="rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]">{error}</p> : null}

        {canManage ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim()) run(update.mutateAsync({ title: title.trim() }));
            }}
          >
            <label htmlFor={ids.titleField} className="block text-xs font-medium text-[var(--text-primary)]">{copy.panel.titleLabel}</label>
            <div className="flex gap-2">
              <input
                id={ids.titleField}
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
              <button type="submit" className="clinical-button min-h-10" disabled={update.isPending || !title.trim() || title.trim() === conversation.title}>
                {copy.panel.save}
              </button>
            </div>
          </form>
        ) : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {isGroup ? copy.panel.members : copy.panel.participants}
          </h3>
          <ul className="space-y-2">
            {conversation.participants.map((participant) => {
              const isMe = participant.userId === myUserId;
              return (
                <li key={participant.userId} className="flex items-center gap-2.5">
                  <Avatar name={participant.fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text-primary)]">
                      <bdi>{participant.fullName}</bdi>
                      {isMe ? <span className="font-normal text-[var(--text-secondary)]"> ({copy.panel.you})</span> : null}
                    </p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {[participant.speciality, participant.establishmentName].filter(Boolean).join(" · ")}
                      {participant.role === "OWNER" && isGroup ? ` · ${copy.panel.owner}` : ""}
                      {participant.status === "PENDING" ? ` · ${copy.panel.pending}` : ""}
                    </p>
                  </div>
                  {canManage && !isMe ? (
                    <button type="button" className="clinical-icon-button h-8 min-w-8" aria-label={copy.panel.remove(participant.fullName)}
                      title={copy.panel.remove(participant.fullName)} disabled={members.remove.isPending}
                      onClick={() => run(members.remove.mutateAsync(participant.userId))}>
                      <UserMinus size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {canManage ? (
          <section aria-labelledby={ids.add}>
            <h3 id={ids.add} className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{copy.panel.addMembers}</h3>
            {addable.length === 0 ? (
              <p className="clinical-caption">{candidates.isLoading ? "…" : copy.panel.noMoreMembers}</p>
            ) : (
              <>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {addable.map((member) => (
                    <li key={member.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 hover:bg-[var(--surface-muted)]">
                        <input type="checkbox" checked={adding.includes(member.id)}
                          onChange={(event) => setAdding((value) => event.target.checked ? [...value, member.id] : value.filter((id) => id !== member.id))} />
                        <span className="min-w-0 flex-1 truncate"><bdi>{member.fullName}</bdi>
                          {member.speciality ? <span className="text-xs text-[var(--text-secondary)]"> · {member.speciality}</span> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button type="button" className="clinical-button mt-2 w-full" disabled={adding.length === 0 || members.add.isPending}
                  onClick={() => run(members.add.mutateAsync(adding), () => setAdding([]))}>
                  <UserPlus size={15} strokeWidth={1.8} aria-hidden="true" />
                  {copy.panel.add}
                </button>
              </>
            )}
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{copy.panel.mute}</h3>
          {muted && conversation.me.mutedUntil ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <BellOff size={14} strokeWidth={1.8} aria-hidden="true" />
                {(() => {
                  const until = formatMutedUntil(conversation.me.mutedUntil, locale);
                  return until ? copy.panel.mutedUntil(until) : copy.panel.mutedForever;
                })()}
              </p>
              <button type="button" className="clinical-button w-full" disabled={update.isPending}
                onClick={() => run(update.mutateAsync({ mutedUntil: null }))}>
                <BellRing size={15} strokeWidth={1.8} aria-hidden="true" />
                {copy.panel.unmute}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={copy.panel.mute}>
              {MUTE_OPTIONS.map((option) => (
                <button key={option} type="button" className="clinical-button min-h-9 text-xs" disabled={update.isPending}
                  onClick={() => run(update.mutateAsync({ mutedUntil: mutedUntilFor(option) }))}>
                  {copy.panel.muteOptions[option]}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          {canArchive && conversation.me.status === "ACTIVE" ? (
            <button type="button" className="clinical-button w-full" disabled={update.isPending}
              onClick={() => run(update.mutateAsync({ archived: !conversation.archivedAt }))}>
              {conversation.archivedAt ? <ArchiveRestore size={15} strokeWidth={1.8} aria-hidden="true" /> : <Archive size={15} strokeWidth={1.8} aria-hidden="true" />}
              {conversation.archivedAt ? copy.panel.unarchive : copy.panel.archive}
            </button>
          ) : null}
          {other ? (
            blocked ? (
              <button type="button" className="clinical-button w-full" disabled={blocks.unblock.isPending}
                onClick={() => run(blocks.unblock.mutateAsync(other.userId))}>
                <Ban size={15} strokeWidth={1.8} aria-hidden="true" />
                {copy.panel.unblock(other.fullName)}
              </button>
            ) : (
              <button type="button" className="clinical-button w-full text-[var(--danger-ink)]" onClick={() => setConfirm("block")}>
                <Ban size={15} strokeWidth={1.8} aria-hidden="true" />
                {copy.panel.block(other.fullName)}
              </button>
            )
          ) : null}
          {isGroup && conversation.me.status === "ACTIVE" ? (
            <button type="button" className={cn("clinical-button w-full text-[var(--danger-ink)]")} onClick={() => setConfirm("leave")}>
              <LogOut size={15} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
              {copy.panel.leave}
            </button>
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={confirm === "leave"}
        title={copy.panel.leave}
        body={copy.panel.leaveConfirm}
        confirmLabel={copy.panel.leave}
        cancelLabel={copy.panel.cancel}
        danger
        busy={members.remove.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          run(members.remove.mutateAsync(myUserId), onLeft);
        }}
      />
      <ConfirmDialog
        open={confirm === "block" && Boolean(other)}
        title={other ? copy.panel.block(other.fullName) : ""}
        body={copy.panel.blockConfirm}
        confirmLabel={copy.thread.block}
        cancelLabel={copy.panel.cancel}
        danger
        busy={blocks.block.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          if (other) run(blocks.block.mutateAsync(other.userId));
        }}
      />
    </aside>
  );
}
