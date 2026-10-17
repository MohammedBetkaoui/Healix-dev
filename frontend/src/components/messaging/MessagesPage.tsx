"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ArrowUpRight, MessageSquarePlus, MessagesSquare, RotateCcw, UsersRound } from "lucide-react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { messagingCopy, type MessagingCopy } from "@/features/messaging/messaging.copy";
import { messagingKeys } from "@/features/messaging/messaging-query-keys";
import { useBlocks, useConversation, useConversations } from "@/features/messaging/messaging.queries";
import { type Conversation, type ConversationFilter, type ConversationPage } from "@/features/messaging/messaging.types";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { ConversationList } from "./ConversationList";
import { ConversationPanel } from "./ConversationPanel";
import { ConversationThread } from "./ConversationThread";
import { NewConversationDialog } from "./NewConversationDialog";
import { ThreadSkeleton } from "./messaging-ui";
import styles from "./messaging.module.css";

type MessagesPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
};

// The message of an API error, in the user's language: the backend's stable
// codes, the network, else a generic one.
export function messagingErrorText(error: unknown, copy: MessagingCopy): string {
  if (!isAxiosError(error)) return copy.errors.generic;
  if (!error.response) return copy.errors.network;
  const code = (error.response.data as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && copy.errors.codes[code]) return copy.errors.codes[code];
  if (error.response.status === 404) return copy.thread.notFound;
  return copy.errors.generic;
}

export function MessagesPage({ accountType }: MessagesPageProps) {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const copy = messagingCopy[locale];
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("c");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [panelOpen, setPanelOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newKind, setNewKind] = useState<"peer" | "group">("peer");
  const myUserId = currentUser.data?.id ?? null;
  const conversations = useConversations("all");
  const conversation = useConversation(selectedId);
  const blocks = useBlocks();
  const blockedUserIds = new Set((blocks.data ?? []).map((entry) => entry.userId));
  const errorText = useCallback((error: unknown) => messagingErrorText(error, copy), [copy]);
  const startConversation = (kind: "peer" | "group" = "peer") => {
    setNewKind(kind);
    setNewOpen(true);
  };

  // ?c=<id>: a link that can be shared, and the browser's back button
  // returns to the previous conversation (pushState keeps useSearchParams in
  // step, without a server round trip).
  const openConversation = useCallback(
    (conversationId: string | null) => {
      setPanelOpen(false);
      window.history.pushState(null, "", conversationId ? `${pathname}?c=${encodeURIComponent(conversationId)}` : pathname);
    },
    [pathname],
  );

  // Every conversation already loaded, whatever its filter.
  const knownConversations = (): Conversation[] =>
    queryClient
      .getQueriesData<InfiniteData<ConversationPage>>({ queryKey: messagingKeys.conversationLists })
      .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? []);

  const initials = getAccountInitials(currentUser.data?.fullName);
  const shellProps =
    accountType === "ESTABLISHMENT"
      ? {
          accountType: "ESTABLISHMENT" as const,
          navSections: establishmentNavSections,
          titleKey: "dashboard.sidebar.establishment.messages",
          user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
        }
      : {
          accountType: "INDEPENDENT_DOCTOR" as const,
          navSections: doctorNavSections,
          titleKey: "dashboard.sidebar.doctor.messages",
          user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
        };

  const thread = (() => {
    if (!selectedId) {
      return (
        <div className={styles.welcome}>
          <div className={styles.welcomeContent}>
            <div className={styles.welcomeSymbol} aria-hidden="true">
              <MessagesSquare size={34} strokeWidth={1.3} />
              <span><UsersRound size={17} strokeWidth={1.6} /></span>
            </div>
            <p className={styles.eyebrow}>{copy.workspace.eyebrow}</p>
            <h2>{copy.thread.selectTitle}</h2>
            <p className={styles.welcomeHint}>{copy.thread.selectHint}</p>
            <div className={styles.welcomeActions}>
              {(["peer", "group"] as const).map((kind) => {
                const Icon = kind === "peer" ? MessageSquarePlus : UsersRound;
                return (
                  <button key={kind} type="button" onClick={() => startConversation(kind)} className={styles.welcomeAction}>
                    <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
                    <span>
                      <strong>{kind === "peer" ? copy.workspace.direct : copy.workspace.group}</strong>
                      <small>{kind === "peer" ? copy.workspace.directHint : copy.workspace.groupHint}</small>
                    </span>
                    <ArrowUpRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
    if (conversation.isPending || !myUserId) return <ThreadSkeleton />;
    if (conversation.isError) {
      return (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-[var(--text-primary)]">{errorText(conversation.error)}</p>
          <div className="flex gap-2">
            <button type="button" className="clinical-button" onClick={() => void conversation.refetch()}>
              <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
              {copy.list.retry}
            </button>
            <button type="button" className="clinical-button lg:hidden" onClick={() => openConversation(null)}>{copy.thread.back}</button>
          </div>
        </div>
      );
    }
    return (
      <ConversationThread
        key={conversation.data.id}
        conversation={conversation.data}
        myUserId={myUserId}
        blockedUserIds={blockedUserIds}
        copy={copy}
        locale={locale}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((value) => !value)}
        onBack={() => openConversation(null)}
        onClosed={() => openConversation(null)}
        errorText={errorText}
      />
    );
  })();

  return (
    <DashboardShell {...shellProps} activeKey="messages">
      {isVerificationRequiredError(conversations.error) ? (
        <VerificationRequiredNotice accountType={accountType} t={t} />
      ) : (
        <div className={styles.workspace}>
          <header className={styles.workspaceHeader}>
            <div className={styles.workspaceIdentity}>
              <span className={styles.workspaceIcon}><MessagesSquare size={21} strokeWidth={1.6} aria-hidden="true" /></span>
              <div>
                <h1>{copy.title}</h1>
                <p>{copy.workspace.subtitle}</p>
              </div>
            </div>
            <button type="button" className={styles.newButton} onClick={() => startConversation()}>
              <MessageSquarePlus size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{copy.list.newConversation}</span>
            </button>
          </header>
          <div className={styles.panes} data-selected={Boolean(selectedId)} data-details={panelOpen}>
          <div className={styles.listPane}>
            <ConversationList
              filter={filter}
              onFilterChange={setFilter}
              selectedId={selectedId}
              onSelect={openConversation}
              onNewConversation={() => startConversation()}
              myUserId={myUserId ?? ""}
              copy={copy}
              locale={locale}
            />
          </div>
          <div className={styles.threadPane}>
            {thread}
          </div>
          {panelOpen && conversation.data && myUserId ? (
            <div className={styles.detailPane}>
              <ConversationPanel
                key={conversation.data.id}
                conversation={conversation.data}
                myUserId={myUserId}
                blockedUserIds={blockedUserIds}
                copy={copy}
                locale={locale}
                onClose={() => setPanelOpen(false)}
                onLeft={() => openConversation(null)}
                errorText={errorText}
              />
            </div>
          ) : null}
          </div>
        </div>
      )}
      <NewConversationDialog
        key={newKind}
        initialTab={newKind}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onOpenConversation={(conversationId) => {
          setNewOpen(false);
          openConversation(conversationId);
        }}
        knownConversations={newOpen ? knownConversations() : []}
        copy={copy}
        direction={direction}
        errorText={errorText}
      />
    </DashboardShell>
  );
}
