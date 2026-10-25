"use client";

import { useId } from "react";

import { curveGeometry, phaseNumber } from "@/features/ai-analyses/volumetry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

type VolumeCurveChartProps = {
  /** The LV volume of every phase, ml, with the slices kept. */
  curve: readonly number[];
  /** The phases shown as end-diastole and end-systole (the form's, before they are saved). */
  edPhase: number;
  esPhase: number;
  /** The model's own phases, drawn hollow when they differ. */
  proposed?: { edPhase: number; esPhase: number } | null;
  locale: Locale;
  t: TranslationFunction;
};

/**
 * The volume of the left ventricle over the cardiac cycle, with end-diastole and
 * end-systole marked. The chart is a picture of the figures; a table of the
 * same figures is there for a screen reader.
 */
export function VolumeCurveChart({ curve, edPhase, esPhase, locale, proposed, t }: VolumeCurveChartProps) {
  const id = useId();
  const geometry = curveGeometry(curve);
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 0 });
  const { plot, points, size, xTicks, yTicks } = geometry;
  const volumes = curve.length > 0 ? curve : [0];
  const summary = t("aiAnalyses.run.volumetry.curve.summary", {
    count: number.format(curve.length),
    ed: phaseNumber(edPhase),
    es: phaseNumber(esPhase),
    max: number.format(Math.max(...volumes)),
    min: number.format(Math.min(...volumes)),
  });
  const marker = (phase: number, short: string, hollow: boolean) => {
    const point = points[phase];
    if (!point) return null;
    return (
      <g key={`${short}-${hollow ? "model" : "kept"}`}>
        <circle
          cx={point.x}
          cy={point.y}
          r={hollow ? 6 : 5}
          fill={hollow ? "var(--surface)" : "var(--ai)"}
          stroke="var(--ai)"
          strokeDasharray={hollow ? "2 2" : undefined}
          strokeWidth={1.8}
        />
        {hollow ? null : (
          <text
            x={point.x}
            y={Math.max(point.y - 10, plot.top - 2)}
            textAnchor="middle"
            className="fill-[var(--text-primary)] text-[11px] font-semibold"
          >
            {short}
          </text>
        )}
      </g>
    );
  };

  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-labelledby={`${id}-title`}
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="h-auto w-full max-w-3xl"
        data-volume-curve="true"
      >
        <title id={`${id}-title`}>{summary}</title>
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke="var(--border)" strokeWidth={0.6} />
            <text x={plot.left - 6} y={tick.y + 3.5} textAnchor="end" className="fill-[var(--text-secondary)] text-[10px]">
              {number.format(tick.value)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick.phase} x={tick.x} y={plot.bottom + 14} textAnchor="middle" className="fill-[var(--text-secondary)] text-[10px]">
            {phaseNumber(tick.phase)}
          </text>
        ))}
        <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} stroke="var(--text-secondary)" strokeWidth={0.8} />
        <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} stroke="var(--text-secondary)" strokeWidth={0.8} />
        <polyline
          fill="none"
          points={points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}
          stroke="var(--ai)"
          strokeLinejoin="round"
          strokeWidth={1.8}
        />
        {points.map((point) => (
          <circle key={point.phase} cx={point.x} cy={point.y} r={2.2} fill="var(--ai)" />
        ))}
        {proposed && proposed.edPhase !== edPhase ? marker(proposed.edPhase, t("aiAnalyses.run.volumetry.phases.edShort"), true) : null}
        {proposed && proposed.esPhase !== esPhase ? marker(proposed.esPhase, t("aiAnalyses.run.volumetry.phases.esShort"), true) : null}
        {marker(edPhase, t("aiAnalyses.run.volumetry.phases.edShort"), false)}
        {marker(esPhase, t("aiAnalyses.run.volumetry.phases.esShort"), false)}
        <text x={(plot.left + plot.right) / 2} y={size.height - 4} textAnchor="middle" className="fill-[var(--text-secondary)] text-[10px]">
          {t("aiAnalyses.run.volumetry.curve.xAxis")}
        </text>
        <text
          x={10}
          y={(plot.top + plot.bottom) / 2}
          textAnchor="middle"
          transform={`rotate(-90 10 ${(plot.top + plot.bottom) / 2})`}
          className="fill-[var(--text-secondary)] text-[10px]"
        >
          {t("aiAnalyses.run.volumetry.curve.yAxis")}
        </text>
      </svg>
      <table className="sr-only">
        <caption>{summary}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.phase}>
              <th scope="row">{phaseNumber(point.phase)}</th>
              <td>{t("aiAnalyses.run.volumetry.curve.point", { phase: phaseNumber(point.phase), volume: number.format(point.volume) })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
