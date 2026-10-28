"use client";

import {
  Building2,
  Clock3,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { useTeam, useTeamMutations } from "../hooks/use-team";
import { classifyTeamError } from "../utils/team-errors";
import { TEAM_TABS, type TeamTab, parseTeamTab } from "../utils/team-utils";
import { InvitationsSection } from "./InvitationsSection";
import { InviteDrawer } from "./InviteDrawer";
import { MembersSection } from "./MembersSection";
import { RolesAndAccessSection } from "./RolesAndAccessSection";
import { InlineMessage, TeamErrorState, TeamSkeleton } from "./TeamStateViews";

const TAB_ICONS: Record<TeamTab, typeof ShieldCheck> = {
  invitations: UserRoundPlus,
  members: UserRound,
  roles: ShieldCheck,
};

const teamTabHref = (tab: TeamTab) =>
  tab === "members" ? "/establishment/team" : `/establishment/team?tab=${tab}`;

export function TeamPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const account = useAccountProfile();
  const query = useTeam();
  const mutations = useTeamMutations();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const initials = getAccountInitials(currentUser.data?.fullName);
  // The address names the section (`?tab=invitations`): it can be shared.
  const tab = parseTeamTab(useSearchParams()?.get("tab"));
  const activeMembers =
    query.data?.members.filter((member) => member.accountStatus === "ACTIVE")
      .length ?? 0;
  const pendingInvitations =
    query.data?.invitations?.filter(
      (invitation) => invitation.status === "PENDING",
    ).length ?? 0;

  return (
    <DashboardShell
      accountType="ESTABLISHMENT"
      activeKey="team"
      breadcrumbLabel={t("team.page.breadcrumb")}
      navSections={establishmentNavSections}
      titleKey="team.page.title"
      user={{
        accountType: "ESTABLISHMENT",
        footerSubtitle: t("dashboard.clinical.administration"),
        initials,
        name:
          currentUser.data?.fullName || t("dashboard.clinical.administration"),
        roleKey: "dashboard.common.roles.establishment",
        workspaceSubtitle:
          account.data?.establishment?.name ||
          t("dashboard.clinical.workspace"),
      }}
    >
      <div className="workspace-stack team-workspace">
        <header className="team-page-heading">
          <div className="min-w-0">
            <p className="team-workspace-label">
              <Building2 size={14} strokeWidth={1.7} aria-hidden="true" />
              <span dir="auto">
                {account.data?.establishment?.name ||
                  t("dashboard.clinical.workspace")}
              </span>
            </p>
            <h1>{t("team.page.title")}</h1>
            <p className="team-page-description">{t("team.page.subtitle")}</p>
          </div>
          {query.data?.capabilities.includes("team.revokeInvitation") ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="clinical-button clinical-button-primary shrink-0 self-start lg:self-auto"
            >
              <UserRoundPlus size={16} strokeWidth={1.8} aria-hidden="true" />
              {t("team.members.invite")}
            </button>
          ) : null}
        </header>

        {inviteNotice ? (
          <InlineMessage message={inviteNotice} tone="success" />
        ) : null}

        {query.data ? (
          <section
            className="team-overview"
            aria-label={t("team.page.overview")}
          >
            <div className="team-summary-card">
              <div className="team-summary-heading">
                <p>{t("team.page.activeMembers")}</p>
                <UsersRound size={17} strokeWidth={1.7} aria-hidden="true" />
              </div>
              <p className="team-summary-value">
                {activeMembers}
                <span className="team-summary-suffix">
                  / {query.data.members.length}
                </span>
              </p>
              <p className="team-summary-caption">
                {t("team.page.membersHint")}
              </p>
            </div>
            {query.data.usage ? (
              <div className="team-summary-card">
                <div className="team-summary-heading">
                  <p>{t("team.members.usage.label")}</p>
                  <Stethoscope size={17} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <div className="team-capacity-line">
                  <p className="team-summary-value">
                    {query.data.usage.activeDoctors}
                    <span className="team-summary-suffix">
                      {query.data.usage.maxDoctors === null
                        ? t("team.page.unlimited")
                        : `/ ${query.data.usage.maxDoctors}`}
                    </span>
                  </p>
                  {query.data.usage.maxDoctors !== null ? (
                    <span className="team-capacity-track" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, (query.data.usage.activeDoctors / Math.max(1, query.data.usage.maxDoctors)) * 100)}%`,
                        }}
                      />
                    </span>
                  ) : null}
                </div>
                <p className="team-summary-caption">
                  {t("team.page.doctorsHint")}
                </p>
              </div>
            ) : null}
            {query.data.invitations ? (
              <div className="team-summary-card">
                <div className="team-summary-heading">
                  <p>{t("team.page.pendingInvitations")}</p>
                  <Clock3 size={17} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <p className="team-summary-value">{pendingInvitations}</p>
                <p className="team-summary-caption">
                  {t("team.page.invitationsHint")}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="team-content">
          <nav aria-label={t("team.tabs.label")} className="team-tabs">
            <ul>
              {TEAM_TABS.map((entry) => {
                const Icon = TAB_ICONS[entry];
                const active = entry === tab;
                return (
                  <li key={entry}>
                    <Link
                      href={teamTabHref(entry)}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className="team-tab"
                    >
                      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                      {t(`team.tabs.${entry}`)}
                      {entry === "members" && query.data ? (
                        <span className="team-tab-count">
                          {query.data.members.length}
                        </span>
                      ) : null}
                      {entry === "invitations" && pendingInvitations > 0 ? (
                        <span className="team-tab-count" data-pending>
                          {pendingInvitations}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div id={`team-panel-${tab}`}>
            {query.isLoading ? <TeamSkeleton t={t} /> : null}
            {!query.isLoading && (query.isError || !query.data) ? (
              <TeamErrorState
                errorKey={classifyTeamError(query.error).key}
                onRetry={() => void query.refetch()}
                t={t}
              />
            ) : null}
            {query.data ? (
              <>
                {tab === "members" ? (
                  <MembersSection
                    actions={mutations}
                    capabilities={query.data.capabilities}
                    locale={locale}
                    members={query.data.members}
                    scope={query.data.scope}
                    selfUserId={currentUser.data?.id ?? null}
                    t={t}
                    usage={query.data.usage}
                  />
                ) : null}
                {tab === "invitations" ? (
                  <InvitationsSection
                    actions={mutations}
                    capabilities={query.data.capabilities}
                    invitations={query.data.invitations}
                    locale={locale}
                    t={t}
                  />
                ) : null}
                {tab === "roles" ? (
                  <RolesAndAccessSection locale={locale} t={t} />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {inviteOpen ? (
          <InviteDrawer
            canInviteAdmin={
              query.data?.capabilities.includes("team.inviteAdmin") ?? false
            }
            mutation={mutations.createInvitation}
            onClosed={() => setInviteOpen(false)}
            onInvited={(email) =>
              setInviteNotice(t("team.notices.invited", { email }))
            }
            t={t}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
