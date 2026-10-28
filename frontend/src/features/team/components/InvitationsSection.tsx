"use client";

import { Clock3, Mail, Send, XCircle } from "lucide-react";
import { useState } from "react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type TeamInvitation } from "../types/team.types";
import { classifyTeamError } from "../utils/team-errors";
import {
  formatTeamDate,
  invitationStatusTone,
  memberRoleTone,
} from "../utils/team-utils";
import { type TeamActions } from "./team-actions";
import { InlineMessage, SectionCard, StatusBadge } from "./TeamStateViews";

type InvitationsSectionProps = {
  actions: Pick<
    TeamActions,
    "createInvitation" | "resendInvitation" | "revokeInvitation"
  >;
  capabilities: readonly string[];
  invitations: readonly TeamInvitation[] | null;
  locale: Locale;
  t: TranslationFunction;
};

export function InvitationsSection({
  actions,
  capabilities,
  invitations,
  locale,
  t,
}: InvitationsSectionProps) {
  const [notice, setNotice] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);

  // Resend and revoke are decided by the server per invitation role: the
  // interface only opens the door when the actor can govern invitations.
  const canManage = capabilities.includes("team.revokeInvitation");

  const onResend = (invitation: TeamInvitation) =>
    actions.resendInvitation.mutate(invitation.id, {
      onError: (error) =>
        setNotice({
          message: t(`team.errors.${classifyTeamError(error).key}`),
          tone: "error",
        }),
      onSuccess: () =>
        setNotice({
          message: t("team.notices.resent", { email: invitation.email }),
          tone: "success",
        }),
    });

  const onRevoke = (invitation: TeamInvitation) =>
    actions.revokeInvitation.mutate(invitation.id, {
      onError: (error) =>
        setNotice({
          message: t(`team.errors.${classifyTeamError(error).key}`),
          tone: "error",
        }),
      onSuccess: () =>
        setNotice({ message: t("team.notices.revoked"), tone: "success" }),
    });

  return (
    <div className="space-y-5">
      <SectionCard
        title={t("team.invitations.title")}
        description={t("team.invitations.subtitle")}
        count={invitations?.length ?? 0}
      >
        <div className="team-invitation-list">
          {(invitations?.length ?? 0) > 0 ? (
            <div className="team-invitation-head" aria-hidden="true">
              <span>{t("team.invitations.recipient")}</span>
              <span>{t("team.invitations.tracking")}</span>
              <span>{t("team.members.columns.actions")}</span>
            </div>
          ) : null}
          {(invitations ?? []).length === 0 ? (
            <div className="team-empty">
              <Mail size={26} strokeWidth={1.5} aria-hidden="true" />
              <p>{t("team.invitations.empty")}</p>
              <span>{t("team.invitations.emptyHint")}</span>
            </div>
          ) : (
            (invitations ?? []).map((invitation) => (
              <article
                className="team-invitation-row"
                data-invitation-id={invitation.id}
                key={invitation.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="team-avatar" aria-hidden="true">
                    <Mail size={18} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <span
                      className="block break-all text-sm font-semibold text-[var(--text-primary)]"
                      dir="ltr"
                    >
                      {invitation.email}
                    </span>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        label={t(`team.members.roles.${invitation.role}`)}
                        tone={memberRoleTone(invitation.role)}
                      />
                    </div>
                    {invitation.invitedByFullName ? (
                      <p className="team-joined">
                        {t("team.invitations.sentBy", {
                          name: invitation.invitedByFullName,
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="team-invitation-tracking">
                  <StatusBadge
                    label={t(`team.invitations.statuses.${invitation.status}`)}
                    tone={invitationStatusTone(invitation.status)}
                    dot
                  />
                  <p>
                    {t("team.invitations.sentOn", {
                      date: formatTeamDate(invitation.createdAt, locale),
                    })}
                  </p>
                  <p>
                    {t("team.invitations.expiresOn", {
                      date: formatTeamDate(invitation.expiresAt, locale),
                    })}
                  </p>
                </div>
                {canManage &&
                (invitation.status === "PENDING" ||
                  invitation.status === "EXPIRED") ? (
                  <div className="team-invitation-actions">
                    <button
                      className="clinical-button text-xs"
                      disabled={actions.resendInvitation.isPending}
                      onClick={() => onResend(invitation)}
                      title={t("team.invitations.actions.resendNote")}
                      type="button"
                    >
                      <Send
                        size={13}
                        className="me-1 inline"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      {t("team.invitations.actions.resend")}
                    </button>
                    {invitation.status === "PENDING" ? (
                      <button
                        className="clinical-button team-action-danger text-xs"
                        disabled={actions.revokeInvitation.isPending}
                        onClick={() => onRevoke(invitation)}
                        title={t("team.invitations.actions.revokeNote")}
                        type="button"
                      >
                        <XCircle
                          size={13}
                          className="me-1 inline"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        {t("team.invitations.actions.revoke")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
        <footer className="team-directory-footer">
          <p className="team-plan-note">
            <Clock3 size={14} aria-hidden="true" />
            {t("team.invitations.validity")}
          </p>
        </footer>
      </SectionCard>
      {notice ? (
        <InlineMessage message={notice.message} tone={notice.tone} />
      ) : null}
    </div>
  );
}
