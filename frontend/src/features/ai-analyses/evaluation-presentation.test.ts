import { type BrainClassificationEvaluation } from "./brain-evaluation";
import {
  evaluationMatchesWeights,
  formatEvaluationDate,
  formatInterval,
  formatPercent,
  getConfidenceSplit,
  getConfusionWarning,
  getProbabilityCeiling,
  isUncertain,
} from "./evaluation-presentation";

// Hand-made evaluation: 200 test images, 50 per class.
// Columns (predicted): glioma, meningioma, notumor, pituitary.
const evaluation = (matrix: number[][], overrides: Partial<BrainClassificationEvaluation> = {}): BrainClassificationEvaluation => ({
  testImages: 200,
  imagesPerClass: { glioma: 50, meningioma: 50, notumor: 50, pituitary: 50 },
  accuracy: { value: 0.9, ci95: [0.86, 0.94] },
  macroAuc: 0.98,
  ece: 0.05,
  perClass: {
    glioma: { support: 50, precision: 1, recall: 0.8, recallCi95: [0.7, 0.9], f1: 0.89, auc: 0.97 },
    meningioma: { support: 50, precision: 0.9, recall: 0.9, recallCi95: [0.8, 0.98], f1: 0.9, auc: 0.98 },
    notumor: { support: 50, precision: 0.9, recall: 1, recallCi95: [1, 1], f1: 0.95, auc: 0.99 },
    pituitary: { support: 50, precision: 0.97, recall: 1, recallCi95: [1, 1], f1: 0.98, auc: 1 },
  },
  confusionMatrix: { labels: ["glioma", "meningioma", "notumor", "pituitary"], matrix },
  accuracyByConfidence: [
    { threshold: 0.5, count: 200, coverage: 1, accuracy: 0.9 },
    { threshold: 0.9, count: 150, coverage: 0.75, accuracy: 0.98 },
    { threshold: 0.95, count: 0, coverage: 0, accuracy: null },
  ],
  ...overrides,
});

const matrix = [
  [40, 5, 4, 1], // glioma
  [0, 45, 0, 5], // meningioma
  [0, 0, 50, 0], // notumor
  [0, 0, 0, 50], // pituitary
];

describe("uncertainty", () => {
  it("flags a top-class probability under the threshold only", () => {
    expect(isUncertain(0.899, 0.9)).toBe(true);
    expect(isUncertain(0.9, 0.9)).toBe(false);
    expect(isUncertain(0.93, 0.9)).toBe(false);
    expect(isUncertain(null, 0.9)).toBe(false);
  });

  it("deduces the accuracy under the threshold from the totals", () => {
    // Right overall: 0.9 x 200 = 180; right above: 0.98 x 150 = 147;
    // under: (180 - 147) / (200 - 150) = 33 / 50.
    expect(getConfidenceSplit(evaluation(matrix), 0.9)).toEqual({
      aboveAccuracy: 0.98,
      aboveCount: 150,
      belowAccuracy: 0.66,
      belowCount: 50,
      threshold: 0.9,
    });
  });

  it("has no split without a row for the threshold, or without any image on one side", () => {
    expect(getConfidenceSplit(evaluation(matrix), 0.8)).toBeNull();
    expect(getConfidenceSplit(evaluation(matrix), 0.95)).toBeNull(); // nothing above
    expect(getConfidenceSplit(evaluation(matrix), 0.5)).toBeNull(); // nothing under
  });

  it("reproduces the measured split with the real evaluation", () => {
    const split = getConfidenceSplit();

    expect(split).not.toBeNull();
    expect(split!.aboveCount + split!.belowCount).toBeGreaterThan(0);
    expect(split!.belowAccuracy).toBeGreaterThanOrEqual(0);
    expect(split!.belowAccuracy).toBeLessThanOrEqual(1);
  });
});

describe("confusion warnings, from the matrix", () => {
  it("always warns on a 'no tumour' result, with the gliomas among them", () => {
    // notumor column: 4 + 0 + 50 + 0 = 54 results, 4 of them gliomas.
    expect(getConfusionWarning("notumor", evaluation(matrix))).toEqual({
      count: 4, kind: "missedGlioma", negative: true, predicted: "notumor", total: 54,
    });

    const noMissedGlioma = matrix.map((row) => [...row]);
    noMissedGlioma[0] = [44, 5, 0, 1];
    expect(getConfusionWarning("notumor", evaluation(noMissedGlioma))).toEqual({
      count: 0, kind: "missedGlioma", negative: true, predicted: "notumor", total: 50,
    });
  });

  it("counts the gliomas among the 'meningioma' results", () => {
    expect(getConfusionWarning("meningioma", evaluation(matrix))).toEqual({
      count: 5, kind: "missedGlioma", negative: false, predicted: "meningioma", total: 50,
    });

    const clean = matrix.map((row) => [...row]);
    clean[0] = [45, 0, 4, 1];
    expect(getConfusionWarning("meningioma", evaluation(clean))).toBeNull();
  });

  it("says nothing for glioma and pituitary above 98 % precision", () => {
    // glioma: 40 / 40; pituitary: 50 / 56 = 89 %, warned below.
    expect(getConfusionWarning("glioma", evaluation(matrix))).toBeNull();

    const precise = matrix.map((row) => [...row]);
    precise[1] = [0, 50, 0, 0];
    precise[0] = [40, 5, 4, 1];
    // pituitary: 50 / 51 = 98.04 %: above the floor.
    expect(getConfusionWarning("pituitary", evaluation(precise))).toBeNull();
  });

  it("follows the same logic under the floor", () => {
    // pituitary: 1 glioma and 5 meningiomas among 56 results.
    expect(getConfusionWarning("pituitary", evaluation(matrix))).toEqual({
      count: 1, kind: "missedGlioma", negative: false, predicted: "pituitary", total: 56,
    });

    const gliomaConfused = [
      [40, 5, 4, 1],
      [6, 44, 0, 0],
      [0, 0, 50, 0],
      [0, 0, 0, 50],
    ];
    // glioma: 40 right out of 46: the other 6 are of another class.
    expect(getConfusionWarning("glioma", evaluation(gliomaConfused))).toEqual({
      count: 6, kind: "otherClasses", negative: false, predicted: "glioma", total: 46,
    });
  });

  it("ignores an unknown class", () => {
    expect(getConfusionWarning("other", evaluation(matrix))).toBeNull();
    expect(getConfusionWarning(null, evaluation(matrix))).toBeNull();
  });
});

describe("probability ceiling", () => {
  it("derives the label-smoothing target and the first threshold no image reached", () => {
    const measured = getProbabilityCeiling(evaluation(matrix), 0.1);
    expect(measured.target).toBeCloseTo(0.925, 12); // 1 - 0.1 + 0.1 / 4
    expect(measured.unreachedThreshold).toBe(0.95);

    const everyThresholdReached = getProbabilityCeiling(
      evaluation(matrix, { accuracyByConfidence: [{ threshold: 0.5, count: 200, coverage: 1, accuracy: 0.9 }] }),
      0.2,
    );
    expect(everyThresholdReached.target).toBeCloseTo(0.85, 12);
    expect(everyThresholdReached.unreachedThreshold).toBeNull();
  });
});

describe("formatting", () => {
  it("formats a 95 % interval with two decimals, in percent or as a score", () => {
    expect(formatInterval([0.944375, 0.964390625], "percent", "fr")).toBe("94,44 % – 96,44 %");
    expect(formatInterval([0.9, 0.99], "score", "fr")).toBe("0,90 – 0,99");
    expect(formatInterval([0.9, 0.99], "score", "ar")).toMatch(/^\S+ – \S+$/);
  });

  it("formats percentages and the evaluation date", () => {
    expect(formatPercent(0.7215909, "fr")).toBe("72,2 %");
    expect(formatEvaluationDate("2026-10-09", "fr")).toBe("9 octobre 2026");
  });

  it("applies the evaluation to its own classifier weights only", () => {
    expect(evaluationMatchesWeights("abc", "abc")).toBe(true);
    expect(evaluationMatchesWeights("abd", "abc")).toBe(false);
    expect(evaluationMatchesWeights(null, "abc")).toBe(false);
  });
});
