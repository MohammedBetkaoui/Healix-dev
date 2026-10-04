"use client";

import { BadgeCheck, BrainCircuit, CalendarClock, ClipboardPlus, FileText, Info, Plus, ScanLine } from "lucide-react";

import { doctorNavSections } from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { WorkspaceLink } from "@/components/dashboard/layout/WorkspaceLink";
import { ActivityTable } from "@/components/dashboard/shared/ActivityTable";
import { CompactQuickActions, type CompactQuickAction } from "@/components/dashboard/shared/CompactQuickActions";
import { HealixAIWidget } from "@/components/dashboard/shared/HealixAIWidget";
import { OperationalMetricCard } from "@/components/dashboard/shared/OperationalMetricCard";
import { UsageChart } from "@/components/dashboard/shared/UsageChart";
import { WorkspaceStatus } from "@/components/dashboard/shared/WorkspaceStatus";
import { getDashboardAccountStatusPresentation } from "@/components/dashboard/shared/account-status-presentation";
import { doctorDemo } from "@/data/dashboard-doctor.mock";
import { useTodayAppointments } from "@/features/appointments/hooks/use-today-appointments";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { usePatients } from "@/features/patients/hooks/use-patients";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import type { DashboardActivityColumn, DashboardActivityRow } from "@/types/dashboard";

const doctorQuickActions: readonly CompactQuickAction[] = [
  { href: "/doctor/patients", icon: ClipboardPlus, key: "addPatient", labelKey: "dashboard.doctor.quickActions.addPatient.label" },
  { href: "#analyses", icon: ScanLine, key: "newAnalysis", labelKey: "dashboard.doctor.quickActions.newAnalysis.label" },
  { href: "#reports", icon: FileText, key: "generateReport", labelKey: "dashboard.doctor.quickActions.generateReport.label" },
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
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  const formatNumber = (value: number) => numberFormat.format(value);
  // "—" until the API answers (or if it fails), like the agenda metrics.
  const formatCount = (value: number | undefined) => (value === undefined ? "—" : formatNumber(value));
  const demoBadgeLabel = t("dashboard.common.demoBadge");
  // limit 1: only meta.total is read.
  const patients = usePatients({ limit: 1 });
  const todayAppointments = useTodayAppointments();

  const columns: DashboardActivityColumn[] = [
    { key: "action", label: t("dashboard.doctor.table.columns.action") },
    { key: "patient", label: t("dashboard.doctor.table.columns.patient") },
    { key: "date", label: t("dashboard.doctor.table.columns.date") },
    { key: "status", label: t("dashboard.doctor.table.columns.status") },
  ];
  const rows: DashboardActivityRow[] = doctorDemo.recent.map((item) => ({
    id: item.key,
    date: t(`dashboard.doctor.table.rows.${item.dateKey}`),
    patient: t(`dashboard.doctor.table.rows.${item.patientKey}`),
    statusLabel: t(`dashboard.common.status.${item.status}`),
    statusTone: item.tone,
    typeOrAction: t(`dashboard.doctor.table.rows.${item.key}`),
  }));
  const activityPoints = doctorDemo.activity.map((point) => ({
    label: t("dashboard.clinical.chart.day", { day: formatNumber(point.day) }),
    primary: point.primary,
    secondary: point.secondary,
  }));

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
            <WorkspaceLink href="#analyses" className="clinical-button">
              <ScanLine size={16} strokeWidth={1.8} aria-hidden="true" />
              {t("dashboard.doctor.quickActions.newAnalysis.label")}
            </WorkspaceLink>
            <WorkspaceLink href="/doctor/patients" className="clinical-button clinical-button-primary">
              <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
              {t("dashboard.clinical.actions.patient")}
            </WorkspaceLink>
          </div>
        </header>

        <div className="flex items-start gap-2 border-s-2 border-[var(--border-strong)] ps-3 text-xs leading-relaxed text-[var(--text-secondary)]" role="note">
          <Info size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p><span className="font-semibold">{t("dashboard.clinical.demo")}. </span>{t("dashboard.clinical.demoNotice", { badge: demoBadgeLabel })}</p>
        </div>

        <section aria-labelledby="doctor-metrics-heading">
          <h2 id="doctor-metrics-heading" className="mb-3 text-sm font-semibold">{t("dashboard.clinical.doctor.activity")}</h2>
          <dl className="operational-metrics">
            <OperationalMetricCard
              label={t("dashboard.doctor.stats.patients.label")}
              value={formatCount(patients.data?.meta.total)}
              hint={t("dashboard.doctor.stats.patients.hint")}
              icon={ClipboardPlus}
              tone="medical"
            />
            <OperationalMetricCard
              label={t("dashboard.doctor.stats.appointments.label")}
              value={formatCount(todayAppointments.count)}
              hint={t("dashboard.doctor.stats.appointments.hint", { upcoming: formatCount(todayAppointments.upcomingCount) })}
              icon={CalendarClock}
            />
            <OperationalMetricCard
              label={t("dashboard.doctor.stats.reports.label")}
              value={formatNumber(doctorDemo.metrics.reports)}
              hint={t("dashboard.doctor.stats.reports.hint")}
              icon={FileText}
              demoBadgeLabel={demoBadgeLabel}
            />
            <OperationalMetricCard
              label={t("dashboard.doctor.stats.analyses.label")}
              value={formatNumber(doctorDemo.metrics.analyses)}
              hint={t("dashboard.doctor.stats.analyses.hint")}
              icon={BrainCircuit}
              tone="ai"
              demoBadgeLabel={demoBadgeLabel}
            />
          </dl>
        </section>

        <div className="workspace-split" data-source={doctorDemo.source}>
          <UsageChart
            type="line"
            variant="clinical"
            data={activityPoints}
            legendPrimary={t("dashboard.common.charts.legendPrimary")}
            legendSecondary={t("dashboard.common.charts.legendSecondary")}
            periodLabel={t("dashboard.common.charts.days30")}
            subtitle={t("dashboard.clinical.doctor.chartSubtitle")}
            title={t("dashboard.clinical.doctor.chartTitle")}
            demoBadgeLabel={demoBadgeLabel}
          />
          <HealixAIWidget
            activity={doctorDemo.ai}
            periodLabel={t("dashboard.clinical.doctor.analysesPeriod")}
            t={t}
            formatNumber={formatNumber}
            demoBadgeLabel={demoBadgeLabel}
          />
        </div>

        <ActivityTable
          columns={columns}
          rows={rows}
          title={t("dashboard.doctor.table.title")}
          demoBadgeLabel={demoBadgeLabel}
        />

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
