import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  breakhisEvaluation,
  nucleiDiceRangeByTissue,
  pannukeByTissue,
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

  it("copies the PanNuke figures of the most recent report that measured them", () => {
    const report = latestWith("pannuke");
    if (!report) throw new Error(`Aucun rapport pathology-*.json avec pannuke.status « ok » dans ${EVALUATION_DIR}.`);
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
    expect(
      differences(
        pannukeByTissue,
        Object.fromEntries(
          Object.entries(pannuke.byTissue as Record<string, { images: number; nucleiMeanDice: number }>).map(([tissue, metrics]) => [
            tissue,
            { images: metrics.images, nucleiMeanDice: metrics.nucleiMeanDice },
          ]),
        ),
      ),
    ).toEqual([]);
  });

  it("never shows the discarded PanNuke weights 8d05b1f0", () => {
    const discarded = "8d05b1f068d4fa9f25ed3ed9f05027d7fd68ef74af0bab15e798e6f324a5a248";

    expect(pannukeEvaluationSource.weightsSha256).not.toBe(discarded);
    expect(pathologyEvaluationSource.weightsSha256["pathology-unet-pannuke-segmentation"]).not.toBe(discarded);
  });

  it("reads the spread of PanNuke across organs from byTissue", () => {
    const byTissue = latestWith("pannuke")!.pannuke!.byTissue as Record<string, { nucleiMeanDice: number }>;
    const ranked = Object.entries(byTissue).sort(([, a], [, b]) => a.nucleiMeanDice - b.nucleiMeanDice);

    expect(nucleiDiceRangeByTissue()).toEqual({
      max: ranked[ranked.length - 1][1].nucleiMeanDice,
      min: ranked[0][1].nucleiMeanDice,
    });
    expect(
      nucleiDiceRangeByTissue({
        Colon: { images: 3, nucleiMeanDice: 0.7 },
        Lung: { images: 1, nucleiMeanDice: 0.2 },
        Skin: { images: 2, nucleiMeanDice: 0.5 },
      }),
    ).toEqual({ max: 0.7, min: 0.2 });
    expect(nucleiDiceRangeByTissue({ Skin: { images: 2, nucleiMeanDice: 0.5 } })).toEqual({ max: 0.5, min: 0.5 });
    expect(() => nucleiDiceRangeByTissue({})).toThrow();
  });

  it("would catch a value changed by hand", () => {
    expect(differences({ a: [0.9259, 1] }, { a: [0.9259 + 1e-10, 1] })).toEqual([]);
    expect(differences({ a: [0.9259, 1] }, { a: [0.926, 1] })).toEqual(["$.a[0]: 0.9259 ≠ 0.926"]);
  });
});
