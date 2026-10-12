// Pure rules of the histopathology results (result page, model sheet). Every
// figure comes from pathology-evaluation.ts (the measured one by default).

import { type Locale } from "@/i18n";

import { aiMagnifications } from "./ai-analyses.types";
import {
  breakhisEvaluation,
  pannukeEvaluationSource,
  pathologyEvaluationSource,
  type BreakhisEvaluation,
  type MagnificationMetrics,
} from "./pathology-evaluation";

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-DZ" : "fr-DZ");

export type BreastWarning = {
  /** falsePositive: benign images among the "malignant" results; falseNegative: malignant ones among the "benign" results. */
  kind: "falsePositive" | "falseNegative";
  count: number;
  total: number;
};

/** The test figures at one magnification; null for a magnification never measured. */
export function getMagnificationMetrics(
  magnification: number | null,
  evaluation: BreakhisEvaluation = breakhisEvaluation,
): MagnificationMetrics | null {
  const known = aiMagnifications.find((value) => value === magnification);
  return known === undefined ? null : evaluation.byMagnification[known];
}

/**
 * Warning for the BreakHis result, read from the confusion matrix of the
 * image's magnification ([[TN, FP], [FN, TP]]). Null without a measured
 * matrix for that magnification, or for another result.
 */
export function getBreastWarning(
  modelDecision: string | null,
  magnification: number | null,
  evaluation: BreakhisEvaluation = breakhisEvaluation,
): BreastWarning | null {
  const metrics = getMagnificationMetrics(magnification, evaluation);
  if (!metrics) return null;
  const [[trueNegative, falsePositive], [falseNegative, truePositive]] = metrics.confusionMatrix;
  if (modelDecision === "malignant") {
    const total = falsePositive + truePositive;
    return total > 0 ? { count: falsePositive, kind: "falsePositive", total } : null;
  }
  if (modelDecision === "benign") {
    const total = falseNegative + trueNegative;
    return total > 0 ? { count: falseNegative, kind: "falseNegative", total } : null;
  }
  return null;
}

/** True when the views fall on both sides of the threshold: the result depends on the image's orientation. */
export function viewsDisagree(views: readonly number[] | null, threshold: number | null): boolean {
  if (!views || views.length === 0 || threshold === null) return false;
  return views.some((view) => view >= threshold) && views.some((view) => view < threshold);
}

/**
 * A malignancy score with 2 decimals, never as a percentage (it is not a
 * probability). With a threshold, more decimals when 2 would put it on the
 * other side of it (0.128 reads 0,128 at 0.13, not 0,13), as the PDF report.
 */
export function formatScore(score: number, locale: Locale, threshold?: number): string {
  let digits = 2;
  if (threshold !== undefined) {
    while (digits < 6 && Number(score.toFixed(digits)) >= threshold !== score >= threshold) digits += 1;
  }
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(score);
}

/**
 * The BreakHis evaluation describes these classifier weights, at its own
 * threshold, only: a run made otherwise quotes none of its figures.
 */
export function breakhisEvaluationApplies(classifierSha256: string | null, threshold?: number | null): boolean {
  return (
    classifierSha256 !== null &&
    classifierSha256 === pathologyEvaluationSource.weightsSha256["pathology-breakhis-classification"] &&
    (threshold === undefined || threshold === breakhisEvaluation.threshold)
  );
}

/** The PanNuke evaluation, once there is one, describes these segmenter weights only. */
export function pannukeEvaluationApplies(segmenterSha256: string | null): boolean {
  return segmenterSha256 !== null && segmenterSha256 === pannukeEvaluationSource.weightsSha256;
}

/** Position of a 0-1 score on the gauge, in percent of its width (clamped). */
export function gaugePosition(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 10;
}
