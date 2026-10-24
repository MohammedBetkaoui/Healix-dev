// The evolution of a patient's AI analyses of one chain (GET
// /patients/:id/ai-timeline, backend/src/ai-analysis-runs/timeline): the
// comparable measures of each run, oldest first, and how two runs differ.
//
// A difference is only worth what the two runs share: the same model weights,
// the same kind of source, and a pixel spacing when an area is compared.
// compareTimelineItems applies those rules to ANY two runs (the backend only
// compares neighbours), the same ones, so that the screen and the API agree.

import {
  type AiPipelineId,
  type AiRunDecision,
} from "./ai-analyses.types";

export type MeasureUnit = "mm2" | "probability" | "px" | "ratio" | "score";

export type MeasureInfo = {
  key: string;
  unit: MeasureUnit;
  /** A physical area: needs the pixel spacing to mean the same from one image to the next. */
  area: boolean;
};

export type Caveat = "MODEL_CHANGED" | "NO_PIXEL_SPACING" | "SOURCE_CHANGED";
export const CAVEATS: readonly Caveat[] = ["MODEL_CHANGED", "NO_PIXEL_SPACING", "SOURCE_CHANGED"];

export type SourceKind = "dicom" | "image" | "signal";

export type Delta = {
  /** later - earlier, in the unit of the measure. */
  value: number;
  /** Relative to the earlier value; null when that is 0. */
  percent: number | null;
};

export type Comparison = {
  previousRunId: string;
  deltas: Record<string, Delta | null>;
  labelChanged: boolean;
  caveats: Caveat[];
  reliable: boolean;
};

/** The slice of a DICOM study a run was made on ("Série 3, coupe n° 12"). */
export type TimelineSlice = {
  instanceNumber: number | null;
  seriesNumber: number | null;
};

export type TimelineItem = {
  runId: string;
  createdAt: string;
  sourceDocumentId: string;
  /** Set when the source is a slice of a DICOM study; null otherwise. */
  slice: TimelineSlice | null;
  label: string | null;
  labels: string[] | null;
  decisionStatus: AiRunDecision | null;
  decisionLabel: string | null;
  model: {
    id: string | null;
    weightsSha256: string | null;
    segmentationId: string | null;
    segmentationWeightsSha256: string | null;
  };
  source: SourceKind;
  pixelSpacingMm: [number, number] | null;
  hasMask: boolean;
  hasOverlay: boolean;
  hasSlice: boolean;
  hasTrace: boolean;
  measures: Record<string, number | null>;
  comparison: Comparison | null;
};

export type AiTimeline = {
  patientId: string;
  pipeline: AiPipelineId;
  measures: MeasureInfo[];
  primaryMeasure: string;
  items: TimelineItem[];
};

/** The chains whose measures are areas: a 2D surface is not a volume. */
export const AREA_PIPELINES: readonly AiPipelineId[] = ["brain", "cardio-seg-mri"];

export const hasAreaMeasures = (pipeline: AiPipelineId) => AREA_PIPELINES.includes(pipeline);

// ------------------------------------------------------------- comparison

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function deltaOf(later: number | null, earlier: number | null): Delta | null {
  if (later === null || earlier === null) return null;

  return {
    percent: earlier === 0 ? null : round(((later - earlier) / earlier) * 100, 2),
    value: round(later - earlier, 6),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((label) => b.includes(label));

type Comparable = Pick<TimelineItem, "label" | "labels" | "measures" | "model" | "pixelSpacingMm" | "source">;

// The same weights, never assumed: unknown weights are not "the same". The
// brain segmenter counts only when both runs used one.
function sameModel(later: Comparable, earlier: Comparable): boolean {
  const same = (a: string | null, b: string | null) => a !== null && a === b;
  const classifier = later.model.id === earlier.model.id && same(later.model.weightsSha256, earlier.model.weightsSha256);
  const bothSegmented = later.model.segmentationWeightsSha256 !== null && earlier.model.segmentationWeightsSha256 !== null;
  const segmenter =
    !bothSegmented ||
    (later.model.segmentationId === earlier.model.segmentationId &&
      same(later.model.segmentationWeightsSha256, earlier.model.segmentationWeightsSha256));

  return classifier && segmenter;
}

/** How `later` differs from `earlier`, and whether that can be trusted. */
export function compareTimelineItems(
  measures: readonly MeasureInfo[],
  later: TimelineItem,
  earlier: TimelineItem,
): Comparison {
  const deltas: Record<string, Delta | null> = {};
  for (const { key } of measures) {
    deltas[key] = deltaOf(later.measures[key] ?? null, earlier.measures[key] ?? null);
  }

  const caveats: Caveat[] = [];
  if (!sameModel(later, earlier)) caveats.push("MODEL_CHANGED");

  // An area in pixels is a physical size only with the pixel spacing.
  const pixelAreaCompared = measures.some(({ area, key, unit }) => area && unit === "px" && deltas[key] !== null);
  if (pixelAreaCompared && (later.pixelSpacingMm === null || earlier.pixelSpacingMm === null)) {
    caveats.push("NO_PIXEL_SPACING");
  }

  if (later.source !== earlier.source) caveats.push("SOURCE_CHANGED");

  return {
    caveats,
    deltas,
    labelChanged:
      later.labels !== null && earlier.labels !== null ? !sameSet(later.labels, earlier.labels) : later.label !== earlier.label,
    previousRunId: earlier.runId,
    reliable: caveats.length === 0,
  };
}

// ---------------------------------------------------------------- choosing

/** The two runs compared at first: the last two, the earlier one first. */
export function defaultPair(items: readonly TimelineItem[]): { earlierId: string; laterId: string } | null {
  if (items.length < 2) return null;
  return { earlierId: items[items.length - 2].runId, laterId: items[items.length - 1].runId };
}

/** The two runs in the order of their dates, whichever way they were picked. */
export function orderPair(
  items: readonly TimelineItem[],
  firstId: string,
  secondId: string,
): { earlier: TimelineItem; later: TimelineItem } | null {
  const first = items.find((item) => item.runId === firstId);
  const second = items.find((item) => item.runId === secondId);
  if (!first || !second || first.runId === second.runId) return null;

  return Date.parse(first.createdAt) <= Date.parse(second.createdAt)
    ? { earlier: first, later: second }
    : { earlier: second, later: first };
}

/** The chain with the most runs to follow: where the tab opens. */
export function busiestPipeline(
  runs: readonly { pipeline: AiPipelineId; status: string }[],
  fallback: AiPipelineId = "brain",
): AiPipelineId {
  const counts = new Map<AiPipelineId, number>();
  for (const run of runs) {
    if (run.status === "SUCCEEDED") counts.set(run.pipeline, (counts.get(run.pipeline) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : fallback;
}

export function countSucceeded(
  runs: readonly { pipeline: AiPipelineId; status: string }[],
  pipeline: AiPipelineId,
): number {
  return runs.filter((run) => run.pipeline === pipeline && run.status === "SUCCEEDED").length;
}

/** The measures worth offering: those at least one run has a value for. */
export function availableMeasures(timeline: Pick<AiTimeline, "items" | "measures">): MeasureInfo[] {
  return timeline.measures.filter((measure) => timeline.items.some((item) => item.measures[measure.key] !== null));
}

/** The result of a run in words: its class, the BreakHis result, the classes of an ECG. */
export function resultText(item: Pick<TimelineItem, "label" | "labels">, translate: (key: string) => string): string {
  if (item.labels !== null) {
    return item.labels.length > 0 ? item.labels.map((label) => translate(`aiAnalyses.classes.${label}`)).join(", ") : "—";
  }
  return item.label ? translate(`aiAnalyses.classes.${item.label}`) : "—";
}

/** Whole days between two runs, by the day they were made. */
export function daysBetween(earlierIso: string, laterIso: string): number {
  const day = (iso: string) => Math.floor(Date.parse(iso) / 86_400_000);
  return Math.max(0, day(laterIso) - day(earlierIso));
}

// ------------------------------------------------------------------ format

type Locale = "ar" | "fr";
const intl = (locale: Locale) => (locale === "ar" ? "ar-DZ" : "fr-DZ");

/** A measure as a reader reads it, with its unit. */
export function formatMeasure(value: number | null, unit: MeasureUnit, locale: Locale): string {
  if (value === null) return "—";
  const tag = intl(locale);
  switch (unit) {
    case "probability":
      return new Intl.NumberFormat(tag, { maximumFractionDigits: 1, style: "percent" }).format(value);
    case "ratio":
      return new Intl.NumberFormat(tag, { maximumFractionDigits: 2, style: "percent" }).format(value);
    case "score":
      return new Intl.NumberFormat(tag, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
    case "mm2":
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)} mm²`;
    default:
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(value)} px`;
  }
}

/** A difference, signed: "+200 px", "-1,5 points" for a share, "+0,12" for a score. */
export function formatDelta(delta: Delta | null, unit: MeasureUnit, locale: Locale): string {
  if (delta === null) return "—";
  const tag = intl(locale);
  const signed = (digits: number) =>
    new Intl.NumberFormat(tag, { maximumFractionDigits: digits, signDisplay: "exceptZero" }).format(delta.value);

  switch (unit) {
    case "probability":
    case "ratio":
      // A change in a share is a number of points, not of percent.
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(delta.value * 100)} pt`;
    case "score":
      return signed(2);
    case "mm2":
      return `${signed(1)} mm²`;
    default:
      return `${signed(0)} px`;
  }
}

export function formatPercentChange(delta: Delta | null, locale: Locale): string {
  if (delta === null || delta.percent === null) return "—";
  return `${new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(delta.percent)} %`;
}

export function formatDay(iso: string, locale: Locale, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(intl(locale), {
    day: "numeric",
    month: style === "long" ? "long" : "short",
    timeZone: "Africa/Algiers",
    year: style === "long" ? "numeric" : "2-digit",
  }).format(new Date(iso));
}

// ------------------------------------------------------------------- chart

export type ChartPoint = {
  runId: string;
  createdAt: string;
  value: number;
  /** Position in time among the dates of the chart, 0 to 1. */
  x: number;
  /** Position between the bottom (0) and the top (1) of the axis. */
  y: number;
  /** The comparison with the run before it cannot be trusted. */
  unreliable: boolean;
};

export type MeasureChart = {
  points: ChartPoint[];
  /** Axis bounds, in the unit of the measure. */
  min: number;
  max: number;
  ticks: number[];
};

/** A round top for an axis starting at 0: 1, 2, 2.5, 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return step * power;
}

/**
 * The line of one measure over time. A probability or a score is drawn on
 * 0..1; a share from 0 to a round top; an area between its extremes with some
 * room, so that a change of a few % is visible (never under 0).
 */
export function buildMeasureChart(items: readonly TimelineItem[], measure: MeasureInfo): MeasureChart | null {
  const rows = items
    .filter((item) => item.measures[measure.key] !== null)
    .map((item) => ({ item, time: Date.parse(item.createdAt), value: item.measures[measure.key] as number }));
  if (rows.length === 0) return null;

  const values = rows.map((row) => row.value);
  const high = Math.max(...values);
  const low = Math.min(...values);
  let min: number;
  let max: number;

  if (measure.unit === "probability" || measure.unit === "score") {
    min = 0;
    max = 1;
  } else if (measure.unit === "ratio") {
    min = 0;
    max = niceMax(high);
  } else {
    const room = (high - low || high || 1) * 0.15;
    min = Math.max(0, low - room);
    max = high + room;
  }

  const first = Math.min(...rows.map((row) => row.time));
  const last = Math.max(...rows.map((row) => row.time));
  const ticks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);

  return {
    max,
    min,
    points: rows.map(({ item, time, value }) => ({
      createdAt: item.createdAt,
      runId: item.runId,
      unreliable: item.comparison !== null && !item.comparison.reliable,
      value,
      x: last === first ? 0.5 : (time - first) / (last - first),
      y: max === min ? 0.5 : (value - min) / (max - min),
    })),
    ticks,
  };
}
