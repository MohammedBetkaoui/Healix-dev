"use client";

import {
  Bell,
  BadgeCheck,
  BrainCircuit,
  ClipboardPlus,
  FileStack,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  Users,
  Sparkles,
} from "lucide-react";

import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { AccountStatusCard } from "@/components/dashboard/shared/AccountStatusCard";
import { ActivityTable } from "@/components/dashboard/shared/ActivityTable";
import { QuickActionCard } from "@/components/dashboard/shared/QuickActionCard";
import { StatCard } from "@/components/dashboard/shared/StatCard";
import { UsageChart } from "@/components/dashboard/shared/UsageChart";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import {
  type DashboardActivityColumn,
  type DashboardActivityRow,
  type DashboardBarPoint,
  type DashboardLinePoint,
  type DashboardQuickAction,
  type DashboardStat,
} from "@/types/dashboard";

const establishmentStats: DashboardStat[] = [
  {
    hintKey: "dashboard.establishment.stats.patients.hint",
    icon: Users,
    key: "patients",
    labelKey: "dashboard.establishment.stats.patients.label",
    value: "128",
  },
  {
    hintKey: "dashboard.establishment.stats.doctors.hint",
    icon: Stethoscope,
    key: "doctors",
    labelKey: "dashboard.establishment.stats.doctors.label",
    value: "14",
  },
  {
    hintKey: "dashboard.establishment.stats.analyses.hint",
    icon: BrainCircuit,
    key: "analyses",
    labelKey: "dashboard.establishment.stats.analyses.label",
    value: "342",
  },
  {
    actionLabelKey: "dashboard.common.accountStatus.action",
    hintKey: "dashboard.establishment.stats.account.hint",
    icon: ShieldCheck,
    key: "account",
    labelKey: "dashboard.establishment.stats.account.label",
    tone: "accent",
    value: "BASIC_ACCOUNT",
  },
];

const establishmentActivityPoints: DashboardLinePoint[] = [
  { label: "Jun 04", primary: 16, secondary: 9 },
  { label: "Jun 10", primary: 28, secondary: 15 },
  { label: "Jun 16", primary: 24, secondary: 13 },
  { label: "Jun 22", primary: 34, secondary: 19 },
  { label: "Jun 26", primary: 27, secondary: 17 },
  { label: "Jun 30", primary: 32, secondary: 18 },
];

const establishmentDistributionPoints: DashboardBarPoint[] = [
  { label: "Brain MRI", primary: 42, secondary: 18 },
  { label: "Cardiology", primary: 31, secondary: 15 },
  { label: "Reports", primary: 24, secondary: 14 },
  { label: "Pending", primary: 12, secondary: 8 },
];

const establishmentQuickActions: DashboardQuickAction[] = [
  {
    descriptionKey: "dashboard.establishment.quickActions.addPatient.description",
    href: "#patients",
    icon: ClipboardPlus,
    key: "addPatient",
    labelKey: "dashboard.establishment.quickActions.addPatient.label",
  },
  {
    descriptionKey: "dashboard.establishment.quickActions.inviteDoctor.description",
    href: "#doctors",
    icon: UserPlus,
    key: "inviteDoctor",
    labelKey: "dashboard.establishment.quickActions.inviteDoctor.label",
  },
  {
    descriptionKey: "dashboard.establishment.quickActions.newAnalysis.description",
    href: "#analyses",
    icon: Sparkles,
    key: "newAnalysis",
    labelKey: "dashboard.establishment.quickActions.newAnalysis.label",
  },
  {
    descriptionKey: "dashboard.establishment.quickActions.verification.description",
    href: "#verification",
    icon: BadgeCheck,
    key: "verification",
    labelKey: "dashboard.establishment.quickActions.verification.label",
  },
];

export function EstablishmentDashboard() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);

  const columns: DashboardActivityColumn[] = [
    { key: "type", label: t("dashboard.establishment.table.columns.type") },
    { key: "patient", label: t("dashboard.establishment.table.columns.patient") },
    { key: "date", label: t("dashboard.establishment.table.columns.date") },
    { key: "status", label: t("dashboard.establishment.table.columns.status") },
    { key: "cta", label: t("dashboard.establishment.table.columns.cta") },
  ];

  const rows: DashboardActivityRow[] = [
    {
      actionLabel: t("dashboard.establishment.table.rows.open"),
      date: t("dashboard.establishment.table.rows.today"),
      id: "activity-1",
      patient: t("dashboard.establishment.table.rows.patient1"),
      statusLabel: t("dashboard.common.status.completed"),
      statusTone: "success",
      typeOrAction: t("dashboard.establishment.table.rows.analysis"),
    },
    {
      actionLabel: t("dashboard.establishment.table.rows.open"),
      date: t("dashboard.establishment.table.rows.yesterday"),
      id: "activity-2",
      patient: t("dashboard.establishment.table.rows.patient2"),
      statusLabel: t("dashboard.common.status.generated"),
      statusTone: "info",
      typeOrAction: t("dashboard.establishment.table.rows.report"),
    },
    {
      actionLabel: t("dashboard.establishment.table.rows.open"),
      date: t("dashboard.establishment.table.rows.june12"),
      id: "activity-3",
      patient: t("dashboard.establishment.table.rows.patient3"),
      statusLabel: t("dashboard.common.status.created"),
      statusTone: "neutral",
      typeOrAction: t("dashboard.establishment.table.rows.record"),
    },
  ];

  return (
    <DashboardShell
      accountType="ESTABLISHMENT"
      activeKey="dashboard"
      navSections={establishmentNavSections}
      titleKey="dashboard.establishment.title"
      user={{
        accountType: "ESTABLISHMENT",
        footerSubtitle: "Administration",
        initials: "HE",
        name: "Healix Clinique",
        roleKey: "dashboard.common.roles.establishment",
        workspaceSubtitle: "Clinique El Shifa",
      }}
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {establishmentStats.map((item) => (
            <StatCard
              key={item.key}
              actionLabel={
                item.actionLabelKey ? t(item.actionLabelKey) : undefined
              }
              icon={item.icon}
              label={t(item.labelKey)}
              tone={item.tone}
              value={item.value}
              variation={t(item.hintKey)}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <UsageChart
            type="line"
            data={establishmentActivityPoints}
            legendPrimary={t("dashboard.common.charts.legendPrimary")}
            legendSecondary={t("dashboard.common.charts.legendSecondary")}
            periodLabel={t("dashboard.common.charts.days30")}
            subtitle={t("dashboard.establishment.charts.activitySubtitle")}
            title={t("dashboard.establishment.charts.activityTitle")}
          />
          <UsageChart
            type="bar"
            data={establishmentDistributionPoints}
            legendPrimary={t("dashboard.common.charts.legendPrimary")}
            legendSecondary={t("dashboard.common.charts.legendSecondary")}
            periodLabel={t("dashboard.common.charts.days30")}
            subtitle={t("dashboard.establishment.charts.distributionSubtitle")}
            title={t("dashboard.establishment.charts.distributionTitle")}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <ActivityTable
            columns={columns}
            rows={rows}
            title={t("dashboard.establishment.table.title")}
          />
          <div className="space-y-6">
            <AccountStatusCard
              actionLabel={t("dashboard.common.accountStatus.startVerification")}
              description={t("dashboard.common.accountStatus.statusCardDescription")}
              demoLabel={t("dashboard.common.demoBadge")}
              statusLabel={t("dashboard.common.demoBadge")}
              title={t("dashboard.common.accountStatus.statusCardTitle")}
            />
            <section className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <FileStack className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {t("dashboard.establishment.quickActions.title")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("dashboard.common.accountStatus.statusCardDescription")}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {establishmentQuickActions.map((action) => (
                  <QuickActionCard
                    key={action.key}
                    description={t(action.descriptionKey)}
                    href={action.href}
                    icon={action.icon}
                    title={t(action.labelKey)}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
