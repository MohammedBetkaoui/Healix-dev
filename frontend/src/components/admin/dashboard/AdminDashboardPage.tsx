"use client";

import {
  CheckCircle,
  Clock,
  Loader2,
  Hospital,
  Stethoscope,
  Users,
  XCircle,
} from "lucide-react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { useAdminDashboardOverview } from "@/features/admin/hooks/use-admin-dashboard-overview";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { AdminQuickActions } from "./AdminQuickActions";
import { AdminRecentRequests } from "./AdminRecentRequests";
import { AdminStatCard } from "./AdminStatCard";
import { AdminVerificationChart } from "./AdminVerificationChart";

export function AdminDashboardPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const { data, isError, isLoading } = useAdminDashboardOverview();

  const statsData = data?.stats;

  const stats = [
    {
      badge: "PENDING",
      badgeLabel: t("admin.badges.status.PENDING_VERIFICATION"),
      icon: Clock,
      label: t("admin.dashboard.stats.pending"),
      value: statsData?.pendingVerifications ?? 0,
    },
    {
      badge: "VERIFIED",
      badgeLabel: t("admin.badges.status.VERIFIED"),
      icon: CheckCircle,
      label: t("admin.dashboard.stats.verified"),
      value: statsData?.verifiedRequests ?? 0,
    },
    {
      badge: "REJECTED",
      badgeLabel: t("admin.badges.status.REJECTED"),
      icon: XCircle,
      label: t("admin.dashboard.stats.rejected"),
      value: statsData?.rejectedRequests ?? 0,
    },
    {
      badge: "TOTAL",
      badgeLabel: t("admin.common.all"),
      icon: Users,
      label: t("admin.dashboard.stats.registeredUsers"),
      value: statsData?.totalUsers ?? 0,
    },
    {
      icon: Hospital,
      label: t("admin.dashboard.stats.establishments"),
      value: statsData?.establishments ?? 0,
    },
    {
      icon: Stethoscope,
      label: t("admin.dashboard.stats.doctors"),
      value: statsData?.independentDoctors ?? 0,
    },
  ];
  const establishmentsCount = data?.usersDistribution.establishments ?? 0;
  const doctorsCount = data?.usersDistribution.independentDoctors ?? 0;
  const distributionTotal = Math.max(1, establishmentsCount + doctorsCount);
  const establishmentPercent = Math.round(
    (establishmentsCount / distributionTotal) * 100,
  );
  const doctorPercent = Math.round((doctorsCount / distributionTotal) * 100);

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.dashboard")}`}
      titleKey="admin.dashboard.page.title"
    >
      <div className="space-y-6">
        <section>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {t("admin.dashboard.page.subtitle")}
          </p>
        </section>

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-dark)]" />
            {t("admin.dashboard.loading")}
          </div>
        ) : null}

        {isError ? (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm text-[var(--danger-ink)]"
          >
            {t("admin.dashboard.error")}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <AdminStatCard key={stat.label} {...stat} />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
          <AdminVerificationChart
            activity={data?.weeklyVerificationActivity ?? []}
            t={t}
          />
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">
                {t("admin.dashboard.distribution.title")}
              </h2>
              <div className="mt-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>{t("admin.dashboard.distribution.establishments")}</span>
                    <span className="font-semibold">{establishmentPercent}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-[var(--chart-primary)]"
                      style={{ width: `${establishmentPercent}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>{t("admin.dashboard.distribution.doctors")}</span>
                    <span className="font-semibold">{doctorPercent}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-[var(--chart-secondary)]"
                      style={{ width: `${doctorPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>
            <AdminQuickActions t={t} />
          </div>
        </section>

        <AdminRecentRequests
          requests={data?.recentVerificationRequests ?? []}
          t={t}
        />
      </div>
    </AdminShell>
  );
}
