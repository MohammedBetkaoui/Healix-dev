import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  brainClassificationEvaluation,
  brainEvaluationSource,
  brainSegmentationEvaluation,
} from "./brain-evaluation";

// The figures shown in the interface must be those of the last complete
// evaluation of the service, not typed by hand nor read in a notebook.
const REPORT_PATH = join(__dirname, "../../../../ai-service/evaluation/brain-latest.json");
const TOLERANCE = 1e-9;

type Report = {
  file: string;
  generatedAt: string;
  weights: Record<string, { sha256: string | null }>;
  classification: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  segmentation: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function loadReport(): Report {
  if (!existsSync(REPORT_PATH)) {
    throw new Error(
      `Aucun rapport d'évaluation à ${REPORT_PATH} : aucun chiffre ne peut être affiché sans rapport. ` +
        "Lancez ai-service/scripts/evaluate_brain.py avec --nickparvar-test et --brisc-root (rapport complet).",
    );
  }
  return JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Report;
}

/** Paths where `actual` differs from `expected`: numbers within TOLERANCE, the rest exactly. */
function differences(actual: unknown, expected: unknown, path = "$"): string[] {
  if (typeof actual === "number" && typeof expected === "number") {
    return Math.abs(actual - expected) <= TOLERANCE ? [] : [`${path}: ${actual} ≠ ${expected}`];
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return [`${path}: ${actual.length} entries ≠ ${expected.length}`];
    return actual.flatMap((item, index) => differences(item, expected[index], `${path}[${index}]`));
  }
  if (actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object") {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    return [...keys].flatMap((key) =>
      differences((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`),
    );
  }
  return Object.is(actual, expected) ? [] : [`${path}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`];
}

describe("brain-evaluation.ts, copied from ai-service/evaluation/brain-latest.json", () => {
  it("has a complete report to copy from", () => {
    const report = loadReport();

    expect(report.classification?.status).toBe("ok");
    expect(report.segmentation?.status).toBe("ok");
    // Measured on the dataset version the classifier was trained against.
    expect(report.classification?.dataset.matchesTrainingVersion).toBe(true);
  });

  it("names its source report, its date and the weights it measured", () => {
    const report = loadReport();

    expect(brainEvaluationSource.report).toBe(report.file);
    expect(brainEvaluationSource.generatedAt).toBe(report.generatedAt);
    expect(report.file.startsWith(`brain-${brainEvaluationSource.date}-`)).toBe(true);
    expect(brainEvaluationSource.weightsSha256).toEqual(
      Object.fromEntries(Object.entries(report.weights).map(([modelId, weights]) => [modelId, weights.sha256])),
    );
  });

  it("copies every classification figure", () => {
    const classification = loadReport().classification!;

    expect(
      differences(brainClassificationEvaluation, {
        testImages: classification.n,
        imagesPerClass: classification.dataset.imagesPerClass,
        accuracy: classification.accuracy,
        macroAuc: classification.macro.auc,
        ece: classification.calibration.ece,
        perClass: classification.perClass,
        confusionMatrix: {
          labels: classification.confusionMatrix.labels,
          matrix: classification.confusionMatrix.matrix,
        },
        accuracyByConfidence: classification.accuracyByConfidence,
      }),
    ).toEqual([]);
  });

  it("copies every segmentation figure", () => {
    const classes = loadReport().segmentation!.classes;

    expect(
      differences(
        brainSegmentationEvaluation,
        Object.fromEntries(
          Object.entries(classes as Record<string, any>).map(([label, entry]) => [ // eslint-disable-line @typescript-eslint/no-explicit-any
            label,
            {
              modelId: entry.modelId,
              pairs: entry.pairs,
              testImages: entry.testImages,
              dice: entry.service.dice,
              iou: entry.service.iou,
              sensitivity: entry.service.sensitivity,
            },
          ]),
        ),
      ),
    ).toEqual([]);
  });

  it("would catch a value changed by hand", () => {
    expect(differences({ a: [0.955, 1] }, { a: [0.955 + 1e-10, 1] })).toEqual([]);
    expect(differences({ a: [0.955, 1] }, { a: [0.9551, 1] })).toEqual(["$.a[0]: 0.955 ≠ 0.9551"]);
    expect(differences({ a: 1 }, { a: 1, b: 2 })).toEqual(["$.b: undefined ≠ 2"]);
  });
});
