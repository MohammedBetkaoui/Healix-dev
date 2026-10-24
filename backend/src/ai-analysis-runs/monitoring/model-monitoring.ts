// Pure rules of the model monitoring board: how the physicians judge each AI
// model, month after month, to spot a model that is getting worse. The runs
// come from the scope of the caller (a workspace, or everything for the
// back-office); nothing here reads the database.

import {
  AiAnalysisRunStatus,
  AiRunDecision,
  type Prisma,
} from '@prisma/client';

import {
  DASHBOARD_TIME_ZONE,
  localDayKey,
  localMidnight,
} from '../../dashboard/dashboard-period';
import { CORRECTION_LABELS } from '../dto/decide-ai-analysis-run.dto';
import {
  AI_PIPELINES,
  type AiPipeline,
} from '../dto/create-ai-analysis-run.dto';
import { getModelLabel, MAP_PIPELINES } from '../ai-analysis-runs.service';

/** The months are those of the practices: Algiers, whatever the server's zone. */
export const MONITORING_TIME_ZONE = DASHBOARD_TIME_ZONE;

/** A month is compared with the average of this many months before it. */
export const DRIFT_BASELINE_MONTHS = 3;

/** The correction rate must exceed the baseline by more than this, in points. */
export const DRIFT_THRESHOLD_POINTS = 10;

/**
 * Decisions on a class (validated + corrected) needed, in the month and in the
 * baseline, before a rise can be called a drift: under it a rate is noise.
 */
export const DRIFT_MIN_DECISIONS = 20;

export const DEFAULT_MONITORING_MONTHS = 12;
export const MAX_MONITORING_MONTHS = 24;

export type MonitoringRun = {
  classificationModelId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  decisionLabel: string | null;
  decisionStatus: AiRunDecision | null;
  durationMs: number | null;
  modelDecision: string | null;
  pipeline: string;
  predictions: Prisma.JsonValue | null;
  segmentationModelId: string | null;
  status: AiAnalysisRunStatus;
};

export const MONITORING_RUN_SELECT = {
  classificationModelId: true,
  createdAt: true,
  decidedAt: true,
  decisionLabel: true,
  decisionStatus: true,
  durationMs: true,
  modelDecision: true,
  pipeline: true,
  predictions: true,
  segmentationModelId: true,
  status: true,
} as const satisfies Prisma.AiAnalysisRunSelect;

// ---------------------------------------------------------------- months

/** "YYYY-MM", the month of an instant in Algiers. */
export function monthKeyOf(date: Date): string {
  return localDayKey(date, MONITORING_TIME_ZONE).slice(0, 7);
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}

/** The instant the month starts, midnight of its 1st in Algiers. */
export function monthStart(monthKey: string): Date {
  return localMidnight(`${monthKey}-01`, MONITORING_TIME_ZONE);
}

export function monthsBetween(first: string, last: string): number {
  const [firstYear, firstMonth] = first.split('-').map(Number);
  const [lastYear, lastMonth] = last.split('-').map(Number);

  return (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1;
}

export type MonitoringWindow = {
  /** The first and last months shown (whole months; the last may be running). */
  firstMonth: string;
  lastMonth: string;
  /** Where the runs are read from: the baseline months come first. */
  fetchFrom: Date;
  to: Date;
};

/** Why a period cannot be served: the caller turns it into a 400. */
export type MonitoringWindowError = 'INVALID_PERIOD' | 'PERIOD_TOO_LONG';

/**
 * The months asked for: `from` rounds down to the start of its month, `to`
 * defaults to now and `from` to eleven months before it. The three months
 * before `from` are read too, as the baseline of the first months shown.
 */
export function resolveMonitoringWindow(
  period: { from?: Date; to?: Date },
  now: Date,
): MonitoringWindow | MonitoringWindowError {
  const to = period.to ?? now;
  const lastMonth = monthKeyOf(to);
  const firstMonth = period.from
    ? monthKeyOf(period.from)
    : shiftMonth(lastMonth, -(DEFAULT_MONITORING_MONTHS - 1));

  if (period.from && period.from > to) return 'INVALID_PERIOD';
  if (monthsBetween(firstMonth, lastMonth) > MAX_MONITORING_MONTHS) {
    return 'PERIOD_TOO_LONG';
  }

  return {
    fetchFrom: monthStart(shiftMonth(firstMonth, -DRIFT_BASELINE_MONTHS)),
    firstMonth,
    lastMonth,
    to,
  };
}

// ----------------------------------------------------------------- output

export type DriftState = {
  alert: boolean;
  /** Decisions on a class (validated + corrected) over the baseline months. */
  baselineDecisions: number;
  /** Corrections / decisions on a class, over the baseline months. */
  baselineRate: number | null;
  /** Rate of the month minus the baseline, in points (null without baseline). */
  deltaPoints: number | null;
};

export type MonthlyModelStats = {
  month: string;
  runs: number;
  succeeded: number;
  failed: number;
  rejectedInput: number;
  /** VALIDATED + CORRECTED + REJECTED. */
  decided: number;
  validated: number;
  corrected: number;
  rejected: number;
  /**
   * Corrected / (validated + corrected): the physicians who took a position
   * on the class, the rejection of an analysis (a bad image) not counting.
   * null for a map (never corrected) and without any decision on a class.
   */
  correctionRate: number | null;
  /** Median time from the analysis to the physician's decision. */
  medianDecisionMs: number | null;
  /** Median duration of the model's inference. */
  medianInferenceMs: number | null;
  drift: DriftState;
};

export type ConfusionMatrix = {
  modelLabels: readonly string[];
  retainedLabels: readonly string[];
  /** Rows: what the model said. Columns: what the physician kept. */
  counts: number[][];
};

export type ModelMonitoringEntry = {
  pipeline: string;
  /** null: runs that failed before any model answered, on a chain with several. */
  modelId: string | null;
  /** A classifier can be corrected, a segmentation map only validated or rejected. */
  correctionApplicable: boolean;
  months: MonthlyModelStats[];
  /** The latest month shown, when its correction rate is a drift. */
  alert: {
    baselineRate: number;
    deltaPoints: number;
    month: string;
    rate: number;
  } | null;
  /** Single-label classifiers only (brain, breast): not the ECG, not the maps. */
  matrix: ConfusionMatrix | null;
};

export type ModelMonitoring = {
  period: { from: string; to: string };
  timeZone: string;
  thresholds: {
    baselineMonths: number;
    driftPoints: number;
    minDecisions: number;
  };
  models: ModelMonitoringEntry[];
};

// ------------------------------------------------------------ computation

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** The model a run is judged on: the classifier, else the segmenter. */
function ownModelId(run: MonitoringRun): string | null {
  return run.classificationModelId ?? run.segmentationModelId;
}

/**
 * Runs that failed before any model answered carry no model id: they go to
 * the chain's model when it has one only, else stay apart (null).
 */
function modelIdsByPipeline(runs: readonly MonitoringRun[]) {
  const seen = new Map<string, Set<string>>();

  for (const run of runs) {
    const id = ownModelId(run);
    if (!id) continue;
    const ids = seen.get(run.pipeline) ?? new Set<string>();
    ids.add(id);
    seen.set(run.pipeline, ids);
  }

  return (run: MonitoringRun): string | null => {
    const own = ownModelId(run);
    if (own) return own;
    const ids = seen.get(run.pipeline);

    return ids && ids.size === 1 ? [...ids][0] : null;
  };
}

type MonthTally = {
  corrected: number;
  decided: number;
  decisionDelays: number[];
  failed: number;
  inferenceDurations: number[];
  rejected: number;
  rejectedInput: number;
  runs: number;
  succeeded: number;
  validated: number;
};

const emptyTally = (): MonthTally => ({
  corrected: 0,
  decided: 0,
  decisionDelays: [],
  failed: 0,
  inferenceDurations: [],
  rejected: 0,
  rejectedInput: 0,
  runs: 0,
  succeeded: 0,
  validated: 0,
});

const judgedOf = (tally: Pick<MonthTally, 'corrected' | 'validated'>) =>
  tally.corrected + tally.validated;

function matrixFor(pipeline: string): {
  modelLabels: readonly string[];
  retainedLabels: readonly string[];
} | null {
  if (MAP_PIPELINES.has(pipeline)) return null;
  const retained = CORRECTION_LABELS[pipeline as AiPipeline] ?? [];
  // The ECG is multi-label (no single label to cross): no matrix.
  if (retained.length === 0) return null;

  return {
    modelLabels: retained.filter((label) => label !== 'other'),
    retainedLabels: retained,
  };
}

function driftOf(
  month: string,
  tallies: ReadonlyMap<string, MonthTally>,
  correctionApplicable: boolean,
): DriftState {
  const none: DriftState = {
    alert: false,
    baselineDecisions: 0,
    baselineRate: null,
    deltaPoints: null,
  };
  if (!correctionApplicable) return none;

  const baseline = { corrected: 0, judged: 0 };
  for (let back = 1; back <= DRIFT_BASELINE_MONTHS; back += 1) {
    const tally = tallies.get(shiftMonth(month, -back));
    if (!tally) continue;
    baseline.corrected += tally.corrected;
    baseline.judged += judgedOf(tally);
  }
  if (baseline.judged === 0) return none;

  const current = tallies.get(month);
  const judged = current ? judgedOf(current) : 0;
  if (!current || judged === 0) {
    return {
      ...none,
      baselineDecisions: baseline.judged,
      baselineRate: baseline.corrected / baseline.judged,
    };
  }

  const rate = current.corrected / judged;
  const baselineRate = baseline.corrected / baseline.judged;
  // rate - baselineRate > threshold / 100, without floating point: both rates
  // are fractions of integers.
  const exceeds =
    (current.corrected * baseline.judged - baseline.corrected * judged) * 100 >
    DRIFT_THRESHOLD_POINTS * judged * baseline.judged;
  const enough =
    judged >= DRIFT_MIN_DECISIONS && baseline.judged >= DRIFT_MIN_DECISIONS;

  return {
    alert: enough && exceeds,
    baselineDecisions: baseline.judged,
    baselineRate,
    deltaPoints: Math.round((rate - baselineRate) * 1000) / 10,
  };
}

/**
 * The board: one entry per model (chain + model id), one row per month with
 * runs, from `firstMonth` to `lastMonth`. The runs may start earlier (the
 * baseline months); those months are not returned.
 */
export function buildModelMonitoring(
  runs: readonly MonitoringRun[],
  window: Pick<MonitoringWindow, 'firstMonth' | 'lastMonth' | 'to'>,
): ModelMonitoring {
  const modelOf = modelIdsByPipeline(runs);
  const groups = new Map<
    string,
    {
      matrix: number[][] | null;
      modelId: string | null;
      pipeline: string;
      tallies: Map<string, MonthTally>;
    }
  >();

  for (const run of runs) {
    const modelId = modelOf(run);
    const key = `${run.pipeline}\u0000${modelId ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      const labels = matrixFor(run.pipeline);
      group = {
        matrix: labels
          ? labels.modelLabels.map(() => labels.retainedLabels.map(() => 0))
          : null,
        modelId,
        pipeline: run.pipeline,
        tallies: new Map(),
      };
      groups.set(key, group);
    }

    const month = monthKeyOf(run.createdAt);
    const tally = group.tallies.get(month) ?? emptyTally();
    group.tallies.set(month, tally);

    tally.runs += 1;
    if (run.status === AiAnalysisRunStatus.SUCCEEDED) tally.succeeded += 1;
    if (run.status === AiAnalysisRunStatus.FAILED) tally.failed += 1;
    if (run.status === AiAnalysisRunStatus.REJECTED_INPUT) {
      tally.rejectedInput += 1;
    }
    if (run.durationMs !== null) tally.inferenceDurations.push(run.durationMs);

    if (!run.decisionStatus) continue;
    tally.decided += 1;
    if (run.decidedAt) {
      tally.decisionDelays.push(
        Math.max(0, run.decidedAt.getTime() - run.createdAt.getTime()),
      );
    }
    if (run.decisionStatus === AiRunDecision.VALIDATED) tally.validated += 1;
    if (run.decisionStatus === AiRunDecision.CORRECTED) tally.corrected += 1;
    if (run.decisionStatus === AiRunDecision.REJECTED) tally.rejected += 1;

    // The matrix reads the months shown, and the decisions on a class only.
    const labels = matrixFor(run.pipeline);
    if (
      group.matrix &&
      labels &&
      month >= window.firstMonth &&
      month <= window.lastMonth &&
      run.decisionStatus !== AiRunDecision.REJECTED
    ) {
      const row = labels.modelLabels.indexOf(getModelLabel(run) ?? '');
      const column = labels.retainedLabels.indexOf(run.decisionLabel ?? '');
      if (row >= 0 && column >= 0) group.matrix[row][column] += 1;
    }
  }

  const pipelineRank = (pipeline: string) => {
    const rank = (AI_PIPELINES as readonly string[]).indexOf(pipeline);
    return rank === -1 ? AI_PIPELINES.length : rank;
  };

  const models = [...groups.values()]
    .map((group): ModelMonitoringEntry => {
      const correctionApplicable = !MAP_PIPELINES.has(group.pipeline);
      const months = [...group.tallies.keys()]
        .filter((m) => m >= window.firstMonth && m <= window.lastMonth)
        .sort()
        .map((month): MonthlyModelStats => {
          const tally = group.tallies.get(month) as MonthTally;
          const judged = judgedOf(tally);

          return {
            corrected: tally.corrected,
            correctionRate:
              correctionApplicable && judged > 0
                ? tally.corrected / judged
                : null,
            decided: tally.decided,
            drift: driftOf(month, group.tallies, correctionApplicable),
            failed: tally.failed,
            medianDecisionMs: median(tally.decisionDelays),
            medianInferenceMs: median(tally.inferenceDurations),
            month,
            rejected: tally.rejected,
            rejectedInput: tally.rejectedInput,
            runs: tally.runs,
            succeeded: tally.succeeded,
            validated: tally.validated,
          };
        });
      const latest = months[months.length - 1];
      const labels = matrixFor(group.pipeline);

      return {
        alert:
          latest?.drift.alert &&
          latest.correctionRate !== null &&
          latest.drift.baselineRate !== null &&
          latest.drift.deltaPoints !== null
            ? {
                baselineRate: latest.drift.baselineRate,
                deltaPoints: latest.drift.deltaPoints,
                month: latest.month,
                rate: latest.correctionRate,
              }
            : null,
        correctionApplicable,
        matrix:
          labels && group.matrix
            ? {
                counts: group.matrix,
                modelLabels: labels.modelLabels,
                retainedLabels: labels.retainedLabels,
              }
            : null,
        modelId: group.modelId,
        months,
        pipeline: group.pipeline,
      };
    })
    // A model with runs only before the months shown has nothing to show.
    .filter((entry) => entry.months.length > 0)
    .sort(
      (a, b) =>
        pipelineRank(a.pipeline) - pipelineRank(b.pipeline) ||
        (a.modelId ?? '').localeCompare(b.modelId ?? ''),
    );

  return {
    models,
    period: {
      from: monthStart(window.firstMonth).toISOString(),
      to: window.to.toISOString(),
    },
    thresholds: {
      baselineMonths: DRIFT_BASELINE_MONTHS,
      driftPoints: DRIFT_THRESHOLD_POINTS,
      minDecisions: DRIFT_MIN_DECISIONS,
    },
    timeZone: MONITORING_TIME_ZONE,
  };
}
