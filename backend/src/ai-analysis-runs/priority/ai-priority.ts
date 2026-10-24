// The reading order of the AI analyses: which results the model itself finds
// suspicious, and that no physician has reviewed yet, come first.
//
// This is an ORDER OF READING, never a diagnosis: the model's answer is not
// reviewed, and the level says only "look at this one sooner". It is computed
// when the runs are read, from fields already stored (no column, no
// migration), so changing a threshold below changes every list at once.
//
// What each chain stores, and what is read from it:
//   brain             `predictions`: [{ label, probability }] over glioma,
//                     meningioma, notumor, pituitary (a softmax).
//   pathology-breast  `malignancyScore` and `decisionThreshold` (BreakHis: a
//                     score, not a probability), `modelDecision`.
//   cardio-ecg        `predictions`: { positive: classes at or above their
//                     threshold, probabilities: per class, independent }.
//   cardio-seg-mri    `predictions`: { structures: { LV, RV, MYO: { pixels } },
//                     noStructureFound }.
//   pathology-nuclei  `nucleiFractions`: { background, nucleusTypes }.

import {
  AiAnalysisRunStatus,
  type AiRunDecision,
  type Prisma,
} from '@prisma/client';

import {
  BRAIN_CLASS_LABELS,
  UNCERTAINTY_THRESHOLD,
} from '../report/ai-report-rules';

export const AI_PRIORITY_LEVELS = ['URGENT', 'HIGH', 'ROUTINE'] as const;
export type AiPriorityLevel = (typeof AI_PRIORITY_LEVELS)[number];

/** Why a run has its level: a code and numbers, which the screen words. */
export type AiPriorityReasonCode =
  | 'ALREADY_DECIDED'
  | 'BRAIN_GLIOMA'
  | 'BRAIN_TUMOR_POSSIBLE'
  | 'BRAIN_TUMOR_PREDICTED'
  | 'BREAST_ABOVE_THRESHOLD'
  | 'BREAST_BORDERLINE'
  | 'BREAST_MALIGNANT'
  | 'CARDIO_NO_STRUCTURE'
  | 'CARDIO_STRUCTURE_ABSENT'
  | 'ECG_MI'
  | 'ECG_MULTIPLE_ABNORMAL'
  | 'LOW_CONFIDENCE'
  | 'NO_RESULT'
  | 'NUCLEI_NONE_FOUND';

export type AiPriorityReason = {
  code: AiPriorityReasonCode;
  /** Probabilities and scores as stored (0 to 1), counts, structure names. */
  params?: Record<string, number | string>;
};

export type AiPriority = {
  level: AiPriorityLevel;
  /** 0 to 100; the bands below make the score order runs as the level does. */
  score: number;
  reasons: AiPriorityReason[];
};

// ------------------------------------------------------------- thresholds

/**
 * Score bands: ROUTINE 0-39, HIGH 40-69, URGENT 70-100. Inside a band the
 * score grows with how strongly the model points at the finding, so sorting
 * by score alone gives the same order as sorting by level, then strength.
 */
const BANDS = {
  HIGH: { floor: 40, span: 29 },
  ROUTINE: { floor: 0, span: 39 },
  URGENT: { floor: 70, span: 30 },
} as const;

/**
 * Brain. A glioma as the top class with at least this probability is URGENT
 * (the aggressive tumour of the four, and the model leans on it); under it,
 * as for a meningioma or a pituitary tumour whatever their probability, the
 * run is HIGH. A "no tumour" answer is ROUTINE unless the three tumour
 * classes together still weigh at least BRAIN_TUMOR_POSSIBLE_MIN: then the
 * model hesitates and a missed tumour costs more than a second look (HIGH).
 */
export const BRAIN_GLIOMA_URGENT_MIN_PROBABILITY = 0.5;
export const BRAIN_TUMOR_POSSIBLE_MIN_PROBABILITY = 0.3;

/**
 * Breast (BreakHis score against the model's decision threshold). From the
 * threshold up the run is HIGH; once the score has covered half of the way
 * from the threshold to 1 it is URGENT. Just under the threshold, from 80 %
 * of it, the answer "benign" is borderline: HIGH. Below, ROUTINE.
 */
export const BREAST_URGENT_MARGIN = 0.5;
export const BREAST_BORDERLINE_RATIO = 0.8;

/**
 * Nuclei: under this share of non-background pixels (0.1 %), no nucleus was
 * found: the map is empty, which is worth a look (HIGH).
 */
export const NUCLEI_ABSENT_MAX_SHARE = 0.001;

const ECG_URGENT_CLASS = 'MI';
const ECG_ABNORMAL_CLASSES = ['MI', 'STTC', 'CD', 'HYP'] as const;
/** Two abnormal classes or more on one ECG: HIGH. */
export const ECG_MULTIPLE_ABNORMAL_MIN = 2;

const CARDIO_STRUCTURES = ['LV', 'RV', 'MYO'] as const;

// ------------------------------------------------------------------ input

/** What the priority reads of a run (a stored AiAnalysisRun has all of it). */
export type PriorityRun = {
  decisionStatus: AiRunDecision | null;
  decisionThreshold: number | null;
  malignancyScore: number | null;
  modelDecision: string | null;
  nucleiFractions: Prisma.JsonValue | null;
  pipeline: string;
  predictions: Prisma.JsonValue | null;
  status: AiAnalysisRunStatus;
};

export const PRIORITY_RUN_SELECT = {
  createdAt: true,
  decisionStatus: true,
  decisionThreshold: true,
  id: true,
  malignancyScore: true,
  modelDecision: true,
  nucleiFractions: true,
  pipeline: true,
  predictions: true,
  status: true,
} as const satisfies Prisma.AiAnalysisRunSelect;

// ------------------------------------------------------------------ rules

type Finding = {
  level: AiPriorityLevel;
  /** How strongly the model points at it, 0 to 1, within the level's band. */
  strength: number;
  reasons: AiPriorityReason[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const routine = (strength = 0): Finding => ({
  level: 'ROUTINE',
  reasons: [],
  strength,
});

function brainFinding(predictions: unknown): Finding {
  if (!Array.isArray(predictions)) return routine();

  const known = new Map<string, number>();
  for (const prediction of predictions as unknown[]) {
    if (
      isRecord(prediction) &&
      typeof prediction.label === 'string' &&
      isNumber(prediction.probability)
    ) {
      known.set(prediction.label, prediction.probability);
    }
  }
  const top = [...known.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || !(BRAIN_CLASS_LABELS as readonly string[]).includes(top[0])) {
    return routine();
  }

  const [label, probability] = top;
  const tumorProbability = clamp01(
    [...known.entries()]
      .filter(([name]) => name !== 'notumor')
      .reduce((sum, [, value]) => sum + value, 0),
  );
  const reasons: AiPriorityReason[] = [];
  let finding: Finding;

  if (label === 'notumor') {
    finding =
      tumorProbability >= BRAIN_TUMOR_POSSIBLE_MIN_PROBABILITY
        ? {
            level: 'HIGH',
            reasons: [
              {
                code: 'BRAIN_TUMOR_POSSIBLE',
                params: { probability: tumorProbability },
              },
            ],
            strength: tumorProbability,
          }
        : routine(tumorProbability);
  } else if (
    label === 'glioma' &&
    probability >= BRAIN_GLIOMA_URGENT_MIN_PROBABILITY
  ) {
    finding = {
      level: 'URGENT',
      reasons: [{ code: 'BRAIN_GLIOMA', params: { probability } }],
      strength: tumorProbability,
    };
  } else {
    finding = {
      level: 'HIGH',
      reasons: [
        { code: 'BRAIN_TUMOR_PREDICTED', params: { label, probability } },
      ],
      strength: tumorProbability,
    };
  }

  // The result page's own "uncertain" line: the model is not sure of its top
  // class. Said whatever the level.
  if (probability < UNCERTAINTY_THRESHOLD) {
    reasons.push({ code: 'LOW_CONFIDENCE', params: { probability } });
  }

  return { ...finding, reasons: [...finding.reasons, ...reasons] };
}

function breastFinding(run: PriorityRun): Finding {
  const { decisionThreshold: threshold, malignancyScore: score } = run;

  if (!isNumber(score) || !isNumber(threshold) || threshold <= 0) {
    // No usable score: only the stored answer is left to read.
    return run.modelDecision === 'malignant'
      ? {
          level: 'HIGH',
          reasons: [{ code: 'BREAST_MALIGNANT' }],
          strength: 0.5,
        }
      : routine();
  }

  const params = { score, threshold };
  // The three edges of the score, in order: where "borderline" starts, the
  // threshold, and where URGENT starts (half of the way from it to 1). The
  // strength grows along the whole line, so that a higher score never ranks
  // lower, whichever side of the threshold it is on.
  const borderlineFrom = threshold * BREAST_BORDERLINE_RATIO;
  const urgentFrom = threshold + (1 - threshold) * BREAST_URGENT_MARGIN;

  if (score >= urgentFrom) {
    return {
      level: 'URGENT',
      reasons: [{ code: 'BREAST_MALIGNANT', params }],
      strength: (score - urgentFrom) / (1 - urgentFrom || 1),
    };
  }

  if (score >= borderlineFrom) {
    return {
      level: 'HIGH',
      reasons: [
        {
          code:
            score >= threshold ? 'BREAST_ABOVE_THRESHOLD' : 'BREAST_BORDERLINE',
          params,
        },
      ],
      strength: (score - borderlineFrom) / (urgentFrom - borderlineFrom),
    };
  }

  return routine(score / borderlineFrom);
}

function ecgFinding(predictions: unknown): Finding {
  if (!isRecord(predictions) || !Array.isArray(predictions.positive)) {
    return routine();
  }

  const positive = (predictions.positive as unknown[]).filter(
    (name): name is string => typeof name === 'string',
  );
  const probabilities = isRecord(predictions.probabilities)
    ? predictions.probabilities
    : {};
  const probabilityOf = (name: string) =>
    isNumber(probabilities[name]) ? probabilities[name] : 0;
  const abnormal = positive.filter((name) =>
    (ECG_ABNORMAL_CLASSES as readonly string[]).includes(name),
  );
  const multiple: AiPriorityReason = {
    code: 'ECG_MULTIPLE_ABNORMAL',
    params: { count: abnormal.length },
  };

  if (positive.includes(ECG_URGENT_CLASS)) {
    return {
      level: 'URGENT',
      reasons: [
        {
          code: 'ECG_MI',
          params: { probability: probabilityOf(ECG_URGENT_CLASS) },
        },
        ...(abnormal.length >= ECG_MULTIPLE_ABNORMAL_MIN ? [multiple] : []),
      ],
      strength: clamp01(probabilityOf(ECG_URGENT_CLASS)),
    };
  }

  if (abnormal.length >= ECG_MULTIPLE_ABNORMAL_MIN) {
    return {
      level: 'HIGH',
      reasons: [multiple],
      strength: clamp01(
        abnormal.reduce((sum, name) => sum + probabilityOf(name), 0) /
          abnormal.length,
      ),
    };
  }

  // NORM alone (not an abnormal class), or a single abnormal class: read in
  // the usual order.
  return routine(
    clamp01(
      Math.max(0, ...ECG_ABNORMAL_CLASSES.map((name) => probabilityOf(name))),
    ),
  );
}

function cardioSegFinding(predictions: unknown): Finding {
  if (!isRecord(predictions) || !isRecord(predictions.structures)) {
    return routine();
  }

  const structures = predictions.structures;
  const absent = CARDIO_STRUCTURES.filter((name) => {
    const area = structures[name];
    return !isRecord(area) || !isNumber(area.pixels) || area.pixels <= 0;
  });

  if (
    predictions.noStructureFound === true ||
    absent.length === CARDIO_STRUCTURES.length
  ) {
    return {
      level: 'HIGH',
      reasons: [{ code: 'CARDIO_NO_STRUCTURE' }],
      strength: 1,
    };
  }

  return absent.length > 0
    ? {
        level: 'HIGH',
        reasons: absent.map((structure) => ({
          code: 'CARDIO_STRUCTURE_ABSENT' as const,
          params: { structure },
        })),
        strength: absent.length / CARDIO_STRUCTURES.length,
      }
    : routine();
}

function nucleiFinding(fractions: unknown): Finding {
  if (!isRecord(fractions) || !isNumber(fractions.background)) return routine();

  const types = isRecord(fractions.nucleusTypes)
    ? Object.values(fractions.nucleusTypes)
    : [];
  // The service answers every type null when there is no nucleus at all.
  const noNucleus =
    fractions.background >= 1 - NUCLEI_ABSENT_MAX_SHARE ||
    (types.length > 0 && types.every((share) => share === null));

  return noNucleus
    ? { level: 'HIGH', reasons: [{ code: 'NUCLEI_NONE_FOUND' }], strength: 1 }
    : routine();
}

function findingOf(run: PriorityRun): Finding {
  switch (run.pipeline) {
    case 'brain':
      return brainFinding(run.predictions);
    case 'pathology-breast':
      return breastFinding(run);
    case 'cardio-ecg':
      return ecgFinding(run.predictions);
    case 'cardio-seg-mri':
      return cardioSegFinding(run.predictions);
    case 'pathology-nuclei':
      return nucleiFinding(run.nucleiFractions);
    default:
      return routine();
  }
}

const scoreOf = (level: AiPriorityLevel, strength: number) =>
  BANDS[level].floor + Math.round(BANDS[level].span * clamp01(strength));

/**
 * The reading priority of a run. A run with no result (failed, still running)
 * or already decided by a physician is ROUTINE with a score of 0: there is
 * nothing left to review first.
 */
export function computeAiPriority(run: PriorityRun): AiPriority {
  if (run.decisionStatus !== null) {
    return {
      level: 'ROUTINE',
      reasons: [{ code: 'ALREADY_DECIDED' }],
      score: 0,
    };
  }

  if (run.status !== AiAnalysisRunStatus.SUCCEEDED) {
    return { level: 'ROUTINE', reasons: [{ code: 'NO_RESULT' }], score: 0 };
  }

  const finding = findingOf(run);

  return {
    level: finding.level,
    reasons: finding.reasons,
    score: scoreOf(finding.level, finding.strength),
  };
}

// ---------------------------------------------------------------- ordering

const LEVEL_RANK: Record<AiPriorityLevel, number> = {
  HIGH: 1,
  ROUTINE: 0,
  URGENT: 2,
};

type Ranked = { createdAt: Date; id: string; priority: AiPriority };

/**
 * Most urgent first; at equal score the run that has waited longest, then the
 * id, so the order never changes between two requests.
 */
export function comparePriority(a: Ranked, b: Ranked): number {
  return (
    LEVEL_RANK[b.priority.level] - LEVEL_RANK[a.priority.level] ||
    b.priority.score - a.priority.score ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** The runs to review, in reading order; `level` keeps one level only. */
export function rankByPriority<
  T extends PriorityRun & { createdAt: Date; id: string },
>(
  runs: readonly T[],
  level?: AiPriorityLevel,
): { priority: AiPriority; run: T }[] {
  return runs
    .map((run) => ({ priority: computeAiPriority(run), run }))
    .filter((entry) => level === undefined || entry.priority.level === level)
    .sort((a, b) =>
      comparePriority(
        { ...a.run, priority: a.priority },
        { ...b.run, priority: b.priority },
      ),
    );
}
