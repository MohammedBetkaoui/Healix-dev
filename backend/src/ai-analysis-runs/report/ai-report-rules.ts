// The measured performance of the brain pipeline, read from the evaluation
// report of ai-service/scripts/evaluate_brain.py, and the warnings drawn from
// it. These rules are EXACTLY those of the frontend result page
// (frontend/src/features/ai-analyses/evaluation-presentation.ts, threshold in
// brain-evaluation.ts): ai-report-rules.spec.ts replays the frontend's test
// cases and checks both constants against the frontend sources.

export const BRAIN_CLASS_LABELS = [
  'glioma',
  'meningioma',
  'notumor',
  'pituitary',
] as const;
export type BrainClassLabel = (typeof BRAIN_CLASS_LABELS)[number];

export const CLASSIFIER_MODEL_ID = 'brain-efficientnetb4-tumor-classification';

/** Under this top-class probability, the result is shown as uncertain. */
export const UNCERTAINTY_THRESHOLD = 0.9;

/** Above this measured precision, a glioma or pituitary result gets no confusion warning. */
export const CONFUSION_PRECISION_FLOOR = 0.98;

export type ConfidenceThresholdRow = {
  threshold: number;
  count: number;
  coverage: number;
  accuracy: number | null;
};

export type ClassificationEvaluation = {
  testImages: number;
  accuracy: { value: number; ci95: readonly [number, number] };
  perClass: Readonly<Record<BrainClassLabel, { recall: number }>>;
  confusionMatrix: {
    labels: readonly BrainClassLabel[];
    matrix: readonly (readonly number[])[];
  };
  accuracyByConfidence: readonly ConfidenceThresholdRow[];
};

export type EvaluationReport = {
  /** Name of the source report (brain-<date>-<HHMMSS>-<sha8>.json). */
  file: string;
  generatedAt: string;
  /** SHA-256 of the classifier weights the figures describe. */
  classifierSha256: string | null;
  /** Images per class of the test set. */
  imagesPerClass: Readonly<Record<BrainClassLabel, number>>;
  classification: ClassificationEvaluation;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The parts of brain-latest.json the report needs; null when the file is not
 * a complete evaluation report (then no figure is printed).
 */
export function parseEvaluationReport(json: unknown): EvaluationReport | null {
  if (!isRecord(json) || !isRecord(json.classification)) return null;
  const classification = json.classification;
  if (classification.status !== 'ok') return null;

  const accuracy = classification.accuracy;
  const matrix = isRecord(classification.confusionMatrix)
    ? classification.confusionMatrix
    : null;
  const perClass = isRecord(classification.perClass)
    ? classification.perClass
    : null;
  const dataset = isRecord(classification.dataset)
    ? classification.dataset
    : null;
  const rows = classification.accuracyByConfidence;
  const weights = isRecord(json.weights) ? json.weights : {};
  const classifierWeights = weights[CLASSIFIER_MODEL_ID];

  if (
    !isNumber(classification.n) ||
    !isRecord(accuracy) ||
    !isNumber(accuracy.value) ||
    !Array.isArray(accuracy.ci95) ||
    !matrix ||
    !Array.isArray(matrix.labels) ||
    !Array.isArray(matrix.matrix) ||
    !perClass ||
    !dataset ||
    !isRecord(dataset.imagesPerClass) ||
    !Array.isArray(rows) ||
    typeof json.file !== 'string' ||
    typeof json.generatedAt !== 'string'
  ) {
    return null;
  }

  const labels = matrix.labels as string[];
  if (
    labels.length !== BRAIN_CLASS_LABELS.length ||
    labels.some((label, index) => label !== BRAIN_CLASS_LABELS[index])
  ) {
    return null;
  }

  const recall = (label: BrainClassLabel) => {
    const entry = perClass[label];
    return isRecord(entry) && isNumber(entry.recall) ? entry.recall : NaN;
  };
  const images = dataset.imagesPerClass;

  return {
    classification: {
      accuracy: {
        ci95: [Number(accuracy.ci95[0]), Number(accuracy.ci95[1])],
        value: accuracy.value,
      },
      accuracyByConfidence: (rows as Record<string, unknown>[]).map((row) => ({
        accuracy: isNumber(row.accuracy) ? row.accuracy : null,
        count: Number(row.count),
        coverage: Number(row.coverage),
        threshold: Number(row.threshold),
      })),
      confusionMatrix: {
        labels: BRAIN_CLASS_LABELS,
        matrix: (matrix.matrix as unknown[][]).map((row) => row.map(Number)),
      },
      perClass: {
        glioma: { recall: recall('glioma') },
        meningioma: { recall: recall('meningioma') },
        notumor: { recall: recall('notumor') },
        pituitary: { recall: recall('pituitary') },
      },
      testImages: classification.n,
    },
    classifierSha256:
      isRecord(classifierWeights) &&
      typeof classifierWeights.sha256 === 'string'
        ? classifierWeights.sha256
        : null,
    file: json.file,
    generatedAt: json.generatedAt,
    imagesPerClass: {
      glioma: Number(images.glioma),
      meningioma: Number(images.meningioma),
      notumor: Number(images.notumor),
      pituitary: Number(images.pituitary),
    },
  };
}

/** The evaluation describes these classifier weights only. */
export function evaluationMatchesWeights(
  classifierSha256: string | null,
  expected: string | null,
): boolean {
  return (
    classifierSha256 !== null &&
    expected !== null &&
    classifierSha256 === expected
  );
}

export type ConfidenceSplit = {
  threshold: number;
  aboveCount: number;
  aboveAccuracy: number;
  belowCount: number;
  /** Deduced from the totals: (right overall - right above) / images below. */
  belowAccuracy: number;
};

export function getConfidenceSplit(
  evaluation: ClassificationEvaluation,
  threshold: number = UNCERTAINTY_THRESHOLD,
): ConfidenceSplit | null {
  const row = evaluation.accuracyByConfidence.find(
    (entry) => Math.abs(entry.threshold - threshold) < 1e-9,
  );
  if (!row || row.accuracy === null) return null;

  const belowCount = evaluation.testImages - row.count;
  if (belowCount <= 0) return null;

  // Both are ratios of whole counts: rounding removes the float error.
  const rightOverall = Math.round(
    evaluation.accuracy.value * evaluation.testImages,
  );
  const rightAbove = Math.round(row.accuracy * row.count);
  return {
    aboveAccuracy: row.accuracy,
    aboveCount: row.count,
    belowAccuracy: (rightOverall - rightAbove) / belowCount,
    belowCount,
    threshold,
  };
}

export function isUncertain(
  topProbability: number | null,
  threshold: number = UNCERTAINTY_THRESHOLD,
): boolean {
  return topProbability !== null && topProbability < threshold;
}

export type ConfusionWarning = {
  kind: 'missedGlioma' | 'otherClasses';
  predicted: BrainClassLabel;
  count: number;
  total: number;
  negative: boolean;
};

/**
 * Warning for the predicted class, read from the confusion matrix:
 * - notumor: always, with the gliomas among the "no tumour" results;
 * - meningioma: the gliomas among the "meningioma" results, if any;
 * - glioma, pituitary: nothing while the measured precision exceeds
 *   CONFUSION_PRECISION_FLOOR; otherwise the gliomas among the results (or,
 *   for glioma or without any glioma, every other true class).
 */
export function getConfusionWarning(
  predicted: string | null,
  evaluation: ClassificationEvaluation,
): ConfusionWarning | null {
  const { labels, matrix } = evaluation.confusionMatrix;
  const column = labels.findIndex((label) => label === predicted);
  if (column < 0) return null;

  const label = labels[column];
  const total = matrix.reduce((sum, row) => sum + row[column], 0);
  if (total === 0) return null;

  const gliomaRow = labels.indexOf('glioma');
  const gliomas =
    gliomaRow >= 0 && label !== 'glioma' ? matrix[gliomaRow][column] : 0;
  const right = matrix[column][column];

  if (label === 'notumor') {
    return {
      count: gliomas,
      kind: 'missedGlioma',
      negative: true,
      predicted: label,
      total,
    };
  }
  if (label === 'meningioma') {
    return gliomas > 0
      ? {
          count: gliomas,
          kind: 'missedGlioma',
          negative: false,
          predicted: label,
          total,
        }
      : null;
  }
  if (right / total > CONFUSION_PRECISION_FLOOR) return null;
  return gliomas > 0
    ? {
        count: gliomas,
        kind: 'missedGlioma',
        negative: false,
        predicted: label,
        total,
      }
    : {
        count: total - right,
        kind: 'otherClasses',
        negative: false,
        predicted: label,
        total,
      };
}
