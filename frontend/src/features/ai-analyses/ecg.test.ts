import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { ecgClasses, type AiEcgPredictions } from "./ai-analyses.types";
import { cardioEvaluationSource, cardioNotebookEvaluation } from "./cardio-evaluation";
import {
  barPosition,
  calibrationPath,
  ecgGeometry,
  ecgLayout,
  getEcgClassResults,
  gridLines,
  tracePoints,
} from "./ecg-presentation";
import {
  evaluateEcgQualityChecks,
  findMissingLeads,
  firstLine,
  isEcgArchive,
  leadKey,
  parseSamplingRate,
} from "./ecg-quality";
import {
  ecgRejectionParams,
  getEcgPredictions,
  getEcgRejection,
  getFailedRunId,
  getRunErrorKey,
  getTopLabel,
  sortPredictions,
} from "./run-presentation";

// The model card committed next to the ai-service tests: the very card of
// the deployed weights (ai-service test_cardio.py checks it).
const MODEL_CARD = join(__dirname, "../../../../ai-service/tests/fixtures/ecg/model-card.json");
const LEADS = "I,II,III,aVR,aVL,aVF,V1,V2,V3,V4,V5,V6";

const axiosError = (status: number, data: unknown) => {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, {}, response);
};

const predictions: AiEcgPredictions = {
  configSha256: "d".repeat(64),
  durationSeconds: 30,
  inputSamplingRate: 500,
  positive: ["MI", "STTC"],
  probabilities: { CD: 0.1, HYP: 0.05, MI: 0.83, NORM: 0.04, STTC: 0.61 },
  thresholds: { CD: 0.8064, HYP: 0.8121, MI: 0.5788, NORM: 0.6408, STTC: 0.5285 },
  windows: 5,
};

describe("cardio-evaluation.ts, copied from the model card", () => {
  const card = JSON.parse(readFileSync(MODEL_CARD, "utf8")) as {
    sha256: string;
    weights_file: string;
    classes: string[];
    test: { n_ecg: number; auc_macro: number; per_class: Record<string, Record<string, number>> };
  };

  it("names the weights of the card", () => {
    expect(cardioEvaluationSource.weightsSha256).toBe(card.sha256);
    expect(card.classes).toEqual([...ecgClasses]);
  });

  it("holds the card's test figures, exactly", () => {
    expect(cardioNotebookEvaluation.nEcg).toBe(card.test.n_ecg);
    expect(cardioNotebookEvaluation.aucMacro).toBe(card.test.auc_macro);
    for (const label of ecgClasses) {
      const { auc, sensitivity, specificity, ppv, f1 } = card.test.per_class[label];
      expect(cardioNotebookEvaluation.perClass[label]).toEqual({ auc, f1, ppv, sensitivity, specificity });
    }
  });
});

describe("ECG quality checks", () => {
  it("compares lead names as the service does", () => {
    expect(leadKey(" AVR ")).toBe("avr");
    expect(leadKey('"V1"')).toBe("v1");
    expect(findMissingLeads(LEADS)).toEqual([]);
    expect(findMissingLeads(`time;${LEADS.toUpperCase().replaceAll(",", ";")}`)).toEqual([]);
    expect(findMissingLeads("﻿I\tII\tIII\taVR\taVL\taVF\tV1\tV2\tV3\tV4")).toEqual(["V5", "V6"]);
    expect(findMissingLeads("just one column")).toBeNull();
    expect(firstLine("\n\n I,II \r\n1,2")).toBe(" I,II ");
  });

  it("passes a full CSV, blocks a missing lead, leaves a WFDB archive to the service", () => {
    const full = evaluateEcgQualityChecks({ fileName: "ecg.csv", probe: { missing: [], state: "read" } });
    expect(full.canContinue).toBe(true);

    const missing = evaluateEcgQualityChecks({ fileName: "ecg.csv", probe: { missing: ["V5", "V6"], state: "read" } });
    expect(missing.canContinue).toBe(false);
    expect(missing.checks[1]).toEqual({ detail: { missing: "V5, V6" }, key: "leads", status: "fail" });

    const archive = evaluateEcgQualityChecks({ fileName: "record.ZIP", probe: { state: "archive" } });
    expect(archive.canContinue).toBe(true);
    expect(isEcgArchive("record.ZIP")).toBe(true);

    expect(evaluateEcgQualityChecks({ fileName: "ecg.pdf", probe: { missing: [], state: "read" } }).canContinue).toBe(false);
    expect(evaluateEcgQualityChecks({ fileName: "ecg.csv", probe: { state: "pending" } }).canContinue).toBe(false);
  });

  it("takes an integer rate from 100 to 1000 Hz", () => {
    expect(parseSamplingRate("360")).toBe(360);
    expect(parseSamplingRate(" 1000 ")).toBe(1000);
    for (const text of ["", "99", "1001", "250.5", "abc"]) expect(parseSamplingRate(text)).toBeNull();
  });
});

describe("ECG paper", () => {
  it("draws 10 s at 25 mm/s on 250 mm after the calibration, 4 rows of 30 mm", () => {
    expect(ecgGeometry(25)).toMatchObject({ calibration: 10, height: 120, rows: 4, width: 260 });
    expect(ecgGeometry(50)).toMatchObject({ calibration: 20, width: 520 });
    expect(ecgLayout.flat()).toHaveLength(12);
  });

  it("places 2.5 s of a lead at 25 mm/s and 10 mm/mV", () => {
    const samples = Array.from({ length: 1000 }, (_, index) => (index === 250 ? 1 : 0));
    const points = tracePoints(samples, 100, 2.5, 5, 72.5, 45, 25).split(" ");
    expect(points).toHaveLength(250);
    // Sample 250 (1 mV) is the first of the window, 10 mm above the baseline.
    expect(points[0]).toBe("72.5,35");
    expect(points[249]).toBe(`${72.5 + 249 * 0.25},45`);
  });

  it("draws a 1 mV pulse 10 mm high, and a major line every 5 mm", () => {
    expect(calibrationPath(15, 25)).toBe("M0,15 H1.25 V5 H6.25 V15 H10");
    expect(gridLines(10).filter((line) => line.major).map((line) => line.at)).toEqual([0, 5, 10]);
  });

  it("compares each class with its own threshold", () => {
    expect(getEcgClassResults(predictions).map((result) => [result.label, result.positive])).toEqual([
      ["NORM", false],
      ["MI", true],
      ["STTC", true],
      ["CD", false],
      ["HYP", false],
    ]);
    expect(barPosition(1.2)).toBe(100);
    expect(barPosition(0.5788)).toBeCloseTo(57.88);
  });
});

describe("ECG run presentation", () => {
  it("reads the predictions of an ECG run only, and never sorts them as softmax classes", () => {
    expect(getEcgPredictions({ pipeline: "cardio-ecg", predictions })).toBe(predictions);
    expect(getEcgPredictions({ pipeline: "brain", predictions: [] })).toBeNull();
    expect(sortPredictions(predictions)).toEqual([]);
    expect(getTopLabel(predictions)).toBeNull();
  });

  it("says why a signal was refused, and stays in the wizard", () => {
    const error = axiosError(422, {
      code: "AI_INPUT_REJECTED",
      details: { missing: ["V5", "V6"] },
      reason: "ECG_MISSING_LEADS",
      runId: "run-1",
    });

    expect(getEcgRejection(error)).toEqual({ code: "ECG_MISSING_LEADS", details: { missing: ["V5", "V6"] } });
    expect(ecgRejectionParams({ missing: ["V5", "V6"] }, "fr").leads).toBe("V5, V6");
    expect(ecgRejectionParams({ durationSeconds: 5, minSeconds: 10 }, "fr")).toMatchObject({ duration: "5", min: "10" });
    expect(getFailedRunId(error)).toBe("run-1");
    expect(getRunErrorKey("ECG_TOO_SHORT")).toBe("ECG_TOO_SHORT");
    // An image refusal is not a signal refusal.
    expect(getEcgRejection(axiosError(422, { code: "AI_INPUT_REJECTED", reason: "INVALID_IMAGE" }))).toBeNull();
  });
});
