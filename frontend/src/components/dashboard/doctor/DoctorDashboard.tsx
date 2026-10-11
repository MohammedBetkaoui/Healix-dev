"use client";

import { BadgeCheck, ClipboardPlus, Plus, ScanLine } from "lucide-react";

import { doctorNavSections } from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { WorkspaceLink } from "@/components/dashboard/layout/WorkspaceLink";
import { CompactQuickActions, type CompactQuickAction } from "@/components/dashboard/shared/CompactQuickActions";
import { DashboardOverviewPanel } from "@/components/dashboard/shared/DashboardOverviewPanel";
import { WorkspaceStatus } from "@/components/dashboard/shared/WorkspaceStatus";
import { getDashboardAccountStatusPresentation } from "@/components/dashboard/shared/account-status-presentation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

const doctorQuickActions: readonly CompactQuickAction[] = [
  { href: "/doctor/patients", icon: ClipboardPlus, key: "addPatient", labelKey: "dashboard.doctor.quickActions.addPatient.label" },
  { href: "/doctor/ai-analyses", icon: ScanLine, key: "newAnalysis", labelKey: "dashboard.doctor.quickActions.newAnalysis.label" },
  { href: "/doctor/verification", icon: BadgeCheck, key: "verification", labelKey: "dashboard.doctor.quickActions.verification.label" },
];

export function DoctorDashboard() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const accountStatus = getDashboardAccountStatusPresentation({
    isLoading: currentUser.isLoading,
    status: currentUser.isError ? undefined : currentUser.data?.accountStatus,
    t,
  });
  const userName = currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace");
  const initials = getAccountInitials(currentUser.data?.fullName);

  return (
    <DashboardShell
      accountType="INDEPENDENT_DOCTOR"
      activeKey="dashboard"
      navSections={doctorNavSections}
      titleKey="dashboard.clinical.title"
      user={{
        accountType: "INDEPENDENT_DOCTOR",
        footerSubtitle: t("dashboard.clinical.doctor.practice"),
        initials,
        name: userName,
        roleKey: "dashboard.common.roles.doctor",
        workspaceSubtitle: t("dashboard.clinical.doctor.workspace"),
      }}
    >
      <div className="workspace-stack doctor-workspace">
        <header className="workspace-intro">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-[var(--medical)]">{t("dashboard.clinical.doctor.context")}</p>
            <h1 className="break-words">{userName}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("dashboard.clinical.doctor.intro")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <WorkspaceLink href="/doctor/ai-analyses" className="clinical-button">
              <ScanLine size={16} strokeWidth={1.8} aria-hidden="true" />
              {t("dashboard.doctor.quickActions.newAnalysis.label")}
            </WorkspaceLink>
            <WorkspaceLink href="/doctor/patients" className="clinical-button clinical-button-primary">
              <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
              {t("dashboard.clinical.actions.patient")}
            </WorkspaceLink>
          </div>
        </header>

        <DashboardOverviewPanel accountType="DOCTOR" locale={locale} t={t} />

        <div className="workspace-split">
          <CompactQuickActions actions={doctorQuickActions} t={t} />
          <WorkspaceStatus
            status={accountStatus}
            isError={currentUser.isError}
            onRetry={() => { void currentUser.refetch(); }}
            verificationHref="/doctor/verification"
            t={t}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
