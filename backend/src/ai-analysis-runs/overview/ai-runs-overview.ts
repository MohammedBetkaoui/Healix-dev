// Pure rules of the workspace-wide follow-up of AI analysis runs: the query
// filter (always within the user's patients) and the summary figures.

import {
  AiAnalysisRunStatus,
  AiRunDecision,
  type Prisma,
} from '@prisma/client';

import { getTopPrediction } from '../ai-analysis-runs.service';
import {
  BRAIN_CLASS_LABELS,
  UNCERTAINTY_THRESHOLD,
} from '../report/ai-report-rules';
import { type AiRunDecisionFilter } from './ai-runs-overview.dto';

/** Under this many decisions (validated + corrected), no rate is reliable. */
export const MIN_DECISIONS_FOR_RATE = 10;

/** A correction may name a class the model does not know. */
export const RETAINED_LABELS = [...BRAIN_CLASS_LABELS, 'other'] as const;

export type RunsFilters = {
  decision?: AiRunDecisionFilter;
  status?: AiAnalysisRunStatus;
  from?: Date;
  to?: Date;
  requestedById?: string;
};

/**
 * Runs of the patients in scope, then the filters. The scope comes first and
 * is always there: a run of another workspace can match no filter.
 */
export function buildRunsWhere(
  patientScope: Prisma.PatientWhereInput,
  filters: RunsFilters,
): Prisma.AiAnalysisRunWhereInput {
  const and: Prisma.AiAnalysisRunWhereInput[] = [{ patient: patientScope }];

  if (filters.status) and.push({ status: filters.status });
  if (filters.decision === 'pending') {
    and.push({ decisionStatus: null, status: AiAnalysisRunStatus.SUCCEEDED });
  } else if (filters.decision) {
    and.push({ decisionStatus: filters.decision });
  }
  if (filters.from || filters.to) {
    and.push({
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }
  if (filters.requestedById) and.push({ requestedById: filters.requestedById });

  return { AND: and };
}

/** Pending runs wait longest first; everything else, the latest first. */
export function runsOrder(
  decision: AiRunDecisionFilter | undefined,
): Prisma.AiAnalysisRunOrderByWithRelationInput[] {
  const direction = decision === 'pending' ? 'asc' : 'desc';
  return [{ createdAt: direction }, { id: direction }];
}

/** A rate always comes with its counts; none under MIN_DECISIONS_FOR_RATE. */
export type Rate = {
  count: number;
  total: number;
  rate: number | null;
  insufficientData: boolean;
};

export function rateOf(count: number, total: number): Rate {
  const insufficientData = total < MIN_DECISIONS_FOR_RATE;
  return {
    count,
    insufficientData,
    rate: insufficientData ? null : count / total,
    total,
  };
}

export type SummaryRun = {
  status: AiAnalysisRunStatus;
  decisionStatus: AiRunDecision | null;
  decisionLabel: string | null;
  predictions: unknown;
  createdAt: Date;
};

export type AiRunsSummary = {
  period: { from: string | null; to: string | null };
  analyses: number;
  byStatus: Record<AiAnalysisRunStatus, number>;
  pending: {
    count: number;
    oldestCreatedAt: string | null;
    oldestAgeHours: number | null;
  };
  decisions: Record<AiRunDecision, number> & { total: number };
  minimumDecisions: number;
  /** Fewer than MIN_DECISIONS_FOR_RATE validated or corrected runs. */
  insufficientData: boolean;
  /** Physician / model agreement: VALIDATED / (VALIDATED + CORRECTED). */
  agreement: Rate;
  /** Validated and corrected runs: model's top class (rows) x class kept by the physician (columns). */
  matrix: {
    modelLabels: readonly string[];
    retainedLabels: readonly string[];
    counts: number[][];
  };
  uncertainty: {
    threshold: number;
    /** SUCCEEDED runs whose top-class probability is under the threshold. */
    belowThreshold: Rate;
    agreementAbove: Rate;
    agreementBelow: Rate;
  };
};

export function summarizeRuns(
  runs: readonly SummaryRun[],
  now: Date,
  period: { from?: Date; to?: Date } = {},
): AiRunsSummary {
  const byStatus = Object.fromEntries(
    Object.values(AiAnalysisRunStatus).map((status) => [status, 0]),
  ) as Record<AiAnalysisRunStatus, number>;
  const decisions = { CORRECTED: 0, REJECTED: 0, VALIDATED: 0, total: 0 };
  const counts = BRAIN_CLASS_LABELS.map(() => RETAINED_LABELS.map(() => 0));
  const agreement = { above: [0, 0], below: [0, 0], overall: [0, 0] };
  let pendingCount = 0;
  let oldestPending: Date | null = null;
  let scored = 0;
  let underThreshold = 0;

  for (const run of runs) {
    byStatus[run.status] += 1;
    if (run.status !== AiAnalysisRunStatus.SUCCEEDED) continue;

    const top = getTopPrediction(run.predictions);
    const below = top !== null && top.probability < UNCERTAINTY_THRESHOLD;
    if (top) {
      scored += 1;
      if (below) underThreshold += 1;
    }

    if (run.decisionStatus === null) {
      pendingCount += 1;
      if (!oldestPending || run.createdAt < oldestPending)
        oldestPending = run.createdAt;
      continue;
    }

    decisions[run.decisionStatus] += 1;
    decisions.total += 1;
    if (run.decisionStatus === AiRunDecision.REJECTED || !top) continue;

    const agrees = run.decisionStatus === AiRunDecision.VALIDATED ? 1 : 0;
    for (const bucket of [
      agreement.overall,
      below ? agreement.below : agreement.above,
    ]) {
      bucket[0] += agrees;
      bucket[1] += 1;
    }

    const row = BRAIN_CLASS_LABELS.indexOf(
      top.label as (typeof BRAIN_CLASS_LABELS)[number],
    );
    const column = RETAINED_LABELS.indexOf(
      (run.decisionLabel ?? '') as (typeof RETAINED_LABELS)[number],
    );
    if (row >= 0 && column >= 0) counts[row][column] += 1;
  }

  const decided = agreement.overall[1];
  return {
    agreement: rateOf(agreement.overall[0], decided),
    analyses: runs.length,
    byStatus,
    decisions,
    insufficientData: decided < MIN_DECISIONS_FOR_RATE,
    matrix: {
      counts,
      modelLabels: BRAIN_CLASS_LABELS,
      retainedLabels: RETAINED_LABELS,
    },
    minimumDecisions: MIN_DECISIONS_FOR_RATE,
    pending: {
      count: pendingCount,
      oldestAgeHours: oldestPending
        ? Math.floor((now.getTime() - oldestPending.getTime()) / 3_600_000)
        : null,
      oldestCreatedAt: oldestPending ? oldestPending.toISOString() : null,
    },
    period: {
      from: period.from ? period.from.toISOString() : null,
      to: period.to ? period.to.toISOString() : null,
    },
    uncertainty: {
      agreementAbove: rateOf(agreement.above[0], agreement.above[1]),
      agreementBelow: rateOf(agreement.below[0], agreement.below[1]),
      belowThreshold: rateOf(underThreshold, scored),
      threshold: UNCERTAINTY_THRESHOLD,
    },
  };
}
