"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PanelRight, RotateCcw, WifiOff } from "lucide-react";

import { type Locale } from "@/i18n";
import { caseMessagingCopy } from "@/features/messaging/case-messaging.copy";
import { sendTyping } from "@/features/messaging/messaging.api";
import { type MessagingCopy } from "@/features/messaging/messaging.copy";
import {
  putMessages,
  useAckMessage,
  useAnswerRequest,
  useBlockToggle,
  useDeleteMessage,
  useEditMessage,
  useFileToRecord,
  useMarkRead,
  useMessageSender,
  usePendingMessages,
} from "@/features/messaging/messaging.mutations";
import { useMessages } from "@/features/messaging/messaging.queries";
import {
  ackStateOf,
  buildTimeline,
  canAck,
  canDeleteMessage,
  canEditMessage,
  canFileToRecord,
  composerAvailability,
  filedContentOf,
  messagesOfPages,
  newMessagesSeparatorSeq,
  otherParticipant,
  pinnedReceiptIds,
  receiptOf,
  type TimelineEntry,
} from "@/features/messaging/messaging-rules";
import { type Conversation, type MessageView } from "@/features/messaging/messaging.types";
import { useConversationActivity, useReadTracker } from "@/features/messaging/use-conversation-activity";
import { registerOpenConversation } from "@/lib/realtime/open-conversations";
import { useRealtimeReconnecting } from "@/lib/realtime/use-realtime-events";

import { conversationName, conversationSubtitle } from "./ConversationList";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { MessageLog } from "./MessageLog";
import { CaseNotice, FileToRecordDialog } from "./case-ui";
import { Avatar, ConfirmDialog, PatientDataNotice, RequestBanner, ThreadSkeleton } from "./messaging-ui";
import styles from "./messaging.module.css";

const MAX_PAGES_TO_FIRST_UNREAD = 3;

type ConversationThreadProps = {
  conversation: Conversation;
  myUserId: string;
  blockedUserIds: ReadonlySet<string>;
  copy: MessagingCopy;
  locale: Locale;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onBack: () => void;
  // The request was declined: the conversation is gone for the caller.
  onClosed: () => void;
  errorText: (error: unknown) => string;
};

// To be keyed by the conversation's id: everything starts afresh with each.
export function ConversationThread({
  blockedUserIds,
  conversation,
  copy,
  errorText,
  locale,
  myUserId,
  onBack,
  onClosed,
  onTogglePanel,
  panelOpen,
}: ConversationThreadProps) {
  const queryClient = useQueryClient();
  const conversationId = conversation.id;
  const history = useMessages(conversationId);
  const pending = usePendingMessages(conversationId);
  const sender = useMessageSender();
  const editMessage = useEditMessage(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);
  const markRead = useMarkRead(conversationId);
  const request = useAnswerRequest(conversationId);
  const ack = useAckMessage(conversationId);
  const fileToRecord = useFileToRecord(conversationId);
  const caseCopy = caseMessagingCopy[locale];
  const blocks = useBlockToggle();
  const reconnecting = useRealtimeReconnecting();
  const { readPositions, typingUserIds } = useConversationActivity(conversationId, myUserId);
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [deleting, setDeleting] = useState<MessageView | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [filing, setFiling] = useState<MessageView | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Said to screen readers: an acknowledgement given, a note filed.
  const [announcement, setAnnouncement] = useState("");
  // Fixed when the conversation opens: reading does not move the separator.
  const [openingReadSeq] = useState(conversation.me.lastReadSeq);

  const messages = useMemo(() => messagesOfPages(history.data), [history.data]);
  const timeline = useMemo(() => buildTimeline(messages, pending), [messages, pending]);
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const names = useMemo(
    () => new Map(conversation.participants.map((participant) => [participant.userId, participant.fullName])),
    [conversation.participants],
  );
  const lastSeq = messages.at(-1)?.seq ?? 0;
  // The newest message once the history is up to date (a stale cache is
  // fetched again on opening): those after it arrive while the conversation
  // is open, and get no separator.
  const [openingLastSeq, setOpeningLastSeq] = useState<number | null>(null);
  if (openingLastSeq === null && history.data && !history.isFetching) setOpeningLastSeq(lastSeq);
  const separatorSeq = useMemo(
    () => newMessagesSeparatorSeq(messages, openingReadSeq, myUserId, openingLastSeq ?? lastSeq),
    [lastSeq, messages, myUserId, openingLastSeq, openingReadSeq],
  );
  // Read statuses at all times under my last message and the last of mine
  // seen only; the others on hover or focus.
  const pinnedReceipts = useMemo(
    () => pinnedReceiptIds(messages, conversation, myUserId, readPositions),
    [conversation, messages, myUserId, readPositions],
  );
  const availability = composerAvailability(conversation, myUserId, blockedUserIds);
  const other = otherParticipant(conversation, myUserId);
  const isGroup = conversation.type === "GROUP";
  const isCase = conversation.type === "CASE";
  const name = conversationName(conversation, myUserId, copy.list.group, locale);
  const authorName = (senderId: string | null) =>
    senderId === myUserId ? copy.message.you : (senderId && names.get(senderId)) || copy.thread.formerMember;

  // Opening at the first unread message: fetch back until it is loaded, 3
  // pages at most (a long unread history starts with its latest messages).
  const pagesFetchedBack = useRef(0);
  useEffect(() => {
    const oldest = messages[0]?.seq;
    if (
      oldest !== undefined &&
      oldest > openingReadSeq + 1 &&
      history.hasNextPage &&
      !history.isFetchingNextPage &&
      pagesFetchedBack.current < MAX_PAGES_TO_FIRST_UNREAD
    ) {
      pagesFetchedBack.current += 1;
      void history.fetchNextPage();
    }
  }, [history, messages, openingReadSeq]);

  // Catching up with afterSeq after a reconnection or a return to the tab.
  const lastSeqRef = useRef(lastSeq);
  useEffect(() => {
    lastSeqRef.current = lastSeq;
  }, [lastSeq]);
  useEffect(
    () =>
      registerOpenConversation(conversationId, {
        lastSeq: () => lastSeqRef.current,
        onMessages: (incoming) => putMessages(queryClient, conversationId, incoming),
      }),
    [conversationId, queryClient],
  );

  const endRef = useReadTracker({
    lastReadSeq: conversation.me.lastReadSeq,
    markRead: (seq) => markRead.mutate(seq),
    targetSeq: lastSeq,
  });

  const run = (promise: Promise<unknown>, then?: () => void) => {
    setActionError(null);
    promise.then(then, (reason: unknown) => setActionError(errorText(reason)));
  };

  const quoteOf = (replyToId: string | null) => {
    if (!replyToId) return null;
    const quoted = byId.get(replyToId);
    if (!quoted) return { authorName: copy.message.quotedUnavailable, messageId: null, text: "" };
    return {
      authorName: authorName(quoted.senderId),
      messageId: quoted.id,
      text: quoted.deleted ? copy.message.deleted : (quoted.body ?? copy.message.unavailable),
    };
  };

  const jumpTo = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  };

  const renderEntry = (entry: TimelineEntry) => {
    if (entry.kind === "pending") {
      const { pending: item } = entry;
      return (
        <MessageBubble
          kind="pending"
          pending={item}
          mine
          authorName={null}
          quote={quoteOf(item.replyToId)}
          failureText={item.errorCode ? (copy.errors.codes[item.errorCode] ?? null) : null}
          onRetry={() => void sender.retry(conversationId, item.clientMessageId)}
          onDiscard={() => sender.discard(conversationId, item.clientMessageId)}
          onJumpTo={jumpTo}
          copy={copy}
          locale={locale}
        />
      );
    }

    const { message } = entry;
    const mine = message.senderId === myUserId;
    const receipt = mine ? receiptOf(message, conversation, myUserId, readPositions) : null;
    return (
      <MessageBubble
        kind="message"
        message={message}
        mine={mine}
        authorName={(isGroup || isCase) && !mine ? authorName(message.senderId) : null}
        quote={quoteOf(message.replyToId)}
        receipt={receipt ? { pinned: pinnedReceipts.has(message.id), receipt } : null}
        canEdit={canEditMessage(message, myUserId)}
        canDelete={canDeleteMessage(message, myUserId)}
        onReply={() => {
          setEditing(null);
          setReplyTo(message);
        }}
        onEdit={() => {
          setReplyTo(null);
          setEditing(message);
        }}
        onDelete={() => setDeleting(message)}
        ack={
          message.requiresAck
            ? {
                busy: ack.isPending && ack.variables === message.id,
                canAck: canAck(message, myUserId),
                onAck: () =>
                  run(ack.mutateAsync(message.id), () => setAnnouncement(caseCopy.message.acked)),
                state: ackStateOf(message),
              }
            : undefined
        }
        onFileToRecord={canFileToRecord(message, conversation) ? () => {
          setFileError(null);
          setFiling(message);
        } : undefined}
        onJumpTo={jumpTo}
        copy={copy}
        locale={locale}
      />
    );
  };

  const typingNames = typingUserIds.map((userId) => names.get(userId)).filter((value): value is string => Boolean(value));

  return (
    <section aria-label={name} className={styles.thread}>
      <header className={styles.threadHeader}>
        <button type="button" className={`${styles.iconButton} ${styles.backButton}`} onClick={onBack} aria-label={copy.thread.back}>
          <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
        </button>
        <Avatar name={name} group={isGroup} />
        <div className="min-w-0 flex-1">
          <h2 className={styles.threadName}><bdi>{name}</bdi></h2>
          <p className={styles.threadSubtitle}>{conversationSubtitle(conversation, myUserId, copy, locale) || copy.workspace.direct}</p>
        </div>
        {reconnecting ? (
          <p role="status" className="flex shrink-0 items-center gap-1.5 text-[.7rem] text-[var(--text-secondary)]">
            <WifiOff size={13} strokeWidth={1.8} aria-hidden="true" />
            {copy.thread.reconnecting}
          </p>
        ) : null}
        <button type="button" className={styles.iconButton} onClick={onTogglePanel} aria-label={copy.thread.details}
          aria-expanded={panelOpen} title={copy.thread.details}>
          <PanelRight size={18} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
        </button>
      </header>

      {isCase ? <CaseNotice text={caseCopy.thread.caseNotice} /> : <PatientDataNotice text={copy.thread.patientNotice} />}
      {conversation.me.status === "PENDING" && other ? (
        <RequestBanner
          variant="received"
          text={copy.thread.requestReceived(other.fullName)}
          labels={{ accept: copy.thread.accept, block: copy.thread.block, decline: copy.thread.decline }}
          busy={request.accept.isPending || request.decline.isPending || blocks.block.isPending}
          onAccept={() => run(request.accept.mutateAsync())}
          onDecline={() => run(request.decline.mutateAsync(), onClosed)}
          onBlock={() => setConfirmBlock(true)}
        />
      ) : null}
      {availability.canWrite === false && availability.reason === "awaitingReply" ? (
        <RequestBanner variant="sent" text={copy.thread.requestSent} />
      ) : null}
      {actionError ? (
        <p role="alert" className="border-b border-[var(--danger-line)] bg-[var(--danger-soft)] px-4 py-2 text-xs text-[var(--danger-ink)]">{actionError}</p>
      ) : null}

      {history.isPending ? (
        <ThreadSkeleton />
      ) : history.isError ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-[var(--text-primary)]">{errorText(history.error)}</p>
          <button type="button" className="clinical-button" onClick={() => void history.refetch()}>
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
            {copy.list.retry}
          </button>
        </div>
      ) : (
        <MessageLog
          conversationId={conversationId}
          entries={timeline}
          separatorSeq={separatorSeq}
          hasOlder={history.hasNextPage}
          loadingOlder={history.isFetchingNextPage}
          onLoadOlder={() => void history.fetchNextPage()}
          endRef={endRef}
          renderEntry={renderEntry}
          copy={copy}
          locale={locale}
        />
      )}

      <p aria-live="polite" className={styles.typing}>
        {typingNames.length > 0 ? <><span className={styles.typingDots} aria-hidden="true"><i /><i /><i /></span>{copy.thread.typing(typingNames)}</> : null}
      </p>

      <div className={styles.composerDock}>
        <MessageComposer
          conversationId={conversationId}
          availability={availability}
          copy={copy}
          locale={locale}
          replyTo={replyTo ? { authorName: authorName(replyTo.senderId), text: replyTo.body ?? "" } : null}
          onCancelReply={() => setReplyTo(null)}
          editing={editing ? { body: editing.body ?? "", messageId: editing.id } : null}
          onCancelEdit={() => setEditing(null)}
          onSend={(body, priority, options) => {
            void sender.send(conversationId, {
              attachments: options.attachments,
              body,
              priority,
              replyToId: replyTo?.id ?? null,
              requiresAck: options.requiresAck,
            });
            setReplyTo(null);
          }}
          patientId={isCase ? conversation.patient?.id ?? null : null}
          errorText={errorText}
          onSaveEdit={(messageId, body) => run(editMessage.mutateAsync({ body, messageId }), () => setEditing(null))}
          onTyping={() => void sendTyping(conversationId).catch(() => undefined)}
        />
      </div>

      <p aria-live="polite" className="sr-only">{announcement}</p>
      <FileToRecordDialog
        open={filing !== null}
        content={filing ? filedContentOf(filing, caseCopy.message.attachmentLine) : ""}
        authorName={filing ? authorName(filing.senderId) : ""}
        sentAt={filing?.createdAt ?? new Date(0).toISOString()}
        busy={fileToRecord.isPending}
        error={fileError}
        onCancel={() => setFiling(null)}
        onConfirm={(comment) => {
          const target = filing;
          if (!target) return;
          setFileError(null);
          fileToRecord.mutateAsync({ comment: comment || undefined, messageId: target.id }).then(
            () => {
              setFiling(null);
              setAnnouncement(caseCopy.fileDialog.done);
            },
            (reason: unknown) => setFileError(errorText(reason)),
          );
        }}
        copy={caseCopy}
        locale={locale}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={copy.message.deleteTitle}
        body={copy.message.deleteBody}
        confirmLabel={copy.message.delete}
        cancelLabel={copy.message.cancel}
        danger
        busy={deleteMessage.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) run(deleteMessage.mutateAsync(target.id));
        }}
      />
      <ConfirmDialog
        open={confirmBlock && Boolean(other)}
        title={other ? copy.panel.block(other.fullName) : ""}
        body={copy.panel.blockConfirm}
        confirmLabel={copy.thread.block}
        cancelLabel={copy.panel.cancel}
        danger
        onCancel={() => setConfirmBlock(false)}
        onConfirm={() => {
          setConfirmBlock(false);
          if (other) run(blocks.block.mutateAsync(other.userId), onClosed);
        }}
      />
    </section>
  );
}
