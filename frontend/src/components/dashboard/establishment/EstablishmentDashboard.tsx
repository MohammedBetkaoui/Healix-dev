"use client";

import { ClipboardCheck, Clock3, Info, Stethoscope, Users } from "lucide-react";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { ActivityTable } from "@/components/dashboard/shared/ActivityTable";
import { AttentionQueue } from "@/components/dashboard/shared/AttentionQueue";
import { ClinicalActivityChart } from "@/components/dashboard/shared/ClinicalActivityChart";
import { ClinicalWorkspaceHeader } from "@/components/dashboard/shared/ClinicalWorkspaceHeader";
import { CompactQuickActions } from "@/components/dashboard/shared/CompactQuickActions";
import { HealixAIWidget } from "@/components/dashboard/shared/HealixAIWidget";
import { OperationalMetricCard } from "@/components/dashboard/shared/OperationalMetricCard";
import { PatientFlow } from "@/components/dashboard/shared/PatientFlow";
import { WorkspaceStatus } from "@/components/dashboard/shared/WorkspaceStatus";
import { getDashboardAccountStatusPresentation } from "@/components/dashboard/shared/account-status-presentation";
import { establishmentDemo } from "@/data/dashboard-establishment.mock";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import type { DashboardActivityColumn, DashboardActivityRow } from "@/types/dashboard";

export function EstablishmentDashboard() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  // Real identity/status are intentionally separate from the presentation data.
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill();
  const accountStatus = getDashboardAccountStatusPresentation({
    isLoading: currentUser.isLoading,
    status: currentUser.isError ? undefined : currentUser.data?.accountStatus,
    t,
  });
  const workspaceName = prefill.data?.establishment.name || t("dashboard.clinical.workspace");
  const userName = currentUser.data?.fullName || t("dashboard.clinical.administration");
  const initials = currentUser.data?.fullName?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "H";
  const isVerified = !prefill.isError && prefill.data?.verification.status === "VERIFIED";
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  const formatNumber = (value: number) => numberFormat.format(value);
  const { metrics } = establishmentDemo;

  const columns: DashboardActivityColumn[] = [
    { key: "type", label: t("dashboard.clinical.activity.event") },
    { key: "patient", label: t("dashboard.clinical.activity.patient") },
    { key: "date", label: t("dashboard.clinical.activity.time") },
    { key: "status", label: t("dashboard.clinical.activity.status") },
  ];
  const rows: DashboardActivityRow[] = establishmentDemo.recent.map((item) => ({
    id: item.key,
    typeOrAction: t(`dashboard.clinical.activity.${item.key}`),
    patient: t("dashboard.clinical.activity.sample", { id: item.patient }),
    date: item.time,
    statusLabel: t(`dashboard.clinical.activity.${item.status}`),
    statusTone: item.tone,
  }));

  return (
    <DashboardShell accountType="ESTABLISHMENT" activeKey="dashboard" navSections={establishmentNavSections}
      titleKey="dashboard.clinical.title"
      user={{ accountType: "ESTABLISHMENT", footerSubtitle: t("dashboard.clinical.administration"), initials, name: userName,
        roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: workspaceName }}>
      <div className="workspace-stack">
        <ClinicalWorkspaceHeader name={workspaceName} isVerified={isVerified} t={t} />
        <div className="flex items-start gap-2 border-s-2 border-[var(--border-strong)] ps-3 text-xs leading-relaxed text-[var(--text-secondary)]" role="note">
          <Info size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p><span className="font-semibold">{t("dashboard.clinical.demo")}. </span>{t("dashboard.clinical.demoNotice")}</p>
        </div>

        <section aria-labelledby="today-heading" data-source={establishmentDemo.source}>
          <h2 id="today-heading" className="mb-3 text-sm font-semibold">{t("dashboard.clinical.today")}</h2>
          <dl className="operational-metrics">
            <OperationalMetricCard label={t("dashboard.clinical.metrics.planned")} value={formatNumber(metrics.planned)} icon={Users} tone="medical"
              hint={t("dashboard.clinical.metrics.plannedHint", { arrived: formatNumber(metrics.arrived), upcoming: formatNumber(metrics.upcoming) })} />
            <OperationalMetricCard label={t("dashboard.clinical.metrics.waiting")} value={formatNumber(metrics.waiting)} icon={Clock3} tone="warning"
              hint={t("dashboard.clinical.metrics.waitingHint", { minutes: formatNumber(metrics.waitingMinutes) })} />
            <OperationalMetricCard label={t("dashboard.clinical.metrics.doctors")} value={formatNumber(metrics.doctorsActive)} denominator={formatNumber(metrics.doctorsTotal)} icon={Stethoscope}
              hint={t("dashboard.clinical.metrics.doctorsHint", { count: formatNumber(metrics.doctorsTotal - metrics.doctorsActive) })} />
            <OperationalMetricCard label={t("dashboard.clinical.metrics.results")} value={formatNumber(metrics.results)} icon={ClipboardCheck} tone="warning"
              hint={t("dashboard.clinical.metrics.resultsHint", { count: formatNumber(metrics.priorityResults) })} />
          </dl>
        </section>

        <div className="workspace-split" data-source={establishmentDemo.source}>
          <AttentionQueue items={establishmentDemo.attention} t={t} formatNumber={formatNumber} />
          <PatientFlow steps={establishmentDemo.flow} t={t} formatNumber={formatNumber} />
        </div>
        <ClinicalActivityChart points={establishmentDemo.activity} t={t} formatNumber={formatNumber} />
        <div className="workspace-split workspace-split-activity" data-source={establishmentDemo.source}>
          <ActivityTable columns={columns} rows={rows} title={t("dashboard.clinical.activity.title")} subtitle={t("dashboard.clinical.demo")} />
          <HealixAIWidget activity={establishmentDemo.ai} t={t} formatNumber={formatNumber} />
        </div>
        <div className="workspace-split">
          <CompactQuickActions t={t} />
          <WorkspaceStatus status={accountStatus} isError={currentUser.isError} onRetry={() => { void currentUser.refetch(); }} t={t} />
        </div>
      </div>
    </DashboardShell>
  );
}
