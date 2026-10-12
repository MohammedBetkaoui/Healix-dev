import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  breakhisEvaluation,
  pannukeEvaluation,
  pannukeEvaluationSource,
  pathologyEvaluationSource,
} from "./pathology-evaluation";

// The figures shown in the interface must be those of the last evaluation of
// the service, not typed by hand nor read in a notebook.
const EVALUATION_DIR = join(__dirname, "../../../../ai-service/evaluation");
const TOLERANCE = 1e-9;

type Report = {
  file: string;
  generatedAt: string;
  weights: Record<string, { sha256: string | null; config?: { sha256: string } }>;
  breakhis: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  pannuke: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function reports(): Report[] {
  return readdirSync(EVALUATION_DIR)
    .filter((name) => /^pathology-.+\.json$/.test(name) && name !== "pathology-latest.json")
    .map((name) => JSON.parse(readFileSync(join(EVALUATION_DIR, name), "utf8")) as Report);
}

/** The most recent report (generatedAt) whose `part` was evaluated. */
function latestWith(part: "breakhis" | "pannuke"): Report | null {
  return (
    reports()
      .filter((report) => report[part]?.status === "ok")
      .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0] ?? null
  );
}

/** Paths where `actual` differs from `expected`: numbers within TOLERANCE, the rest exactly (as brain-evaluation.test.ts). */
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

describe("pathology-evaluation.ts, copied from ai-service/evaluation/pathology-*.json", () => {
  it("names its source report, its date and the weights and config it measured", () => {
    const report = latestWith("breakhis");
    if (!report) throw new Error(`Aucun rapport pathology-*.json avec breakhis.status « ok » dans ${EVALUATION_DIR}.`);

    expect(pathologyEvaluationSource.report).toBe(report.file);
    expect(pathologyEvaluationSource.generatedAt).toBe(report.generatedAt);
    expect(report.file.startsWith(`pathology-${pathologyEvaluationSource.date}-`)).toBe(true);
    expect(pathologyEvaluationSource.weightsSha256).toEqual(
      Object.fromEntries(Object.entries(report.weights).map(([modelId, weights]) => [modelId, weights.sha256])),
    );
    expect(pathologyEvaluationSource.breakhisConfigSha256).toBe(
      report.weights["pathology-breakhis-classification"].config?.sha256,
    );
  });

  it("copies every BreakHis figure, with the test patients deduced from byPatient", () => {
    const breakhis = latestWith("breakhis")!.breakhis!;
    const bootstrap = breakhis.bootstrap;
    const measured = (key: string) => ({ value: breakhis[key], ci95: bootstrap[key].ci95 });
    const patients = breakhis.byPatient as { label: string }[];

    expect(
      differences(breakhisEvaluation, {
        threshold: breakhis.threshold,
        n: breakhis.n,
        testPatients: patients.length,
        benignPatients: patients.filter((patient) => patient.label === "benign").length,
        accuracy: measured("accuracy"),
        sensitivity: measured("sensitivity"),
        specificity: measured("specificity"),
        precision: measured("precision"),
        aucRoc: measured("aucRoc"),
        confusionMatrix: breakhis.confusionMatrix,
        byMagnification: Object.fromEntries(
          Object.entries(breakhis.byMagnification as Record<string, any>).map(([magnification, metrics]) => [ // eslint-disable-line @typescript-eslint/no-explicit-any
            magnification,
            {
              n: metrics.n,
              sensitivity: metrics.sensitivity,
              specificity: metrics.specificity,
              confusionMatrix: metrics.confusionMatrix,
            },
          ]),
        ),
      }),
    ).toEqual([]);
  });

  it("copies the PanNuke figures as soon as a report has measured them", () => {
    const report = latestWith("pannuke");
    if (!report) {
      // Not measured yet: nothing may be shown.
      expect(pannukeEvaluation).toBeNull();
      return;
    }
    if (pannukeEvaluation === null) {
      throw new Error(
        `Le rapport ${report.file} mesure PanNuke (pannuke.status « ok ») : copiez les chiffres PanNuke dans pathology-evaluation.ts.`,
      );
    }
    const pannuke = report.pannuke!;
    expect(pannukeEvaluationSource.report).toBe(report.file);
    expect(pannukeEvaluationSource.generatedAt).toBe(report.generatedAt);
    expect(report.file.startsWith(`pathology-${pannukeEvaluationSource.date}-`)).toBe(true);
    expect(pannukeEvaluationSource.weightsSha256).toBe(report.weights["pathology-unet-pannuke-segmentation"].sha256);
    expect(pannukeEvaluationSource.images).toBe(pannuke.dataset.images);
    expect(
      differences(pannukeEvaluation, {
        perClass: Object.fromEntries(
          Object.entries(pannuke.perClass as Record<string, { dice: number; iou: number }>).map(([name, metrics]) => [
            name,
            { dice: metrics.dice, iou: metrics.iou },
          ]),
        ),
        nucleiMeanDice: pannuke.nucleiMeanDice,
      }),
    ).toEqual([]);
  });

  it("would catch a value changed by hand", () => {
    expect(differences({ a: [0.9259, 1] }, { a: [0.9259 + 1e-10, 1] })).toEqual([]);
    expect(differences({ a: [0.9259, 1] }, { a: [0.926, 1] })).toEqual(["$.a[0]: 0.9259 ≠ 0.926"]);
  });
});
