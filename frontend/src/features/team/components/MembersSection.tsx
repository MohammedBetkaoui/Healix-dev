"use client";

import { type UseMutationResult } from "@tanstack/react-query";
import {
  Ban,
  ChevronDown,
  KeyRound,
  MoreHorizontal,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";

import { type Locale } from "@/i18n";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { type TranslationFunction } from "@/lib/i18n";

import { classifyTeamError } from "../utils/team-errors";
import {
  formatTeamDate,
  memberStatusTone,
  verificationStatusTone,
} from "../utils/team-utils";
import { type TeamMember, type TeamUsage } from "../types/team.types";
import { InlineMessage, SectionCard, StatusBadge } from "./TeamStateViews";
import { filterTeamMembers } from "../utils/filter-team-members";

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
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
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
  const filteredMembers = filterTeamMembers(members, {
    search,
    role,
    status,
    scope,
  });
  const selfMembershipRole =
    members.find((member) => member.userId === selfUserId)?.role ?? null;
  const hasFilters = search !== "" || role !== "" || status !== "";
  const resetFilters = () => {
    setSearch("");
    setRole("");
    setStatus("");
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title={t("team.members.title")}
        description={t("team.members.subtitle")}
        count={members.length}
      >
        <div
          className="team-toolbar"
          role="search"
          aria-label={t("team.members.filters.label")}
        >
          <label className="team-search">
            <Search size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">{t("team.members.filters.search")}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("team.members.filters.search")}
            />
          </label>
          <div className="team-filters">
            <SlidersHorizontal
              size={15}
              aria-hidden="true"
              className="team-filter-icon"
            />
            <label className="team-select">
              <span className="sr-only">{t("team.members.columns.role")}</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="">{t("team.members.filters.allRoles")}</option>
                {(["OWNER", "ADMIN", "DOCTOR", "RECEPTIONIST"] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {t(`team.members.roles.${value}`)}
                    </option>
                  ),
                )}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="team-select">
              <span className="sr-only">
                {t("team.members.columns.status")}
              </span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">
                  {t("team.members.filters.allStatuses")}
                </option>
                <option value="ACTIVE">
                  {t("team.members.accountStatuses.ACTIVE")}
                </option>
                <option value="SUSPENDED">
                  {t("team.members.accountStatuses.SUSPENDED")}
                </option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            {hasFilters ? (
              <button
                type="button"
                className="team-clear-filters"
                onClick={resetFilters}
                aria-label={t("team.members.filters.clear")}
                title={t("team.members.filters.clear")}
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <table className="team-directory">
          <caption className="sr-only">{t("team.members.title")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("team.members.columns.member")}</th>
              <th scope="col">{t("team.members.columns.role")}</th>
              <th scope="col">{t("team.members.columns.status")}</th>
              <th scope="col">
                <span className="sr-only">
                  {t("team.members.columns.actions")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => (
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
                selfMembershipRole={selfMembershipRole}
                t={t}
              />
            ))}
          </tbody>
        </table>
        {filteredMembers.length === 0 ? (
          <div className="team-empty">
            {hasFilters ? (
              <Search size={24} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <UsersRound size={24} strokeWidth={1.5} aria-hidden="true" />
            )}
            <p>
              {t(
                hasFilters
                  ? "team.members.filters.noResults"
                  : "team.members.empty",
              )}
            </p>
            {hasFilters ? (
              <button
                type="button"
                className="clinical-button"
                onClick={resetFilters}
              >
                {t("team.members.filters.clear")}
              </button>
            ) : null}
          </div>
        ) : null}
        <footer className="team-directory-footer">
          <p role="status">
            {t("team.members.filters.results", {
              count: filteredMembers.length,
              total: members.length,
            })}
          </p>
          {usage ? (
            <p className="team-plan-note">
              <Stethoscope size={14} aria-hidden="true" />
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
        </footer>
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
    <tr
      className="team-member-row"
      data-member-id={member.membershipId}
      data-suspended={member.accountStatus === "SUSPENDED" || undefined}
    >
      <td>
        <div className="team-member-identity">
          <span
            className="team-avatar"
            data-role={member.role}
            aria-hidden="true"
          >
            {getAccountInitials(
              member.fullName.replace(/^Dr\.?\s+/i, ""),
            ).toLocaleUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-sm font-semibold text-[var(--text-primary)]"
                dir="auto"
              >
                {member.fullName}
              </span>
              {isSelf ? (
                <span className="team-self-label">{t("team.members.you")}</span>
              ) : null}
            </div>
            <p
              className="mt-1 break-all text-xs text-[var(--text-secondary)]"
              dir="ltr"
            >
              {scope === "FULL"
                ? (member.email ?? t("team.members.emailHidden"))
                : t("team.members.emailHidden")}
            </p>
            <p className="team-joined">
              {t("team.members.joinedOn", {
                date: formatTeamDate(member.joinedAt, locale),
              })}
            </p>
          </div>
        </div>
      </td>

      <td className="team-member-details">
        <p className="team-role-label">
          {member.role === "DOCTOR" ? (
            <Stethoscope size={14} aria-hidden="true" />
          ) : (
            <ShieldCheck size={14} aria-hidden="true" />
          )}
          {t(`team.members.roles.${member.role}`)}
        </p>
        {member.doctor ? (
          <div className="team-doctor-details">
            <p dir="auto">
              {member.doctor.speciality ||
                t("team.members.doctor.profilePending")}
              {member.doctor.wilaya ? ` · ${member.doctor.wilaya}` : ""}
            </p>
            <StatusBadge
              label={t(
                `account.profile.verificationStatuses.${member.doctor.verificationStatus}`,
              )}
              tone={verificationStatusTone(member.doctor.verificationStatus)}
            />
          </div>
        ) : null}
      </td>
      <td className="team-member-status">
        <StatusBadge
          label={t(`team.members.accountStatuses.${member.accountStatus}`)}
          tone={memberStatusTone(member.accountStatus)}
          dot
        />
        {!member.isEmailVerified ? (
          <p className="team-email-warning">
            {t("team.members.emailNotVerified")}
          </p>
        ) : null}
      </td>

      <td className="team-actions-cell">
        {canSuspend || canReactivate || canReset ? (
          <details
            className="team-member-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
          >
            <summary
              aria-label={t("team.members.actions.manage", {
                name: member.fullName,
              })}
            >
              <MoreHorizontal size={19} aria-hidden="true" />
            </summary>
            <div className="team-member-actions">
              {canSuspend ? (
                <button
                  type="button"
                  className="team-menu-action team-action-danger"
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
                  type="button"
                  className="team-menu-action"
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
                  type="button"
                  className="team-menu-action"
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
          </details>
        ) : null}
      </td>
    </tr>
  );
}
