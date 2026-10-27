"use client";

import { ShieldCheck, UserRound, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { useTeam, useTeamMutations } from "../hooks/use-team";
import { classifyTeamError } from "../utils/team-errors";
import { TEAM_TABS, type TeamTab, parseTeamTab } from "../utils/team-utils";
import { InvitationsSection } from "./InvitationsSection";
import { MembersSection } from "./MembersSection";
import { RolesAndAccessSection } from "./RolesAndAccessSection";
import { TeamErrorState, TeamSkeleton } from "./TeamStateViews";

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
  const prefill = useEstablishmentVerificationPrefill({ enabled: true });
  const query = useTeam();
  const mutations = useTeamMutations();
  const initials = getAccountInitials(currentUser.data?.fullName);
  // The address names the section (`?tab=invitations`): it can be shared.
  const tab = parseTeamTab(useSearchParams()?.get("tab"));

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
          prefill.data?.establishment.name || t("dashboard.clinical.workspace"),
      }}
    >
      <div className="workspace-stack">
        <header>
          <p className="text-[0.7rem] font-semibold text-[var(--medical)]">
            {t("team.page.breadcrumb")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[1.75rem]">
            {t("team.page.title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
            {t("team.page.subtitle")}
          </p>
        </header>

        <nav
          aria-label={t("team.tabs.label")}
          className="-mx-1 overflow-x-auto px-1"
        >
          <ul className="flex min-w-max gap-1 border-b border-[var(--border)]">
            {TEAM_TABS.map((entry) => {
              const Icon = TAB_ICONS[entry];
              const active = entry === tab;
              return (
                <li key={entry}>
                  <Link
                    href={teamTabHref(entry)}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${active ? "border-[var(--accent)] text-[var(--accent-dark)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  >
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    {t(`team.tabs.${entry}`)}
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
    </DashboardShell>
  );
}
