// The model monitoring board: how the physicians judge each AI model, month
// after month (GET /ai-analysis-runs/model-monitoring, and its twin in the
// back-office). The figures are the backend's; this file reads them for the
// screen: the period asked for, the model's name, the curve, the formats.

import { findModel } from "./ai-models.registry";

// ---- What the API answers (mirrors backend/src/ai-analysis-runs/monitoring)

export type DriftState = {
  alert: boolean;
  /** Decisions on a class (validated + corrected) over the months before. */
  baselineDecisions: number;
  /** Corrections / decisions on a class over the months before. */
  baselineRate: number | null;
  /** The month's rate minus the baseline, in points. */
  deltaPoints: number | null;
};

export type MonthlyModelStats = {
  month: string;
  runs: number;
  succeeded: number;
  failed: number;
  rejectedInput: number;
  decided: number;
  validated: number;
  corrected: number;
  rejected: number;
  /** Corrected / (validated + corrected); null for a map, or without a decision on a class. */
  correctionRate: number | null;
  medianDecisionMs: number | null;
  medianInferenceMs: number | null;
  drift: DriftState;
};

export type ConfusionMatrix = {
  modelLabels: string[];
  retainedLabels: string[];
  /** Rows: what the model said. Columns: what the physician kept. */
  counts: number[][];
};

export type ModelMonitoringEntry = {
  pipeline: string;
  /** null: runs that failed before any model answered, on a chain with several. */
  modelId: string | null;
  /** A classifier is corrected; a segmentation map is validated or rejected only. */
  correctionApplicable: boolean;
  months: MonthlyModelStats[];
  alert: { baselineRate: number; deltaPoints: number; month: string; rate: number } | null;
  matrix: ConfusionMatrix | null;
};

export type ModelMonitoring = {
  period: { from: string; to: string };
  timeZone: string;
  thresholds: { baselineMonths: number; driftPoints: number; minDecisions: number };
  models: ModelMonitoringEntry[];
};

export type ModelMonitoringParams = { from?: string; to?: string };

// ---- The period

export const MONITORING_PERIODS = [6, 12, 24] as const;
export type MonitoringMonths = (typeof MONITORING_PERIODS)[number];
export const DEFAULT_MONITORING_PERIOD: MonitoringMonths = 12;

const MONITORING_TIME_ZONE = "Africa/Algiers";

/** "YYYY-MM": the month of an instant in Algiers, where the board counts. */
export function algiersMonthKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: MONITORING_TIME_ZONE, year: "numeric" })
    .format(date)
    .slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

// The last N months, the current one included. `from` falls in the middle of
// its month (the backend rounds it down to the 1st): no hour of the day can
// move it to another month, whatever the zone of the browser. The backend
// serves 24 months at most: N = 24 is exactly that.
export function monitoringParams(months: MonitoringMonths, now: Date): ModelMonitoringParams {
  const first = shiftMonthKey(algiersMonthKey(now), -(months - 1));
  return { from: `${first}-15T12:00:00.000Z` };
}

// ---- Names and formats

/** The model as the physician knows it: its name, or the raw id of a model the registry has not. */
export function modelName(modelId: string | null, translate: (key: string) => string): string {
  if (modelId === null) return translate("aiAnalyses.monitoring.unknownModel");
  return findModel(modelId) ? translate(`aiAnalyses.models.${modelId}.name`) : modelId;
}

export function entryKey(entry: Pick<ModelMonitoringEntry, "modelId" | "pipeline">): string {
  return `${entry.pipeline}:${entry.modelId ?? ""}`;
}

export function monthLabel(month: string, locale: "ar" | "fr", style: "long" | "short" = "long"): string {
  // The 15th at noon, read in UTC: the month, whatever the zone of the browser.
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    month: style,
    timeZone: "UTC",
    year: style === "long" ? "numeric" : "2-digit",
  }).format(new Date(`${month}-15T12:00:00.000Z`));
}

export function formatPercent(rate: number | null, locale: "ar" | "fr"): string {
  if (rate === null) return "—";
  return new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" }).format(rate);
}

export function formatPoints(points: number, locale: "ar" | "fr"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, signDisplay: "always" }).format(points);
}

export type DurationParts = { unit: "days" | "hours" | "minutes" | "ms" | "seconds"; value: number };

// The unit that reads best: 850 ms, 2.3 s, 12 min, 3.5 h, 2 d.
export function durationParts(ms: number): DurationParts {
  if (ms < 1_000) return { unit: "ms", value: Math.round(ms) };
  if (ms < 60_000) return { unit: "seconds", value: Math.round(ms / 100) / 10 };
  if (ms < 3_600_000) return { unit: "minutes", value: Math.round(ms / 6_000) / 10 };
  if (ms < 86_400_000) return { unit: "hours", value: Math.round(ms / 360_000) / 10 };
  return { unit: "days", value: Math.round(ms / 8_640_000) / 10 };
}

export function formatDuration(
  ms: number | null,
  locale: "ar" | "fr",
  translate: (key: string, params: { value: string }) => string,
): string {
  if (ms === null) return "—";
  const { unit, value } = durationParts(ms);
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1 }).format(value);
  return translate(`aiAnalyses.monitoring.duration.${unit}`, { value: formatted });
}

// ---- The board

export function hasRuns(data: ModelMonitoring): boolean {
  return data.models.some((entry) => entry.months.some((month) => month.runs > 0));
}

export function alertedModels(data: ModelMonitoring): ModelMonitoringEntry[] {
  return data.models.filter((entry) => entry.alert !== null);
}

/** Decisions on a class (validated + corrected): what a correction rate is made of. */
export const judgedOf = (month: Pick<MonthlyModelStats, "corrected" | "validated">) => month.corrected + month.validated;

export type DriftStatus = "alert" | "map" | "noBaseline" | "noDecision" | "stable" | "tooFewDecisions";

// What the badge of a model says, from its latest month: an alert, or why
// there is none. "stable" is said only when the rate could have been judged:
// enough decisions in the month and in the months it is compared with.
export function driftStatus(entry: ModelMonitoringEntry, minDecisions: number): DriftStatus {
  if (!entry.correctionApplicable) return "map";
  if (entry.alert) return "alert";

  const latest = entry.months[entry.months.length - 1];
  if (!latest || judgedOf(latest) === 0) return "noDecision";
  if (judgedOf(latest) < minDecisions) return "tooFewDecisions";
  if (latest.drift.baselineDecisions < minDecisions) return "noBaseline";

  return "stable";
}

// ---- The curve

export type ChartPoint = {
  month: string;
  /** Position among the months of the chart, 0..1. */
  x: number;
  /** null: no decision on a class that month: the line breaks there. */
  rate: number | null;
  /** Position of the rate between 0 and yMax, 0 (bottom) .. 1 (top); null without rate. */
  y: number | null;
  drift: boolean;
  judged: number;
  corrected: number;
};

export type ChartSeries = { key: string; entry: ModelMonitoringEntry; points: ChartPoint[] };

export type ChartData = {
  months: string[];
  /** The top of the axis, a round rate (never under 20 %). */
  yMax: number;
  series: ChartSeries[];
};

// The curve of each model that can be corrected and has a rate, over the
// months of the whole board (a model with no run one month has a gap there).
export function buildChartData(data: ModelMonitoring): ChartData {
  const months = [...new Set(data.models.flatMap((entry) => entry.months.map((month) => month.month)))].sort();
  const series = data.models.filter(
    (entry) => entry.correctionApplicable && entry.months.some((month) => month.correctionRate !== null),
  );
  const highest = Math.max(0, ...series.flatMap((entry) => entry.months.map((month) => month.correctionRate ?? 0)));
  const yMax = Math.min(1, Math.max(0.2, Math.ceil(highest * 10) / 10));

  return {
    months,
    series: series.map((entry) => ({
      entry,
      key: entryKey(entry),
      points: months.map((month, index) => {
        const row = entry.months.find((candidate) => candidate.month === month);
        const rate = row?.correctionRate ?? null;
        return {
          corrected: row?.corrected ?? 0,
          drift: row?.drift.alert ?? false,
          judged: row ? judgedOf(row) : 0,
          month,
          rate,
          x: months.length === 1 ? 0.5 : index / (months.length - 1),
          y: rate === null ? null : rate / yMax,
        };
      }),
    })),
    yMax,
  };
}

/** The runs of consecutive points that have a rate: a month without one breaks the line. */
export function lineSegments(points: readonly ChartPoint[]): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];

  for (const point of points) {
    if (point.y === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 0) segments.push(current);

  return segments;
}
