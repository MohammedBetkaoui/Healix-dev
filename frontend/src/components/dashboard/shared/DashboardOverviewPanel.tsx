"use client";

import { BrainCircuit, CalendarClock, ClipboardPlus, RotateCcw, Stethoscope } from "lucide-react";
import { useState } from "react";

import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { type Locale } from "@/i18n";
import { pendingAge } from "@/features/ai-analyses/runs-tracking";
import {
  attentionLinks,
  DEFAULT_DASHBOARD_PERIOD,
  type DashboardPeriodDays,
  patientName,
  type RoleBase,
} from "@/features/dashboard/dashboard-overview";
import { useDashboardOverview } from "@/features/dashboard/hooks/use-dashboard-overview";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import type { TranslationFunction } from "@/lib/i18n";

import { ActivityTable } from "./ActivityTable";
import { AttentionQueue } from "./AttentionQueue";
import { ClinicalActivityChart } from "./ClinicalActivityChart";
import { HealixAIWidget } from "./HealixAIWidget";
import { OperationalMetricCard } from "./OperationalMetricCard";
import { PatientFlow } from "./PatientFlow";

type DashboardOverviewPanelProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  t: TranslationFunction;
};

// Every figure of the doctor and establishment dashboards, from one call to
// /dashboard/overview. Nothing here is invented: a widget without a real
// source does not exist. An unverified account is invited to the
// verification instead of seeing figures.
export function DashboardOverviewPanel({ accountType, locale, t }: DashboardOverviewPanelProps) {
  const [days, setDays] = useState<DashboardPeriodDays>(DEFAULT_DASHBOARD_PERIOD);
  const overview = useDashboardOverview(days);
  const roleBase: RoleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const percentFormat = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0, style: "percent" });
  const formatNumber = (value: number) => numberFormat.format(value);
  const formatPercent = (value: number) => percentFormat.format(value);

  if (isVerificationRequiredError(overview.error)) {
    return <VerificationRequiredNotice accountType={accountType} t={t} />;
  }

  if (overview.isPending) {
    return (
      <p className="surface-section px-5 py-6 text-sm text-[var(--text-secondary)]" aria-live="polite">
        {t("dashboard.clinical.overview.loading")}
      </p>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <div role="alert" className="surface-section flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-[var(--danger-ink)]">{t("dashboard.clinical.overview.error")}</p>
        <button type="button" className="clinical-button" onClick={() => { void overview.refetch(); }}>
          <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
          {t("dashboard.clinical.overview.retry")}
        </button>
      </div>
    );
  }

  const data = overview.data;
  const today = data.appointmentsToday;
  const age = pendingAge(data.aiAnalyses.pending.oldestAgeHours);
  const timeFormat = new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: data.timeZone });

  return (
    <>
      <section aria-labelledby="overview-metrics-heading">
        <h2 id="overview-metrics-heading" className="mb-3 text-sm font-semibold">{t("dashboard.clinical.metrics.title")}</h2>
        <dl className="operational-metrics" data-count={data.affiliatedDoctors ? 4 : 3}>
          <OperationalMetricCard
            label={t("dashboard.clinical.metrics.patients")}
            value={formatNumber(data.patients.total)}
            hint={t("dashboard.clinical.metrics.patientsHint", { count: formatNumber(data.patients.newInPeriod), days: formatNumber(days) })}
            icon={ClipboardPlus}
            tone="medical"
          />
          <OperationalMetricCard
            label={t("dashboard.clinical.metrics.appointments")}
            value={formatNumber(today.total)}
            hint={today.next
              ? t("dashboard.clinical.metrics.appointmentsNext", {
                  patient: patientName(today.next.patient, locale),
                  time: timeFormat.format(new Date(today.next.scheduledAt)),
                })
              : t("dashboard.clinical.metrics.appointmentsNone")}
            icon={CalendarClock}
          />
          <OperationalMetricCard
            label={t("dashboard.clinical.metrics.pending")}
            value={formatNumber(data.aiAnalyses.pending.count)}
            hint={age
              ? age.unit === "days"
                ? t("dashboard.clinical.metrics.pendingDays", { count: formatNumber(age.value) })
                : t("dashboard.clinical.metrics.pendingHours", { count: formatNumber(age.value) })
              : t("dashboard.clinical.metrics.pendingNone", { days: formatNumber(days) })}
            icon={BrainCircuit}
            tone={data.aiAnalyses.pending.count > 0 ? "warning" : "ai"}
          />
          {data.affiliatedDoctors ? (
            <OperationalMetricCard
              label={t("dashboard.clinical.metrics.doctors")}
              value={formatNumber(data.affiliatedDoctors.active)}
              hint={t("dashboard.clinical.metrics.doctorsHint")}
              icon={Stethoscope}
            />
          ) : null}
        </dl>
      </section>

      <div className="workspace-split">
        <AttentionQueue items={attentionLinks(data.attention, roleBase)} t={t} formatNumber={formatNumber} />
        <PatientFlow
          agendaHref={`${roleBase}/appointments`}
          byStatus={today.byStatus}
          formatNumber={formatNumber}
          t={t}
          total={today.total}
        />
      </div>

      <ClinicalActivityChart
        activity={data.activity}
        days={days}
        formatNumber={formatNumber}
        isUpdating={overview.isPlaceholderData}
        locale={locale}
        onDaysChange={setDays}
        t={t}
      />

      <div className="workspace-split workspace-split-activity">
        <ActivityTable analyses={data.aiAnalyses.recent} locale={locale} roleBase={roleBase} t={t} timeZone={data.timeZone} />
        <HealixAIWidget
          ai={data.aiAnalyses}
          days={days}
          formatNumber={formatNumber}
          formatPercent={formatPercent}
          t={t}
          trackingHref={`${roleBase}/ai-analyses/tracking`}
        />
      </div>
    </>
  );
}
