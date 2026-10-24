// Pure rules of the "Suivi des analyses" page: its state in the URL, the
// API parameters it sends, and how rates are shown (never without their
// counts, never under the minimum of decisions).

import { type Locale } from "@/i18n";

import {
  aiPipelineIds,
  aiPriorityLevels,
  type AiAnalysisRunStatus,
  type AiPriorityLevel,
  type AiRunDecisionFilter,
  type AiRunsRate,
  type AiRunsSummary,
} from "./ai-analyses.types";
import { type AiRunsListParams, type AiRunsPeriodParams } from "./ai-analysis-runs.api";
import { UNCERTAINTY_THRESHOLD } from "./brain-evaluation";

export const TRACKING_TABS = ["worklist", "agreement"] as const;
export type TrackingTab = (typeof TRACKING_TABS)[number];

/** "all": no decision filter. */
export const TRACKING_DECISIONS = ["pending", "VALIDATED", "CORRECTED", "REJECTED", "all"] as const;
export type TrackingDecision = (typeof TRACKING_DECISIONS)[number];

export const TRACKING_STATUSES = ["all", "SUCCEEDED", "RUNNING", "FAILED", "REJECTED_INPUT"] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

/** "all": every chain. */
export const TRACKING_PIPELINES = ["all", ...aiPipelineIds] as const;
export type TrackingPipeline = (typeof TRACKING_PIPELINES)[number];

/** The order of the worklist: the reading priority, or the date (the latest first). */
export const TRACKING_SORTS = ["priority", "date"] as const;
export type TrackingSort = (typeof TRACKING_SORTS)[number];

/** "all": every reading priority. */
export const TRACKING_PRIORITIES = ["all", ...aiPriorityLevels] as const;
export type TrackingPriority = (typeof TRACKING_PRIORITIES)[number];

export const TRACKING_PERIODS = ["30d", "90d", "365d", "all"] as const;
export type TrackingPeriod = (typeof TRACKING_PERIODS)[number];

export const WORKLIST_PAGE_SIZE = 20;

export type TrackingState = {
  tab: TrackingTab;
  decision: TrackingDecision;
  status: TrackingStatus;
  pipeline: TrackingPipeline;
  sort: TrackingSort;
  /** Only this reading priority; it brings the priority order with it. */
  priority: TrackingPriority;
  /** YYYY-MM-DD (local day) or "". */
  from: string;
  to: string;
  /** Only the runs the user requested. */
  mine: boolean;
  page: number;
  /** Agreement tab. */
  period: TrackingPeriod;
};

/**
 * The worklist opens on the runs waiting for a decision, the ones the model
 * finds most suspicious first (an order of reading, not a diagnosis).
 */
export const DEFAULT_TRACKING_STATE: TrackingState = {
  decision: "pending",
  from: "",
  mine: false,
  page: 1,
  period: "90d",
  pipeline: "all",
  priority: "all",
  sort: "priority",
  status: "all",
  tab: "worklist",
  to: "",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** The page state from its query string; anything unknown falls back to the default. */
export function parseTrackingState(params: { get(name: string): string | null }): TrackingState {
  const page = Number(params.get("page"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return {
    decision: oneOf(TRACKING_DECISIONS, params.get("decision"), DEFAULT_TRACKING_STATE.decision),
    from: DAY.test(from) ? from : "",
    mine: params.get("mine") === "1",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    period: oneOf(TRACKING_PERIODS, params.get("period"), DEFAULT_TRACKING_STATE.period),
    pipeline: oneOf(TRACKING_PIPELINES, params.get("pipeline"), DEFAULT_TRACKING_STATE.pipeline),
    priority: oneOf(TRACKING_PRIORITIES, params.get("priority"), DEFAULT_TRACKING_STATE.priority),
    sort: oneOf(TRACKING_SORTS, params.get("sort"), DEFAULT_TRACKING_STATE.sort),
    status: oneOf(TRACKING_STATUSES, params.get("status"), DEFAULT_TRACKING_STATE.status),
    tab: oneOf(TRACKING_TABS, params.get("tab"), DEFAULT_TRACKING_STATE.tab),
    to: DAY.test(to) ? to : "",
  };
}

/** Query string of a state ("" for the defaults); default values are left out. */
export function buildTrackingSearch(state: TrackingState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_TRACKING_STATE.tab) params.set("tab", state.tab);
  if (state.decision !== DEFAULT_TRACKING_STATE.decision) params.set("decision", state.decision);
  if (state.status !== DEFAULT_TRACKING_STATE.status) params.set("status", state.status);
  if (state.pipeline !== DEFAULT_TRACKING_STATE.pipeline) params.set("pipeline", state.pipeline);
  if (state.priority !== DEFAULT_TRACKING_STATE.priority) params.set("priority", state.priority);
  if (state.sort !== DEFAULT_TRACKING_STATE.sort) params.set("sort", state.sort);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.mine) params.set("mine", "1");
  if (state.page > 1) params.set("page", String(state.page));
  if (state.period !== DEFAULT_TRACKING_STATE.period) params.set("period", state.period);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/**
 * What the worklist is really sorted by: a priority filter brings the priority
 * order with it (the backend lists that level in that order), whatever the
 * sort chosen.
 */
export function effectiveSort(state: Pick<TrackingState, "priority" | "sort">): TrackingSort {
  return state.priority !== "all" ? "priority" : state.sort;
}

/** Start of a local day, or its last millisecond, as an ISO instant. */
function localDayBound(day: string, end: boolean): string {
  return new Date(`${day}T${end ? "23:59:59.999" : "00:00:00.000"}`).toISOString();
}

/** GET /ai-analysis-runs parameters of the worklist. */
export function worklistParams(state: TrackingState): AiRunsListParams {
  return {
    decision: state.decision === "all" ? undefined : (state.decision satisfies AiRunDecisionFilter),
    from: state.from ? localDayBound(state.from, false) : undefined,
    limit: WORKLIST_PAGE_SIZE,
    page: state.page,
    pipeline: state.pipeline === "all" ? undefined : state.pipeline,
    priority: state.priority === "all" ? undefined : (state.priority satisfies AiPriorityLevel),
    requestedBy: state.mine ? "me" : undefined,
    // The API's own order is the date: only the priority is asked for.
    sort: state.sort === "priority" ? "priority" : undefined,
    status: state.status === "all" ? undefined : (state.status satisfies AiAnalysisRunStatus),
    to: state.to ? localDayBound(state.to, true) : undefined,
  };
}

const PERIOD_DAYS: Record<Exclude<TrackingPeriod, "all">, number> = { "30d": 30, "365d": 365, "90d": 90 };

/** The agreement period, from the start of the local day N days ago. */
export function periodParams(period: TrackingPeriod, now: Date): AiRunsPeriodParams {
  if (period === "all") return {};
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - PERIOD_DAYS[period]);
  return { from: start.toISOString() };
}

/** No percentage at all while the decisions are too few for a reliable rate. */
export function ratesHidden(summary: Pick<AiRunsSummary, "insufficientData">): boolean {
  return summary.insufficientData;
}

export type FormattedRate = { percent: string; count: string; total: string };

/**
 * A rate and its counts ("66,7 %", "8", "12"); null when it must not be
 * shown: under the minimum of decisions, globally or for that rate.
 */
export function formatRate(
  rate: AiRunsRate,
  locale: Locale,
  summary?: Pick<AiRunsSummary, "insufficientData">,
): FormattedRate | null {
  if (rate.rate === null || rate.insufficientData || (summary && ratesHidden(summary))) return null;
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  return {
    count: new Intl.NumberFormat(intlLocale).format(rate.count),
    percent: new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1, style: "percent" }).format(rate.rate),
    total: new Intl.NumberFormat(intlLocale).format(rate.total),
  };
}

/** Same threshold as the result page's "Résultat incertain". */
export function isUncertainProbability(probability: number | null): boolean {
  return probability !== null && probability < UNCERTAINTY_THRESHOLD;
}

/** Age of the oldest pending run, in days once it reaches 48 hours. */
export function pendingAge(hours: number | null): { unit: "hours" | "days"; value: number } | null {
  if (hours === null) return null;
  return hours >= 48 ? { unit: "days", value: Math.floor(hours / 24) } : { unit: "hours", value: hours };
}
