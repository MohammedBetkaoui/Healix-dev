"use client";

import { type UseMutationResult } from "@tanstack/react-query";
import { Ban, KeyRound, RotateCcw } from "lucide-react";
import { useState } from "react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { classifyTeamError } from "../utils/team-errors";
import {
  formatTeamDate,
  memberRoleTone,
  memberStatusTone,
  verificationStatusTone,
} from "../utils/team-utils";
import { type TeamMember, type TeamUsage } from "../types/team.types";
import { InlineMessage, SectionCard, StatusBadge } from "./TeamStateViews";

type MemberStatusOutcome = { membershipId: string; accountStatus: string };

// The three mutations a member row carries: one membership id goes in, each
// answers its small outcome object (and re-reads the list through the query
// invalidations of the hook).
export type TeamMemberActions = {
  reactivateMember: UseMutationResult<MemberStatusOutcome, Error, string>;
  sendPasswordReset: UseMutationResult<{ message: string }, Error, string>;
  suspendMember: UseMutationResult<MemberStatusOutcome, Error, string>;
};

type MembersSectionProps = {
  actions: TeamMemberActions;
  capabilities: readonly string[];
  locale: Locale;
  members: readonly TeamMember[];
  scope: "FULL" | "BASIC";
  selfUserId: string | null;
  t: TranslationFunction;
  usage: TeamUsage | null;
};

// The roles the actor's workspace role may act on, as the server decides:
// OWNER → ADMIN + DOCTOR, ADMIN → DOCTOR only. The owner role itself is never
// a target.
function targetableRolesOf(selfRole: string): string[] {
  if (selfRole === "OWNER") return ["ADMIN", "DOCTOR", "RECEPTIONIST"];
  return ["DOCTOR", "RECEPTIONIST"];
}

export function MembersSection({
  actions,
  capabilities,
  locale,
  members,
  scope,
  selfUserId,
  t,
  usage,
}: MembersSectionProps) {
  const [notice, setNotice] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const accept = (message: string) => setNotice({ message, tone: "success" });
  const refuse = (error: unknown) =>
    setNotice({
      message: t(`team.errors.${classifyTeamError(error).key}`),
      tone: "error",
    });

  return (
    <div className="space-y-5">
      <SectionCard
        title={t("team.members.title")}
        description={t("team.members.subtitle")}
      >
        <div className="divide-y divide-[var(--line-soft)]">
          {members.map((member) => (
            <MemberRow
              key={member.membershipId}
              actions={actions}
              canSuspendAction={capabilities.includes("team.suspendMember")}
              canResetAction={capabilities.includes("team.sendPasswordReset")}
              isSelf={member.userId === selfUserId}
              locale={locale}
              member={member}
              onFail={refuse}
              onSucceed={accept}
              scope={scope}
              selfMembershipRole={
                members.find((own) => own.userId === selfUserId)?.role ?? null
              }
              t={t}
            />
          ))}
        </div>
        {usage ? (
          <p className="mt-4 border-t border-[var(--line-soft)] pt-3 text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">
              {t("team.members.usage.label")} :{" "}
            </span>
            {usage.maxDoctors === null
              ? t("team.members.usage.unlimited", {
                  active: usage.activeDoctors,
                })
              : t("team.members.usage.limited", {
                  active: usage.activeDoctors,
                  max: usage.maxDoctors,
                })}
          </p>
        ) : null}
      </SectionCard>
      {notice ? (
        <InlineMessage message={notice.message} tone={notice.tone} />
      ) : null}
    </div>
  );
}

type MemberRowProps = {
  actions: TeamMemberActions;
  canResetAction: boolean;
  canSuspendAction: boolean;
  isSelf: boolean;
  locale: Locale;
  member: TeamMember;
  onFail: (error: unknown) => void;
  onSucceed: (message: string) => void;
  scope: "FULL" | "BASIC";
  selfMembershipRole: string | null;
  t: TranslationFunction;
};

function MemberRow({
  actions,
  canResetAction,
  canSuspendAction,
  isSelf,
  locale,
  member,
  onFail,
  onSucceed,
  scope,
  selfMembershipRole,
  t,
}: MemberRowProps) {
  // The server alone decides; the interface hides what it would refuse. A
  // signed-out actor reads as an administrator (the page asks for one role
  // only), and the own row never carries actions against itself.
  const actorRole = selfMembershipRole ?? "ADMIN";
  const targetableRoles = targetableRolesOf(actorRole);
  const targetable =
    !isSelf && member.role !== "OWNER" && targetableRoles.includes(member.role);

  const canSuspend =
    canSuspendAction && targetable && member.accountStatus === "ACTIVE";
  const canReactivate =
    canSuspendAction && targetable && member.accountStatus === "SUSPENDED";
  // A reset link goes to a member whose account is ACTIVE with a verified
  // e-mail: the server refuses the owner, the suspended and the unverified.
  const canReset =
    canResetAction &&
    targetable &&
    member.accountStatus === "ACTIVE" &&
    member.isEmailVerified;

  return (
    <article
      className="flex flex-col gap-3 py-4"
      data-member-id={member.membershipId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-sm font-semibold text-[var(--text-primary)]"
          dir="auto"
        >
          {member.fullName}
        </span>
        {isSelf ? (
          <StatusBadge label={t("team.members.you")} tone="success" />
        ) : null}
        <StatusBadge
          label={t(`team.members.roles.${member.role}`)}
          tone={memberRoleTone(member.role)}
        />
        <StatusBadge
          label={t(`team.members.accountStatuses.${member.accountStatus}`)}
          tone={memberStatusTone(member.accountStatus)}
        />
        {member.isEmailVerified ? null : (
          <StatusBadge
            label={t("team.members.emailNotVerified")}
            tone="warning"
          />
        )}
      </div>

      <div className="text-xs leading-5 text-[var(--text-secondary)]">
        <p dir="ltr">
          {scope === "FULL"
            ? (member.email ?? t("team.members.emailHidden"))
            : t("team.members.emailHidden")}
        </p>
        <p>
          {t("team.members.joinedOn", {
            date: formatTeamDate(member.joinedAt, locale),
          })}
        </p>
        {member.doctor ? (
          <p>
            {t("team.members.doctor.speciality")} : {member.doctor.speciality} —{" "}
            {t("team.members.doctor.wilaya")} : {member.doctor.wilaya}{" "}
            <StatusBadge
              label={t(
                `account.profile.verificationStatuses.${member.doctor.verificationStatus}`,
              )}
              tone={verificationStatusTone(member.doctor.verificationStatus)}
            />
          </p>
        ) : null}
      </div>

      {canSuspend || canReactivate || canReset ? (
        <div className="flex flex-wrap items-center gap-2">
          {canSuspend ? (
            <button
              className="clinical-button text-xs"
              disabled={actions.suspendMember.isPending}
              onClick={() =>
                actions.suspendMember.mutate(member.membershipId, {
                  onError: onFail,
                  onSuccess: () => onSucceed(t("team.notices.suspended")),
                })
              }
              title={t("team.members.actions.suspendNote")}
            >
              <Ban
                size={13}
                className="me-1 inline"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              {t("team.members.actions.suspend")}
            </button>
          ) : null}
          {canReactivate ? (
            <button
              className="clinical-button text-xs"
              disabled={actions.reactivateMember.isPending}
              onClick={() =>
                actions.reactivateMember.mutate(member.membershipId, {
                  onError: onFail,
                  onSuccess: () => onSucceed(t("team.notices.reactivated")),
                })
              }
            >
              <RotateCcw
                size={13}
                className="me-1 inline"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              {t("team.members.actions.reactivate")}
            </button>
          ) : null}
          {canReset ? (
            <button
              className="clinical-button text-xs"
              disabled={actions.sendPasswordReset.isPending}
              onClick={() =>
                actions.sendPasswordReset.mutate(member.membershipId, {
                  onError: onFail,
                  onSuccess: () => onSucceed(t("team.notices.resetSent")),
                })
              }
              title={t("team.members.actions.resetLinkNote")}
            >
              <KeyRound
                size={13}
                className="me-1 inline"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              {t("team.members.actions.resetLink")}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
