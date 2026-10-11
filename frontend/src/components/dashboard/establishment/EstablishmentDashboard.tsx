"use client";

import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { ClinicalWorkspaceHeader } from "@/components/dashboard/shared/ClinicalWorkspaceHeader";
import { CompactQuickActions } from "@/components/dashboard/shared/CompactQuickActions";
import { DashboardOverviewPanel } from "@/components/dashboard/shared/DashboardOverviewPanel";
import { WorkspaceStatus } from "@/components/dashboard/shared/WorkspaceStatus";
import { getDashboardAccountStatusPresentation } from "@/components/dashboard/shared/account-status-presentation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

export function EstablishmentDashboard() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  // Identity and verification status; every figure comes from the overview.
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill();
  const accountStatus = getDashboardAccountStatusPresentation({
    isLoading: currentUser.isLoading,
    status: currentUser.isError ? undefined : currentUser.data?.accountStatus,
    t,
  });
  const workspaceName = prefill.data?.establishment.name || t("dashboard.clinical.workspace");
  const userName = currentUser.data?.fullName || t("dashboard.clinical.administration");
  const initials = getAccountInitials(currentUser.data?.fullName);
  const isVerified = !prefill.isError && prefill.data?.verification.status === "VERIFIED";

  return (
    <DashboardShell accountType="ESTABLISHMENT" activeKey="dashboard" navSections={establishmentNavSections}
      titleKey="dashboard.clinical.title"
      user={{ accountType: "ESTABLISHMENT", footerSubtitle: t("dashboard.clinical.administration"), initials, name: userName,
        roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: workspaceName }}>
      <div className="workspace-stack">
        <ClinicalWorkspaceHeader name={workspaceName} isVerified={isVerified} t={t} />

        <DashboardOverviewPanel accountType="ESTABLISHMENT" locale={locale} t={t} />

        <div className="workspace-split">
          <CompactQuickActions t={t} />
          <WorkspaceStatus status={accountStatus} isError={currentUser.isError} onRetry={() => { void currentUser.refetch(); }} t={t} />
        </div>
      </div>
    </DashboardShell>
  );
}
