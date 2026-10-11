import { useId } from "react";

import { type Locale } from "@/i18n";
import {
  ACTIVITY_SERIES,
  chartScaleMax,
  chartTicks,
  DASHBOARD_PERIODS,
  type DashboardPeriodDays,
  labelStep,
  shortDayLabel,
} from "@/features/dashboard/dashboard-overview";
import { type DashboardActivityDay } from "@/features/dashboard/dashboard.types";
import type { TranslationFunction } from "@/lib/i18n";

const seriesStyle = {
  aiAnalyses: { color: "var(--chart-tertiary)", dash: "2 4" },
  completedAppointments: { color: "var(--chart-secondary)", dash: "6 4" },
  consultations: { color: "var(--chart-primary)", dash: undefined },
} as const;

const LEFT = 40;
const RIGHT = 685;
const TOP = 20;
const BOTTOM = 142;

// Daily consultations, completed appointments and AI analyses of the period,
// on one shared scale; every value is also in a table for screen readers.
export function ClinicalActivityChart({ activity, days, onDaysChange, isUpdating, locale, t, formatNumber }: {
  activity: readonly DashboardActivityDay[];
  days: DashboardPeriodDays;
  onDaysChange: (days: DashboardPeriodDays) => void;
  isUpdating: boolean;
  locale: Locale;
  t: TranslationFunction;
  formatNumber: (value: number) => string;
}) {
  const id = useId();
  const max = chartScaleMax(activity);
  const step = labelStep(activity.length);
  const x = (index: number) => LEFT + (index / Math.max(1, activity.length - 1)) * (RIGHT - LEFT);
  const y = (value: number) => BOTTOM - (value / max) * (BOTTOM - TOP);
  const totals = Object.fromEntries(
    ACTIVITY_SERIES.map((key) => [key, activity.reduce((sum, day) => sum + day[key], 0)]),
  ) as Record<(typeof ACTIVITY_SERIES)[number], number>;

  return (
    <section className="surface-section" aria-labelledby={`${id}-heading`} aria-busy={isUpdating}>
      <div className="clinical-section-heading">
        <div>
          <h2 id={`${id}-heading`}>{t("dashboard.clinical.chart.title")}</h2>
          <p className="clinical-caption mt-1">{t("dashboard.clinical.chart.subtitle", { days: formatNumber(days) })}</p>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-[var(--surface-muted)] p-1" role="group" aria-label={t("dashboard.clinical.chart.period")}>
          {DASHBOARD_PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === days}
              onClick={() => onDaysChange(option)}
              className="min-h-9 rounded px-3 text-xs aria-pressed:bg-[var(--surface)] aria-pressed:font-semibold"
            >
              {t(`dashboard.clinical.chart.days${option}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="clinical-chart">
        <div className="chart-legend mb-2">
          {ACTIVITY_SERIES.map((key) => (
            <span key={key}>
              <i data-series={key} aria-hidden="true" />
              {t(`dashboard.clinical.chart.${key}`)}
              <span className="clinical-figure text-[var(--text-primary)]">{formatNumber(totals[key])}</span>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("dashboard.clinical.chart.title")}>
          <svg viewBox="0 0 720 180" className="max-h-60 min-w-[560px] w-full" aria-hidden="true" focusable="false">
            {chartTicks(max).map((value) => <g key={value}>
              <line x1={LEFT} x2={RIGHT} y1={y(value)} y2={y(value)} stroke="var(--line-soft)" strokeDasharray="3 4" />
              <text x={LEFT - 10} y={y(value) + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="11" direction="ltr" className="clinical-figure">{formatNumber(value)}</text>
            </g>)}
            {ACTIVITY_SERIES.map((key) => (
              <polyline
                key={key}
                points={activity.map((day, index) => `${x(index)},${y(day[key])}`).join(" ")}
                fill="none"
                stroke={seriesStyle[key].color}
                strokeWidth="2.2"
                strokeDasharray={seriesStyle[key].dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {activity.map((day, index) => (index % step === 0 || index === activity.length - 1) && (index === activity.length - 1 || activity.length - 1 - index >= step / 2) ? (
              <text key={day.date} x={x(index)} y="166" textAnchor="middle" fill="var(--text-secondary)" fontSize="11">{shortDayLabel(day.date, locale)}</text>
            ) : null)}
          </svg>
        </div>
        <table className="sr-only">
          <caption>{t("dashboard.clinical.chart.tableCaption", { days: formatNumber(days) })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("dashboard.clinical.chart.day")}</th>
              {ACTIVITY_SERIES.map((key) => <th key={key} scope="col">{t(`dashboard.clinical.chart.${key}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {activity.map((day) => (
              <tr key={day.date}>
                <th scope="row">{shortDayLabel(day.date, locale)}</th>
                {ACTIVITY_SERIES.map((key) => <td key={key}>{formatNumber(day[key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
