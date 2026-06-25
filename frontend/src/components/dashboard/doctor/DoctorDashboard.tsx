"use client";

import {
  Bell,
  BadgeCheck,
  Brain,
  BrainCircuit,
  Calendar,
  ClipboardPlus,
  CreditCard,
  FileBarChart,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Pill,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";

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
  type DashboardNavSection,
  type DashboardQuickAction,
  type DashboardStat,
} from "@/types/dashboard";

const doctorNavSections: DashboardNavSection[] = [
  {
    key: "clinic",
    titleKey: "dashboard.sidebar.sections.clinic",
    items: [
      {
        href: "/doctor/dashboard",
        icon: LayoutDashboard,
        key: "dashboard",
        labelKey: "dashboard.sidebar.doctor.dashboard",
      },
      {
        href: "#patients",
        icon: Users,
        key: "patients",
        labelKey: "dashboard.sidebar.doctor.patients",
      },
      {
        href: "#consultations",
        icon: Stethoscope,
        key: "consultations",
        labelKey: "dashboard.sidebar.doctor.consultations",
      },
      {
        href: "#appointments",
        icon: Calendar,
        key: "appointments",
        labelKey: "dashboard.sidebar.doctor.appointments",
      },
      {
        href: "#prescriptions",
        icon: Pill,
        key: "prescriptions",
        labelKey: "dashboard.sidebar.doctor.prescriptions",
      },
    ],
  },
  {
    key: "ai",
    titleKey: "dashboard.sidebar.sections.ai",
    items: [
      {
        badge: { text: "IA", tone: "purple" },
        href: "#analyses",
        icon: Brain,
        key: "analyses",
        labelKey: "dashboard.sidebar.doctor.analyses",
      },
      {
        href: "#lab",
        icon: FlaskConical,
        key: "lab",
        labelKey: "dashboard.sidebar.doctor.lab",
      },
      {
        href: "#reports",
        icon: FileBarChart,
        key: "reports",
        labelKey: "dashboard.sidebar.doctor.reports",
      },
    ],
  },
  {
    key: "communication",
    titleKey: "dashboard.sidebar.sections.communication",
    items: [
      {
        badge: { text: "3", tone: "red" },
        href: "#messages",
        icon: MessageSquare,
        key: "messages",
        labelKey: "dashboard.sidebar.doctor.messages",
      },
      {
        badge: { text: "7", tone: "red" },
        href: "#notifications",
        icon: Bell,
        key: "notifications",
        labelKey: "dashboard.sidebar.doctor.notifications",
      },
    ],
  },
  {
    key: "account",
    titleKey: "dashboard.sidebar.sections.account",
    items: [
      {
        href: "#verification",
        icon: BadgeCheck,
        key: "verification",
        labelKey: "dashboard.sidebar.doctor.verification",
      },
      {
        href: "#subscription",
        icon: CreditCard,
        key: "subscription",
        labelKey: "dashboard.sidebar.doctor.subscription",
      },
      {
        href: "#settings",
        icon: Settings,
        key: "settings",
        labelKey: "dashboard.sidebar.doctor.settings",
      },
      {
        href: "/login",
        icon: LogOut,
        key: "logout",
        labelKey: "dashboard.sidebar.doctor.logout",
      },
    ],
  },
];

const doctorStats: DashboardStat[] = [
  {
    hintKey: "dashboard.doctor.stats.patients.hint",
    icon: Users,
    key: "patients",
    labelKey: "dashboard.doctor.stats.patients.label",
    value: "36",
  },
  {
    hintKey: "dashboard.doctor.stats.analyses.hint",
    icon: BrainCircuit,
    key: "analyses",
    labelKey: "dashboard.doctor.stats.analyses.label",
    value: "89",
  },
  {
    hintKey: "dashboard.doctor.stats.reports.hint",
    icon: FileText,
    key: "reports",
    labelKey: "dashboard.doctor.stats.reports.label",
    value: "24",
  },
  {
    actionLabelKey: "dashboard.common.accountStatus.action",
    hintKey: "dashboard.doctor.stats.account.hint",
    icon: ShieldCheck,
    key: "account",
    labelKey: "dashboard.doctor.stats.account.label",
    tone: "accent",
    value: "BASIC_ACCOUNT",
  },
];

const doctorActivityPoints: DashboardLinePoint[] = [
  { label: "Jun 04", primary: 8, secondary: 12 },
  { label: "Jun 10", primary: 14, secondary: 16 },
  { label: "Jun 16", primary: 11, secondary: 18 },
  { label: "Jun 22", primary: 18, secondary: 21 },
  { label: "Jun 26", primary: 15, secondary: 19 },
  { label: "Jun 30", primary: 19, secondary: 23 },
];

const doctorDistributionPoints: DashboardBarPoint[] = [
  { label: "Brain", primary: 26, secondary: 12 },
  { label: "Cardiology", primary: 19, secondary: 10 },
  { label: "Reports", primary: 21, secondary: 11 },
  { label: "Pending", primary: 9, secondary: 6 },
];

const doctorQuickActions: DashboardQuickAction[] = [
  {
    descriptionKey: "dashboard.doctor.quickActions.addPatient.description",
    href: "#patients",
    icon: ClipboardPlus,
    key: "addPatient",
    labelKey: "dashboard.doctor.quickActions.addPatient.label",
  },
  {
    descriptionKey: "dashboard.doctor.quickActions.newAnalysis.description",
    href: "#analyses",
    icon: Sparkles,
    key: "newAnalysis",
    labelKey: "dashboard.doctor.quickActions.newAnalysis.label",
  },
  {
    descriptionKey: "dashboard.doctor.quickActions.generateReport.description",
    href: "#reports",
    icon: FileText,
    key: "generateReport",
    labelKey: "dashboard.doctor.quickActions.generateReport.label",
  },
  {
    descriptionKey: "dashboard.doctor.quickActions.verification.description",
    href: "#verification",
    icon: BadgeCheck,
    key: "verification",
    labelKey: "dashboard.doctor.quickActions.verification.label",
  },
];

export function DoctorDashboard() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);

  const columns: DashboardActivityColumn[] = [
    { key: "action", label: t("dashboard.doctor.table.columns.action") },
    { key: "patient", label: t("dashboard.doctor.table.columns.patient") },
    { key: "date", label: t("dashboard.doctor.table.columns.date") },
    { key: "status", label: t("dashboard.doctor.table.columns.status") },
  ];

  const rows: DashboardActivityRow[] = [
    {
      date: t("dashboard.doctor.table.rows.today"),
      id: "doctor-activity-1",
      patient: t("dashboard.doctor.table.rows.patient1"),
      statusLabel: t("dashboard.common.status.completed"),
      statusTone: "success",
      typeOrAction: t("dashboard.doctor.table.rows.analysis"),
    },
    {
      date: t("dashboard.doctor.table.rows.yesterday"),
      id: "doctor-activity-2",
      patient: t("dashboard.doctor.table.rows.patient2"),
      statusLabel: t("dashboard.common.status.generated"),
      statusTone: "info",
      typeOrAction: t("dashboard.doctor.table.rows.report"),
    },
    {
      date: t("dashboard.doctor.table.rows.june12"),
      id: "doctor-activity-3",
      patient: t("dashboard.doctor.table.rows.patient3"),
      statusLabel: t("dashboard.common.status.created"),
      statusTone: "neutral",
      typeOrAction: t("dashboard.doctor.table.rows.consultation"),
    },
  ];

  return (
    <DashboardShell
      accountType="INDEPENDENT_DOCTOR"
      activeKey="dashboard"
      navSections={doctorNavSections}
      titleKey="dashboard.doctor.title"
      user={{
        accountType: "INDEPENDENT_DOCTOR",
        footerSubtitle: "Neurologie",
        initials: "SB",
        name: "Dr Samir Benali",
        roleKey: "dashboard.common.roles.doctor",
        workspaceSubtitle: "Cabinet HealixDZ",
      }}
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {doctorStats.map((item) => (
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
            data={doctorActivityPoints}
            legendPrimary={t("dashboard.common.charts.legendPrimary")}
            legendSecondary={t("dashboard.common.charts.legendSecondary")}
            periodLabel={t("dashboard.common.charts.days30")}
            subtitle={t("dashboard.doctor.charts.activitySubtitle")}
            title={t("dashboard.doctor.charts.activityTitle")}
          />
          <UsageChart
            type="bar"
            data={doctorDistributionPoints}
            legendPrimary={t("dashboard.common.charts.legendPrimary")}
            legendSecondary={t("dashboard.common.charts.legendSecondary")}
            periodLabel={t("dashboard.common.charts.days30")}
            subtitle={t("dashboard.doctor.charts.distributionSubtitle")}
            title={t("dashboard.doctor.charts.distributionTitle")}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <ActivityTable
            columns={columns}
            rows={rows}
            title={t("dashboard.doctor.table.title")}
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
                  <Stethoscope className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {t("dashboard.doctor.quickActions.title")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("dashboard.common.accountStatus.statusCardDescription")}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {doctorQuickActions.map((action) => (
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
