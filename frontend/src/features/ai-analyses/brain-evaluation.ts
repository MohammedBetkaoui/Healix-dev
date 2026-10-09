// Measured on the service itself by ai-service/scripts/evaluate_brain.py: the
// service's own preprocessing and inference (app.preprocess, app.pipeline),
// on CPU, in one pass, without test-time augmentation ("une passe, sans TTA").
// Copied from ai-service/evaluation/brain-latest.json, the last complete report
// (classification and segmentation): brain-evaluation.test.ts checks every
// value and the weight hashes against that file. Figures shown in the
// interface come from here, never from the training notebooks.
//
// Source report: brain-2026-10-09-154337-311d2cbb.json (2026-10-09T14:38:43+00:00)
// To update: rerun the script on both datasets, then copy the values of the
// new brain-latest.json here; the test fails until they match.

import { type AiOutputClassKey } from "./ai-analyses.types";

export const brainEvaluationSource = {
  report: "brain-2026-10-09-154337-311d2cbb.json",
  /** Local date of the run, from the report name. */
  date: "2026-10-09",
  generatedAt: "2026-10-09T14:38:43+00:00",
  /** As in production: one deterministic pass, no test-time augmentation. */
  singlePassWithoutTta: true,
  weightsSha256: {
    "brain-efficientnetb4-tumor-classification": "311d2cbb171266721871f46f7f841b1dffef0c0fec40853745f55be9939ae654",
    "brain-unet-meningioma-segmentation": "95c94047da1daaf71744e6076c5f01401c0af09d5f87335477359681ba7c939d",
    "brain-unet-pituitary-segmentation": "cfd8fc4e55e6a4d7ca97e9613a95451d9680426bdd714f818786ab0e9983dd89",
  },
} as const;

export const brainClassLabels = ["glioma", "meningioma", "notumor", "pituitary"] as const satisfies readonly AiOutputClassKey[];
export type BrainClassLabel = (typeof brainClassLabels)[number];

/** Bootstrap 95 % interval (1,000 draws), [lower, upper]. */
export type EvaluationInterval = readonly [number, number];

export type ConfidenceThresholdRow = {
  threshold: number;
  /** Test images whose top-class probability is at or above the threshold. */
  count: number;
  /** count / test images. */
  coverage: number;
  /** Accuracy on those images; null when there is none. */
  accuracy: number | null;
};

export type BrainClassificationEvaluation = {
  testImages: number;
  imagesPerClass: Readonly<Record<BrainClassLabel, number>>;
  accuracy: { value: number; ci95: EvaluationInterval };
  /** One-vs-rest, unweighted mean of the per-class AUCs. */
  macroAuc: number;
  /** Expected calibration error, 10 bins. */
  ece: number;
  perClass: Readonly<
    Record<
      BrainClassLabel,
      { support: number; precision: number; recall: number; recallCi95: EvaluationInterval; f1: number; auc: number }
    >
  >;
  /** Rows: true class; columns: predicted class; in `labels` order. */
  confusionMatrix: { labels: readonly BrainClassLabel[]; matrix: readonly (readonly number[])[] };
  accuracyByConfidence: readonly ConfidenceThresholdRow[];
};

export type SegmentationStatistic = { mean: number; ci95: EvaluationInterval; median: number; n: number };

export type BrainSegmentationEvaluation = {
  modelId: string;
  /** Image/mask pairs of the class; the test set is the notebook's split of them. */
  pairs: number;
  testImages: number;
  /** Per test image, at the size of the mask the service returns. */
  dice: SegmentationStatistic;
  iou: SegmentationStatistic;
  sensitivity: SegmentationStatistic;
};

/** Nickparvar Testing (glioma: 400, meningioma: 400, notumor: 400, pituitary: 400). */
export const brainClassificationEvaluation: BrainClassificationEvaluation = {
  testImages: 1600,
  imagesPerClass: { glioma: 400, meningioma: 400, notumor: 400, pituitary: 400 },
  accuracy: { value: 0.955, ci95: [0.944375, 0.964390625] },
  macroAuc: 0.9899697916666667,
  ece: 0.06836395312100656,
  perClass: {
    glioma: { support: 400, precision: 0.9970238095238095, recall: 0.8375, recallCi95: [0.8, 0.8715580066645675], f1: 0.9103260869565217, auc: 0.9744562499999999 },
    meningioma: { support: 400, precision: 0.903448275862069, recall: 0.9825, recallCi95: [0.968135297730886, 0.9948058659686566], f1: 0.9413173652694611, auc: 0.9869270833333333 },
    notumor: { support: 400, precision: 0.9456264775413712, recall: 1.0, recallCi95: [1.0, 1.0], f1: 0.9720534629404617, auc: 0.9985208333333334 },
    pituitary: { support: 400, precision: 0.9852216748768473, recall: 1.0, recallCi95: [1.0, 1.0], f1: 0.9925558312655087, auc: 0.999975 },
  },
  confusionMatrix: {
    labels: brainClassLabels,
    matrix: [
      [335, 42, 21, 2],
      [1, 393, 2, 4],
      [0, 0, 400, 0],
      [0, 0, 0, 400],
    ],
  },
  accuracyByConfidence: [
    { threshold: 0.5, count: 1596, coverage: 0.9975, accuracy: 0.956140350877193 },
    { threshold: 0.55, count: 1594, coverage: 0.99625, accuracy: 0.9567126725219574 },
    { threshold: 0.6, count: 1592, coverage: 0.995, accuracy: 0.957286432160804 },
    { threshold: 0.65, count: 1589, coverage: 0.993125, accuracy: 0.9584644430459408 },
    { threshold: 0.7, count: 1582, coverage: 0.98875, accuracy: 0.9595448798988622 },
    { threshold: 0.75, count: 1574, coverage: 0.98375, accuracy: 0.9625158831003812 },
    { threshold: 0.8, count: 1553, coverage: 0.970625, accuracy: 0.9684481648422408 },
    { threshold: 0.85, count: 1538, coverage: 0.96125, accuracy: 0.9746423927178154 },
    { threshold: 0.9, count: 1424, coverage: 0.89, accuracy: 0.9838483146067416 },
    { threshold: 0.95, count: 0, coverage: 0.0, accuracy: null },
  ],
};

/** BRISC 2025, test split of segmentation-reelle.ipynb. */
export const brainSegmentationEvaluation: Readonly<Record<"meningioma" | "pituitary", BrainSegmentationEvaluation>> = {
  meningioma: {
    modelId: "brain-unet-meningioma-segmentation",
    pairs: 1635,
    testImages: 123,
    dice: { mean: 0.9262077877182253, ci95: [0.9059920023495519, 0.9409263098925146], median: 0.9525687597301505, n: 123 },
    iou: { mean: 0.8727170012485506, ci95: [0.8506053851575764, 0.8919303586289329], median: 0.9094332144272691, n: 123 },
    sensitivity: { mean: 0.9475778220862555, ci95: [0.932060103889757, 0.9605326778194047], median: 0.9726372071080358, n: 123 },
  },
  pituitary: {
    modelId: "brain-unet-pituitary-segmentation",
    pairs: 1757,
    testImages: 132,
    dice: { mean: 0.8743110288893325, ci95: [0.8542454129025826, 0.8906339305099115], median: 0.9057029070921067, n: 132 },
    iou: { mean: 0.7892204886846464, ci95: [0.7635273944294909, 0.8101797162978877], median: 0.8276579371013262, n: 132 },
    sensitivity: { mean: 0.914819255567572, ci95: [0.892044332673283, 0.933931306670024], median: 0.9544656681830572, n: 132 },
  },
};

/**
 * Under this top-class probability, the result page shows "Résultat incertain".
 * Chosen from accuracyByConfidence: its 0.90 row is the last one before no
 * image is left (0.95), and it separates the results that were right far more
 * often above it than below it (the banner computes both from that row).
 */
export const UNCERTAINTY_THRESHOLD = 0.9;
