"use client";

import { Send, XCircle } from "lucide-react";
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
import { InviteDrawer } from "./InviteDrawer";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      >
        {canManage ? (
          <div className="mb-4">
            <button
              className="clinical-button clinical-button-primary text-xs"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              {t("team.members.invite")}
            </button>
          </div>
        ) : null}
        {drawerOpen ? (
          <InviteDrawer
            canInviteAdmin={capabilities.includes("team.inviteAdmin")}
            mutation={actions.createInvitation}
            onClosed={() => setDrawerOpen(false)}
            onInvited={(email) =>
              setNotice({
                message: t("team.notices.invited", { email }),
                tone: "success",
              })
            }
            t={t}
          />
        ) : null}
        <div className="divide-y divide-[var(--line-soft)]">
          {(invitations ?? []).length === 0 ? (
            <p className="py-4 text-xs text-[var(--text-secondary)]">
              {t("team.invitations.empty")}
            </p>
          ) : (
            (invitations ?? []).map((invitation) => (
              <article
                className="flex flex-col gap-3 py-4"
                data-invitation-id={invitation.id}
                key={invitation.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-sm font-semibold text-[var(--text-primary)]"
                    dir="ltr"
                  >
                    {invitation.email}
                  </span>
                  <StatusBadge
                    label={t(`team.members.roles.${invitation.role}`)}
                    tone={memberRoleTone(invitation.role)}
                  />
                  <StatusBadge
                    label={t(`team.invitations.statuses.${invitation.status}`)}
                    tone={invitationStatusTone(invitation.status)}
                  />
                </div>
                <div className="text-xs leading-5 text-[var(--text-secondary)]">
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
                  {invitation.invitedByFullName ? (
                    <p>
                      {t("team.invitations.sentBy", {
                        name: invitation.invitedByFullName,
                      })}
                    </p>
                  ) : null}
                </div>
                {canManage &&
                (invitation.status === "PENDING" ||
                  invitation.status === "EXPIRED") ? (
                  <div className="flex flex-wrap items-center gap-2">
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
                        className="clinical-button text-xs"
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
      </SectionCard>
      {notice ? (
        <InlineMessage message={notice.message} tone={notice.tone} />
      ) : null}
    </div>
  );
}
