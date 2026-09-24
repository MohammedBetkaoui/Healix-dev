import { useId } from "react";
import type { TranslationFunction } from "@/lib/i18n";

type ClinicalPoint = { day: number; consultations: number; records: number; exams: number };
const series = [
  { key: "consultations", color: "var(--chart-primary)", dash: undefined },
  { key: "records", color: "var(--chart-secondary)", dash: "6 4" },
  { key: "exams", color: "var(--chart-tertiary)", dash: "2 4" },
] as const;

export function ClinicalActivityChart({ points, t, formatNumber }: { points: readonly ClinicalPoint[]; t: TranslationFunction; formatNumber: (value: number) => string }) {
  const id = useId();
  const max = Math.max(10, Math.ceil(Math.max(...points.flatMap((point) => series.map(({ key }) => point[key]))) / 10) * 10);
  const first = points[0]?.day ?? -29;
  const last = points[points.length - 1]?.day ?? 0;
  const x = (day: number) => 35 + (day - first) / Math.max(1, last - first) * 650;
  const y = (value: number) => 142 - value / max * 122;
  const label = (day: number) => t("dashboard.clinical.chart.day", { day: formatNumber(day) });

  return (
    <section className="surface-section" aria-labelledby={`${id}-heading`}>
      <div className="clinical-section-heading">
        <div><h2 id={`${id}-heading`}>{t("dashboard.clinical.chart.title")}</h2><p className="clinical-caption mt-1">{t("dashboard.clinical.chart.subtitle")}</p></div>
        <div className="flex items-center gap-1 rounded-md bg-[var(--surface-muted)] p-1" role="group" aria-label={t("dashboard.clinical.chart.period")}>
          {[7, 30, 90].map((days) => <button key={days} type="button" disabled={days !== 30} aria-pressed={days === 30}
            title={days !== 30 ? t("dashboard.clinical.chart.unavailable") : undefined}
            className="min-h-9 rounded px-3 text-xs enabled:bg-[var(--surface)] enabled:font-semibold disabled:cursor-not-allowed disabled:text-[var(--text-muted)]">
            {t(`dashboard.clinical.chart.days${days}`)}
          </button>)}
        </div>
      </div>
      <div className="clinical-chart">
        <div className="chart-legend mb-2">{series.map(({ key }) => <span key={key}><i data-series={key} aria-hidden="true" />{t(`dashboard.clinical.chart.${key}`)}</span>)}</div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("dashboard.clinical.chart.title")}>
          <svg viewBox="0 0 720 180" className="max-h-60 min-w-[560px] w-full" role="img" aria-labelledby={`${id}-description`}>
            <title id={`${id}-description`}>{t("dashboard.clinical.chart.tableCaption")}</title>
            {[0, max / 2, max].map((value) => <g key={value}>
              <line x1="35" x2="685" y1={y(value)} y2={y(value)} stroke="var(--line-soft)" strokeDasharray="3 4" />
              <text x="25" y={y(value) + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="11" direction="ltr">{formatNumber(value)}</text>
            </g>)}
            {series.map(({ key, color, dash }) => <polyline key={key} points={points.map((point) => `${x(point.day)},${y(point[key])}`).join(" ")} fill="none" stroke={color} strokeWidth="2.2" strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" />)}
            {points.map((point) => <text key={point.day} x={x(point.day)} y="166" textAnchor="middle" fill="var(--text-secondary)" fontSize="11" direction="ltr">{label(point.day)}</text>)}
          </svg>
        </div>
        <table className="sr-only">
          <caption>{t("dashboard.clinical.chart.tableCaption")}</caption>
          <thead><tr><th scope="col">{t("dashboard.clinical.chart.period")}</th>{series.map(({ key }) => <th key={key} scope="col">{t(`dashboard.clinical.chart.${key}`)}</th>)}</tr></thead>
          <tbody>{points.map((point) => <tr key={point.day}><th scope="row">{label(point.day)}</th>{series.map(({ key }) => <td key={key}>{formatNumber(point[key])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
