import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type ClassificationEvaluation,
  CONFUSION_PRECISION_FLOOR,
  evaluationMatchesWeights,
  getConfidenceSplit,
  getConfusionWarning,
  isUncertain,
  parseEvaluationReport,
  UNCERTAINTY_THRESHOLD,
} from './ai-report-rules';

// The same hand-made evaluation and cases as the frontend's
// evaluation-presentation.test.ts: the PDF and the result page must warn alike.
// 200 test images, 50 per class; columns (predicted): glioma, meningioma,
// notumor, pituitary.
const evaluation = (
  matrix: number[][],
  overrides: Partial<ClassificationEvaluation> = {},
): ClassificationEvaluation => ({
  accuracy: { ci95: [0.86, 0.94], value: 0.9 },
  accuracyByConfidence: [
    { accuracy: 0.9, count: 200, coverage: 1, threshold: 0.5 },
    { accuracy: 0.98, count: 150, coverage: 0.75, threshold: 0.9 },
    { accuracy: null, count: 0, coverage: 0, threshold: 0.95 },
  ],
  confusionMatrix: {
    labels: ['glioma', 'meningioma', 'notumor', 'pituitary'],
    matrix,
  },
  perClass: {
    glioma: { recall: 0.8 },
    meningioma: { recall: 0.9 },
    notumor: { recall: 1 },
    pituitary: { recall: 1 },
  },
  testImages: 200,
  ...overrides,
});

const matrix = [
  [40, 5, 4, 1], // glioma
  [0, 45, 0, 5], // meningioma
  [0, 0, 50, 0], // notumor
  [0, 0, 0, 50], // pituitary
];

describe('report rules: identical to the frontend', () => {
  it('uses the frontend thresholds', () => {
    const frontend = join(
      __dirname,
      '../../../../frontend/src/features/ai-analyses',
    );
    const threshold = /export const UNCERTAINTY_THRESHOLD = ([\d.]+);/.exec(
      readFileSync(join(frontend, 'brain-evaluation.ts'), 'utf8'),
    );
    const floor = /export const CONFUSION_PRECISION_FLOOR = ([\d.]+);/.exec(
      readFileSync(join(frontend, 'evaluation-presentation.ts'), 'utf8'),
    );

    expect(Number(threshold?.[1])).toBe(UNCERTAINTY_THRESHOLD);
    expect(Number(floor?.[1])).toBe(CONFUSION_PRECISION_FLOOR);
  });

  describe('uncertainty', () => {
    it('flags a top-class probability under the threshold only', () => {
      expect(isUncertain(0.899, 0.9)).toBe(true);
      expect(isUncertain(0.9, 0.9)).toBe(false);
      expect(isUncertain(0.93, 0.9)).toBe(false);
      expect(isUncertain(null, 0.9)).toBe(false);
    });

    it('deduces the accuracy under the threshold from the totals', () => {
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

    it('has no split without a row for the threshold, or without any image on one side', () => {
      expect(getConfidenceSplit(evaluation(matrix), 0.8)).toBeNull();
      expect(getConfidenceSplit(evaluation(matrix), 0.95)).toBeNull();
      expect(getConfidenceSplit(evaluation(matrix), 0.5)).toBeNull();
    });
  });

  describe('confusion warnings, from the matrix', () => {
    it("always warns on a 'no tumour' result, with the gliomas among them", () => {
      expect(getConfusionWarning('notumor', evaluation(matrix))).toEqual({
        count: 4,
        kind: 'missedGlioma',
        negative: true,
        predicted: 'notumor',
        total: 54,
      });

      const noMissedGlioma = matrix.map((row) => [...row]);
      noMissedGlioma[0] = [44, 5, 0, 1];
      expect(
        getConfusionWarning('notumor', evaluation(noMissedGlioma)),
      ).toEqual({
        count: 0,
        kind: 'missedGlioma',
        negative: true,
        predicted: 'notumor',
        total: 50,
      });
    });

    it("counts the gliomas among the 'meningioma' results", () => {
      expect(getConfusionWarning('meningioma', evaluation(matrix))).toEqual({
        count: 5,
        kind: 'missedGlioma',
        negative: false,
        predicted: 'meningioma',
        total: 50,
      });

      const clean = matrix.map((row) => [...row]);
      clean[0] = [45, 0, 4, 1];
      expect(getConfusionWarning('meningioma', evaluation(clean))).toBeNull();
    });

    it('says nothing for glioma and pituitary above 98 % precision', () => {
      expect(getConfusionWarning('glioma', evaluation(matrix))).toBeNull();

      const precise = matrix.map((row) => [...row]);
      precise[1] = [0, 50, 0, 0];
      precise[0] = [40, 5, 4, 1];
      expect(getConfusionWarning('pituitary', evaluation(precise))).toBeNull();
    });

    it('follows the same logic under the floor', () => {
      expect(getConfusionWarning('pituitary', evaluation(matrix))).toEqual({
        count: 1,
        kind: 'missedGlioma',
        negative: false,
        predicted: 'pituitary',
        total: 56,
      });

      const gliomaConfused = [
        [40, 5, 4, 1],
        [6, 44, 0, 0],
        [0, 0, 50, 0],
        [0, 0, 0, 50],
      ];
      expect(getConfusionWarning('glioma', evaluation(gliomaConfused))).toEqual(
        {
          count: 6,
          kind: 'otherClasses',
          negative: false,
          predicted: 'glioma',
          total: 46,
        },
      );
    });

    it('ignores an unknown class', () => {
      expect(getConfusionWarning('other', evaluation(matrix))).toBeNull();
      expect(getConfusionWarning(null, evaluation(matrix))).toBeNull();
    });
  });

  it('applies the evaluation to its own classifier weights only', () => {
    expect(evaluationMatchesWeights('abc', 'abc')).toBe(true);
    expect(evaluationMatchesWeights('abd', 'abc')).toBe(false);
    expect(evaluationMatchesWeights(null, 'abc')).toBe(false);
    expect(evaluationMatchesWeights('abc', null)).toBe(false);
  });
});

describe('parseEvaluationReport', () => {
  it('reads the real brain-latest.json of the repository', () => {
    const json: unknown = JSON.parse(
      readFileSync(
        join(__dirname, '../../../../ai-service/evaluation/brain-latest.json'),
        'utf8',
      ),
    );
    const report = parseEvaluationReport(json);

    expect(report).not.toBeNull();
    expect(report?.classification.testImages).toBeGreaterThan(0);
    expect(report?.classifierSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report?.file).toMatch(/^brain-\d{4}-\d{2}-\d{2}-/);
  });

  it('refuses a partial or malformed report', () => {
    expect(parseEvaluationReport(null)).toBeNull();
    expect(parseEvaluationReport({ classification: null })).toBeNull();
    expect(
      parseEvaluationReport({ classification: { status: 'no_image' } }),
    ).toBeNull();
  });
});
