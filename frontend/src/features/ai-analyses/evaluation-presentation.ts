// Pure rules that turn the service evaluation (brain-evaluation.ts) into what
// the result page and the model sheet show. No figure is typed here: every
// number comes from the evaluation passed in (the measured one by default).

import { type Locale } from "@/i18n";

import {
  brainClassificationEvaluation,
  brainEvaluationSource,
  type BrainClassificationEvaluation,
  type BrainClassLabel,
  type EvaluationInterval,
  UNCERTAINTY_THRESHOLD,
} from "./brain-evaluation";

/**
 * Label smoothing of the classifier's training loss, from the training
 * notebook (healixdz-model-brain.ipynb: CrossEntropyLoss(..., label_smoothing=0.1)).
 * Not a measured value: it explains, probably, why the probabilities stop
 * short of 1.
 */
export const TRAINING_LABEL_SMOOTHING = 0.1;

/** Above this measured precision, a glioma or pituitary result gets no confusion warning. */
export const CONFUSION_PRECISION_FLOOR = 0.98;

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-DZ" : "fr-DZ");

/** The evaluation describes these classifier weights only. */
export function evaluationMatchesWeights(
  classifierSha256: string | null,
  expected: string = brainEvaluationSource.weightsSha256["brain-efficientnetb4-tumor-classification"],
): boolean {
  return classifierSha256 !== null && classifierSha256 === expected;
}

export type ConfidenceSplit = {
  threshold: number;
  aboveCount: number;
  /** Accuracy of the test results at or above the threshold (the table's row). */
  aboveAccuracy: number;
  belowCount: number;
  /** Deduced from the totals: (right overall - right above) / images below. */
  belowAccuracy: number;
};

/**
 * Accuracy under and over a confidence threshold, from the accuracy-by-
 * confidence row of that threshold and the overall accuracy.
 */
export function getConfidenceSplit(
  evaluation: BrainClassificationEvaluation = brainClassificationEvaluation,
  threshold: number = UNCERTAINTY_THRESHOLD,
): ConfidenceSplit | null {
  const row = evaluation.accuracyByConfidence.find((entry) => Math.abs(entry.threshold - threshold) < 1e-9);
  if (!row || row.accuracy === null) return null;

  const belowCount = evaluation.testImages - row.count;
  if (belowCount <= 0) return null;

  // Both are ratios of whole counts: rounding removes the float error.
  const rightOverall = Math.round(evaluation.accuracy.value * evaluation.testImages);
  const rightAbove = Math.round(row.accuracy * row.count);
  return {
    threshold,
    aboveCount: row.count,
    aboveAccuracy: row.accuracy,
    belowCount,
    belowAccuracy: (rightOverall - rightAbove) / belowCount,
  };
}

/** "Résultat incertain": the top-class probability is under the threshold. */
export function isUncertain(topProbability: number | null, threshold: number = UNCERTAINTY_THRESHOLD): boolean {
  return topProbability !== null && topProbability < threshold;
}

export type ConfusionWarning = {
  /** missedGlioma: gliomas among the results of this class; otherClasses: any other true class. */
  kind: "missedGlioma" | "otherClasses";
  predicted: BrainClassLabel;
  /** N: wrong results of that kind among the M results of the predicted class. */
  count: number;
  /** M: test results of the predicted class (its column of the matrix). */
  total: number;
  /** A "no tumour" result: also says a negative result does not rule a glioma out. */
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
  evaluation: BrainClassificationEvaluation = brainClassificationEvaluation,
): ConfusionWarning | null {
  const { labels, matrix } = evaluation.confusionMatrix;
  const column = labels.findIndex((label) => label === predicted);
  if (column < 0) return null;

  const label = labels[column];
  const total = matrix.reduce((sum, row) => sum + row[column], 0);
  if (total === 0) return null;

  const gliomaRow = labels.indexOf("glioma");
  const gliomas = gliomaRow >= 0 && label !== "glioma" ? matrix[gliomaRow][column] : 0;
  const right = matrix[column][column];

  if (label === "notumor") {
    return { count: gliomas, kind: "missedGlioma", negative: true, predicted: label, total };
  }
  if (label === "meningioma") {
    return gliomas > 0 ? { count: gliomas, kind: "missedGlioma", negative: false, predicted: label, total } : null;
  }
  if (right / total > CONFUSION_PRECISION_FLOOR) return null;
  return gliomas > 0
    ? { count: gliomas, kind: "missedGlioma", negative: false, predicted: label, total }
    : { count: total - right, kind: "otherClasses", negative: false, predicted: label, total };
}

export type ProbabilityCeiling = {
  /** What label smoothing trains the right class towards: 1 - e + e / classes. */
  target: number;
  /** Lowest threshold of the table that no test image reached; null if every one was. */
  unreachedThreshold: number | null;
};

export function getProbabilityCeiling(
  evaluation: BrainClassificationEvaluation = brainClassificationEvaluation,
  labelSmoothing: number = TRAINING_LABEL_SMOOTHING,
): ProbabilityCeiling {
  const classes = evaluation.confusionMatrix.labels.length;
  const unreached = [...evaluation.accuracyByConfidence]
    .sort((a, b) => a.threshold - b.threshold)
    .find((row) => row.count === 0);
  return {
    target: 1 - labelSmoothing + labelSmoothing / classes,
    unreachedThreshold: unreached ? unreached.threshold : null,
  };
}

/**
 * Wraps a number or range put into a translated sentence in Unicode isolates
 * (FSI ... PDI), so it keeps its own direction inside Arabic text.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}

/** A percentage with at most one decimal ("72,2 %"). */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1, style: "percent" }).format(value);
}

/** Bounds of a 95 % interval with two decimals, as the metrics: "94,44 % – 96,44 %", "0,98 – 0,99". */
export function formatInterval(ci: EvaluationInterval, unit: "percent" | "score", locale: Locale): string {
  const format = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: unit === "percent" ? "percent" : "decimal",
  });
  return `${format.format(ci[0])} – ${format.format(ci[1])}`;
}

/** "9 octobre 2026" from "2026-10-09" (noon, so no time zone shifts the day). */
export function formatEvaluationDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(`${date}T12:00:00`));
}
