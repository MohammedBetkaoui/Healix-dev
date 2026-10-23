"use client";

import { LogOut, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { useAccountSessions, useRevokeAccountSession, useRevokeOtherAccountSessions } from "../hooks/use-account";
import { type AccountSession } from "../types/account.types";
import { classifyAccountError } from "../utils/account-errors";
import { formatDateTime, sessionDeviceLabel } from "../utils/account-utils";
import { AccountErrorState, AccountSkeleton, InlineMessage, SectionCard } from "./AccountStateViews";

const isMobile = (session: AccountSession) => session.os === "iOS" || session.os === "Android";

export function SessionsList({ locale, t }: { locale: Locale; t: TranslationFunction }) {
  const query = useAccountSessions();
  const revoke = useRevokeAccountSession();
  const revokeOthers = useRevokeOtherAccountSessions();
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const sessions = query.data ?? [];
  const others = sessions.filter((session) => !session.current);
  const busy = revoke.isPending || revokeOthers.isPending;

  const fail = (error: unknown) => setNotice({ message: t(`account.errors.${classifyAccountError(error).key}`), tone: "error" });

  return (
    <SectionCard title={t("account.security.sessions.title")} description={t("account.security.sessions.subtitle")}>
      {query.isLoading ? <AccountSkeleton t={t} /> : query.isError ? (
        <AccountErrorState errorKey={classifyAccountError(query.error).key} onRetry={() => void query.refetch()} t={t} />
      ) : (
        <div className="space-y-4">
          {sessions.length === 0 ? <p className="text-xs text-[var(--text-secondary)]">{t("account.security.sessions.empty")}</p> : (
            <ul aria-label={t("account.security.sessions.list")} className="divide-y divide-[var(--line-soft)] rounded-[var(--radius-sm)] border border-[var(--border)]">
              {sessions.map((session) => {
                const Icon = isMobile(session) ? Smartphone : Monitor;
                return (
                  <li key={session.id} className="flex flex-wrap items-center gap-3 p-3.5">
                    <Icon size={20} strokeWidth={1.6} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                        {sessionDeviceLabel(session, t)}
                        {session.current ? <span className="rounded-full border border-[var(--success-line)] bg-[var(--success-soft)] px-2 py-0.5 text-[0.66rem] font-semibold text-[var(--success-ink)]">{t("account.security.sessions.current")}</span> : null}
                      </p>
                      <p className="mt-0.5 text-[0.72rem] text-[var(--text-secondary)]">
                        {session.ipAddress ? <span dir="ltr">{t("account.security.sessions.ipAddress", { ip: session.ipAddress })}</span> : null}
                        {session.ipAddress ? " · " : null}
                        {t("account.security.sessions.lastActivity", { date: formatDateTime(session.createdAt, locale) })}
                      </p>
                    </div>
                    {session.current ? null : (
                      <button
                        type="button"
                        className="clinical-button"
                        disabled={busy}
                        onClick={() => {
                          setNotice(null);
                          revoke.mutate(session.id, { onError: fail, onSuccess: () => setNotice({ message: t("account.security.sessions.revoked"), tone: "success" }) });
                        }}
                      >
                        <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
                        {revoke.isPending && revoke.variables === session.id ? t("account.security.sessions.revoking") : t("account.security.sessions.revoke")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {notice ? <InlineMessage message={notice.message} tone={notice.tone} /> : null}
          <div className="flex justify-end">
            <button
              type="button"
              className="clinical-button"
              disabled={busy || others.length === 0}
              onClick={() => {
                setNotice(null);
                revokeOthers.mutate(undefined, {
                  onError: fail,
                  onSuccess: ({ revoked }) => setNotice({ message: revoked > 0 ? t("account.security.sessions.revokedOthers", { count: revoked }) : t("account.security.sessions.noOthers"), tone: "success" }),
                });
              }}
            >
              <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
              {revokeOthers.isPending ? t("account.security.sessions.revokingOthers") : t("account.security.sessions.revokeOthers")}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
