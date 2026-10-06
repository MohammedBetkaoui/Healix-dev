"use client";

import { CalendarClock, ClipboardCheck, Clock3, Info, Stethoscope } from "lucide-react";
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
import { useAppointmentDoctors } from "@/features/appointments/hooks/use-appointment-doctors";
import { useTodayAppointments } from "@/features/appointments/hooks/use-today-appointments";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
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
  const initials = getAccountInitials(currentUser.data?.fullName);
  const isVerified = !prefill.isError && prefill.data?.verification.status === "VERIFIED";
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  const formatNumber = (value: number) => numberFormat.format(value);
  // "—" until the API answers (or if it fails), like the agenda metrics.
  const formatCount = (value: number | undefined) => (value === undefined ? "—" : formatNumber(value));
  const demoBadgeLabel = t("dashboard.common.demoBadge");
  // Real: today's appointments and the establishment's doctors (no backend
  // notion of an "active" doctor, so a single total). The remaining metrics stay demo.
  const todayAppointments = useTodayAppointments();
  const doctors = useAppointmentDoctors();
  // A refused counter keeps "—"; its sub-text says why instead of the usual hint.
  const verificationRequiredHint = t("dashboard.common.verificationRequiredHint");
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
          <p><span className="font-semibold">{t("dashboard.clinical.demo")}. </span>{t("dashboard.clinical.demoNotice", { badge: demoBadgeLabel })}</p>
        </div>

        <section aria-labelledby="today-heading">
          <h2 id="today-heading" className="mb-3 text-sm font-semibold">{t("dashboard.clinical.today")}</h2>
          <dl className="operational-metrics">
            <OperationalMetricCard label={t("dashboard.clinical.metrics.planned")} value={formatCount(todayAppointments.count)} icon={CalendarClock} tone="medical"
              hint={todayAppointments.isVerificationRequired ? verificationRequiredHint : t("dashboard.clinical.metrics.plannedHint", { upcoming: formatCount(todayAppointments.upcomingCount) })} />
            <OperationalMetricCard label={t("dashboard.clinical.metrics.waiting")} value={formatNumber(metrics.waiting)} icon={Clock3} tone="warning"
              hint={t("dashboard.clinical.metrics.waitingHint", { minutes: formatNumber(metrics.waitingMinutes) })} demoBadgeLabel={demoBadgeLabel} />
            <OperationalMetricCard label={t("dashboard.clinical.metrics.doctors")} value={formatCount(doctors.data?.length)} icon={Stethoscope}
              hint={isVerificationRequiredError(doctors.error) ? verificationRequiredHint : t("dashboard.clinical.metrics.doctorsHint")} />
            <OperationalMetricCard label={t("dashboard.clinical.metrics.results")} value={formatNumber(metrics.results)} icon={ClipboardCheck} tone="warning"
              hint={t("dashboard.clinical.metrics.resultsHint", { count: formatNumber(metrics.priorityResults) })} demoBadgeLabel={demoBadgeLabel} />
          </dl>
        </section>

        <div className="workspace-split" data-source={establishmentDemo.source}>
          <AttentionQueue items={establishmentDemo.attention} t={t} formatNumber={formatNumber} demoBadgeLabel={demoBadgeLabel} />
          <PatientFlow steps={establishmentDemo.flow} t={t} formatNumber={formatNumber} demoBadgeLabel={demoBadgeLabel} />
        </div>
        <ClinicalActivityChart points={establishmentDemo.activity} t={t} formatNumber={formatNumber} demoBadgeLabel={demoBadgeLabel} />
        <div className="workspace-split workspace-split-activity" data-source={establishmentDemo.source}>
          <ActivityTable columns={columns} rows={rows} title={t("dashboard.clinical.activity.title")} demoBadgeLabel={demoBadgeLabel} />
          <HealixAIWidget activity={establishmentDemo.ai} t={t} formatNumber={formatNumber} demoBadgeLabel={demoBadgeLabel} />
        </div>
        <div className="workspace-split">
          <CompactQuickActions t={t} />
          <WorkspaceStatus status={accountStatus} isError={currentUser.isError} onRetry={() => { void currentUser.refetch(); }} t={t} />
        </div>
      </div>
    </DashboardShell>
  );
}
