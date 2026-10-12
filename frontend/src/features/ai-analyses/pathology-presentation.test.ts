import { breakhisEvaluation, pannukeEvaluationSource, pathologyEvaluationSource } from "./pathology-evaluation";
import {
  breakhisEvaluationApplies,
  formatScore,
  gaugePosition,
  getBreastWarning,
  getMagnificationMetrics,
  pannukeEvaluationApplies,
  viewsDisagree,
} from "./pathology-presentation";

describe("getBreastWarning", () => {
  it("counts the benign images among the malignant results at the image's magnification", () => {
    // 200x: [[69, 20], [20, 231]]: 20 of the 251 "malignant" results were benign.
    expect(getBreastWarning("malignant", 200)).toEqual({ count: 20, kind: "falsePositive", total: 251 });
  });

  it("counts the malignant images among the benign results", () => {
    // 400x: [[58, 28], [20, 217]]: 20 of the 78 "benign" results were malignant.
    expect(getBreastWarning("benign", 400)).toEqual({ count: 20, kind: "falseNegative", total: 78 });
  });

  it("takes every figure from the evaluation passed in", () => {
    for (const [magnification, metrics] of Object.entries(breakhisEvaluation.byMagnification)) {
      const [[tn, fp], [fn, tp]] = metrics.confusionMatrix;
      expect(getBreastWarning("malignant", Number(magnification))).toEqual({ count: fp, kind: "falsePositive", total: fp + tp });
      expect(getBreastWarning("benign", Number(magnification))).toEqual({ count: fn, kind: "falseNegative", total: fn + tn });
    }
  });

  it("gives nothing without a measured magnification or a known result", () => {
    expect(getBreastWarning("malignant", null)).toBeNull();
    expect(getBreastWarning("malignant", 1000)).toBeNull();
    expect(getBreastWarning(null, 200)).toBeNull();
    expect(getBreastWarning("other", 200)).toBeNull();
  });
});

describe("viewsDisagree", () => {
  it("is true only when the views fall on both sides of the threshold", () => {
    expect(viewsDisagree([0.58, 0.6, 0.57, 0.61], 0.13)).toBe(false);
    expect(viewsDisagree([0.01, 0.02, 0.03, 0.04], 0.13)).toBe(false);
    expect(viewsDisagree([0.1, 0.13, 0.2, 0.05], 0.13)).toBe(true);
    expect(viewsDisagree(null, 0.13)).toBe(false);
    expect(viewsDisagree([0.1, 0.2], null)).toBe(false);
  });
});

describe("formatScore", () => {
  it("writes 2 decimals, never a percentage", () => {
    expect(formatScore(0.59, "fr")).toBe("0,59");
    expect(formatScore(0.5, "fr")).toBe("0,50");
    expect(formatScore(0.59, "fr")).not.toContain("%");
    expect(formatScore(0.59, "ar")).not.toContain("%");
  });

  it("never shows a score on the other side of the threshold", () => {
    expect(formatScore(0.128, "fr", 0.13)).toBe("0,128");
    expect(formatScore(0.1299, "fr", 0.13)).toBe("0,1299");
    expect(formatScore(0.13, "fr", 0.13)).toBe("0,13");
    expect(formatScore(0.59, "fr", 0.13)).toBe("0,59");
  });
});

describe("BreakHis evaluation applicability", () => {
  it("applies to the measured weights only", () => {
    expect(breakhisEvaluationApplies(pathologyEvaluationSource.weightsSha256["pathology-breakhis-classification"])).toBe(true);
    expect(breakhisEvaluationApplies("a".repeat(64))).toBe(false);
    expect(breakhisEvaluationApplies(null)).toBe(false);
  });

  it("applies at the evaluated threshold only", () => {
    const sha = pathologyEvaluationSource.weightsSha256["pathology-breakhis-classification"];

    expect(breakhisEvaluationApplies(sha, breakhisEvaluation.threshold)).toBe(true);
    expect(breakhisEvaluationApplies(sha, 0.5)).toBe(false);
    expect(breakhisEvaluationApplies(sha, null)).toBe(false);
  });

  it("tells the PanNuke weights apart", () => {
    expect(pannukeEvaluationApplies(pannukeEvaluationSource.weightsSha256)).toBe(true);
    expect(pannukeEvaluationApplies("a".repeat(64))).toBe(false);
    expect(pannukeEvaluationApplies(null)).toBe(false);
  });

  it("reads the figures of a measured magnification only", () => {
    expect(getMagnificationMetrics(200)).toBe(breakhisEvaluation.byMagnification["200"]);
    expect(getMagnificationMetrics(250)).toBeNull();
    expect(getMagnificationMetrics(null)).toBeNull();
  });

  it("places a score on the gauge, clamped", () => {
    expect(gaugePosition(0.13)).toBe(13);
    expect(gaugePosition(1.4)).toBe(100);
    expect(gaugePosition(-1)).toBe(0);
  });
});
