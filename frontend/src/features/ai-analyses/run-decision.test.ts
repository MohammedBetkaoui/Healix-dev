import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { type AiAnalysisRun } from "./ai-analyses.types";
import {
  aiDecisionLabels,
  correctionLabels,
  decisionTones,
  getCorrectionOptions,
  getDecisionAgreement,
  getDecisionErrorKey,
  getDecisionOptions,
  getDisplayedLabel,
  getModelLabel,
  getLatestRetainedRun,
  getModelLabels,
  sortEcgLabels,
  toDecisionPayload,
  toggleEcgLabel,
  validateDecisionDraft,
  type DecisionDraft,
} from "./run-decision";

// The model's top class is meningioma (not first in the array on purpose).
const predictions = [
  { label: "glioma", probability: 0.06 },
  { label: "meningioma", probability: 0.86 },
  { label: "pituitary", probability: 0.05 },
  { label: "notumor", probability: 0.03 },
];

type RunFields = Pick<
  AiAnalysisRun,
  "createdAt" | "decisionLabel" | "decisionStatus" | "id" | "modelDecision" | "modelLabel" | "pipeline" | "predictions"
>;

// A brain run; modelLabel left null so the fallback on the predictions is exercised.
const run = (overrides: Partial<AiAnalysisRun> = {}): RunFields => ({
  createdAt: "2026-10-07T10:00:00.000Z",
  decisionLabel: null,
  decisionStatus: null,
  id: "run-1",
  modelDecision: null,
  modelLabel: null,
  pipeline: "brain",
  predictions,
  ...overrides,
});

const breastRun = (overrides: Partial<AiAnalysisRun> = {}) =>
  run({ modelDecision: "malignant", modelLabel: "malignant", pipeline: "pathology-breast", predictions: null, ...overrides });
const nucleiRun = (overrides: Partial<AiAnalysisRun> = {}) =>
  run({ pipeline: "pathology-nuclei", predictions: null, ...overrides });
const cardioSegRun = (overrides: Partial<AiAnalysisRun> = {}) =>
  run({ pipeline: "cardio-seg-mri", predictions: null, ...overrides });

const axiosError = (status: number, data: unknown) => {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, {}, response);
};

// An ECG run: MI and STTC above their thresholds (stored by probability).
const ecgRun = (overrides: Partial<AiAnalysisRun> = {}) => ({
  ...run({ pipeline: "cardio-ecg", predictions: null, ...overrides }),
  decisionLabels: overrides.decisionLabels ?? null,
  modelLabels: "modelLabels" in overrides ? (overrides.modelLabels ?? null) : (["MI", "STTC"] as AiAnalysisRun["modelLabels"]),
});

describe("ECG decision (multi-label)", () => {
  const reason = "Relecture du tracé complet.";
  const ecgDraft = (labels: DecisionDraft["correctedLabels"], status: DecisionDraft["status"] = "CORRECTED"): DecisionDraft => ({
    correctedLabel: "",
    correctedLabels: labels,
    reason,
    status,
  });

  it("reads the model's classes in class order, from modelLabels or the stored predictions", () => {
    expect(getModelLabels(ecgRun({ modelLabels: ["STTC", "MI"] }))).toEqual(["MI", "STTC"]);
    expect(
      getModelLabels(
        ecgRun({
          modelLabels: null,
          predictions: {
            configSha256: "d".repeat(64),
            durationSeconds: 10,
            inputSamplingRate: 100,
            positive: ["HYP", "NORM"],
            probabilities: { CD: 0.1, HYP: 0.9, MI: 0.1, NORM: 0.7, STTC: 0.1 },
            thresholds: { CD: 0.8, HYP: 0.8, MI: 0.58, NORM: 0.64, STTC: 0.53 },
            windows: 1,
          },
        }),
      ),
    ).toEqual(["NORM", "HYP"]);
    expect(getModelLabels(run())).toBeNull();
    expect(getModelLabel(ecgRun())).toBeNull();
  });

  it("keeps NORM exclusive when classes are ticked", () => {
    expect(toggleEcgLabel([], "MI")).toEqual(["MI"]);
    expect(toggleEcgLabel(["MI"], "HYP")).toEqual(["MI", "HYP"]);
    expect(toggleEcgLabel(["MI", "HYP"], "NORM")).toEqual(["NORM"]);
    expect(toggleEcgLabel(["NORM"], "CD")).toEqual(["CD"]);
    expect(toggleEcgLabel(["MI", "CD"], "MI")).toEqual(["CD"]);
    expect(sortEcgLabels(["HYP", "NORM", "HYP"])).toEqual(["NORM", "HYP"]);
  });

  it("validates a correction as the backend does", () => {
    const model = ["MI", "STTC"] as const;
    const validate = (draft: DecisionDraft) => validateDecisionDraft(draft, null, "cardio-ecg", [...model]);

    expect(validate(ecgDraft([]))).toEqual({ correctedLabels: "required" });
    expect(validate(ecgDraft(["NORM", "MI"]))).toEqual({ correctedLabels: "normExclusive" });
    expect(validate(ecgDraft(["STTC", "MI"]))).toEqual({ correctedLabels: "matchesModel" });
    expect(validate(ecgDraft(["MI"]))).toEqual({});
    expect(validate(ecgDraft(["NORM"]))).toEqual({});
    expect(validate({ ...ecgDraft(["MI"]), reason: "" })).toEqual({ reason: "required" });
    // Validating keeps the model's classes, even none.
    expect(validateDecisionDraft(ecgDraft([], "VALIDATED"), null, "cardio-ecg", [])).toEqual({});
  });

  it("sends the classes kept, never a single label", () => {
    expect(toDecisionPayload({ ...ecgDraft(["HYP", "MI"]), status: "CORRECTED" }, "cardio-ecg")).toEqual({
      correctedLabels: ["MI", "HYP"],
      reason,
      status: "CORRECTED",
    });
    expect(toDecisionPayload({ ...ecgDraft(["MI"], "VALIDATED"), status: "VALIDATED" }, "cardio-ecg")).toEqual({
      status: "VALIDATED",
    });
  });

  it("agrees when the set kept is the model's, whatever the order", () => {
    expect(getDecisionAgreement(ecgRun({ decisionLabels: ["STTC", "MI"], decisionStatus: "VALIDATED" }))).toBe("agrees");
    expect(getDecisionAgreement(ecgRun({ decisionLabels: ["MI"], decisionStatus: "CORRECTED" }))).toBe("disagrees");
    expect(getDecisionAgreement(ecgRun({ decisionStatus: "REJECTED" }))).toBe("rejected");
    expect(getDecisionAgreement(ecgRun())).toBe("pending");
  });

  it("explains the ECG decision errors", () => {
    for (const code of ["AI_CORRECTED_LABELS_REQUIRED", "AI_CORRECTED_LABELS_INVALID", "AI_CORRECTED_LABELS_NOT_APPLICABLE"]) {
      expect(getDecisionErrorKey(axiosError(400, { code }))).toBe(code);
    }
  });
});

describe("physician / model agreement", () => {
  it("is pending until the physician decides", () => {
    expect(getDecisionAgreement(run())).toBe("pending");
  });

  it("agrees when the retained class is the model's top class", () => {
    expect(getDecisionAgreement(run({ decisionLabel: "meningioma", decisionStatus: "VALIDATED" }))).toBe("agrees");
  });

  it("disagrees on a correction, including to a class the model does not know", () => {
    expect(getDecisionAgreement(run({ decisionLabel: "glioma", decisionStatus: "CORRECTED" }))).toBe("disagrees");
    expect(getDecisionAgreement(run({ decisionLabel: "other", decisionStatus: "CORRECTED" }))).toBe("disagrees");
  });

  it("is neither for a rejected analysis", () => {
    expect(getDecisionAgreement(run({ decisionStatus: "REJECTED" }))).toBe("rejected");
  });

  it("compares with the BreakHis result, and has nothing to compare for a nuclei map", () => {
    expect(getDecisionAgreement(breastRun({ decisionLabel: "malignant", decisionStatus: "VALIDATED" }))).toBe("agrees");
    expect(getDecisionAgreement(breastRun({ decisionLabel: "benign", decisionStatus: "CORRECTED" }))).toBe("disagrees");
    expect(getDecisionAgreement(nucleiRun({ decisionStatus: "VALIDATED" }))).toBe("notApplicable");
    expect(getDecisionAgreement(nucleiRun({ decisionStatus: "REJECTED" }))).toBe("rejected");
    expect(getDecisionAgreement(cardioSegRun({ decisionStatus: "VALIDATED" }))).toBe("notApplicable");
  });
});

describe("model's answer", () => {
  it("is the backend's modelLabel, else the brain top class or the BreakHis result", () => {
    expect(getModelLabel(run())).toBe("meningioma");
    expect(getModelLabel(run({ modelLabel: "glioma" }))).toBe("glioma");
    expect(getModelLabel(breastRun({ modelLabel: null }))).toBe("malignant");
    expect(getModelLabel(nucleiRun())).toBeNull();
  });
});

describe("label displayed according to the decision", () => {
  it("shows the model's class, as not validated, before any decision", () => {
    expect(getDisplayedLabel(run())).toEqual({ label: "meningioma", source: "model" });
  });

  it("shows the physician's class once validated or corrected, never the model's over it", () => {
    expect(getDisplayedLabel(run({ decisionLabel: "meningioma", decisionStatus: "VALIDATED" }))).toEqual({
      label: "meningioma",
      source: "physician",
    });
    expect(getDisplayedLabel(run({ decisionLabel: "glioma", decisionStatus: "CORRECTED" }))).toEqual({
      label: "glioma",
      source: "physician",
    });
  });

  it("shows no class for a rejected analysis, nor without predictions", () => {
    expect(getDisplayedLabel(run({ decisionStatus: "REJECTED" }))).toEqual({ label: null, source: "none" });
    expect(getDisplayedLabel(run({ predictions: null }))).toEqual({ label: null, source: "none" });
    expect(getDisplayedLabel(nucleiRun())).toEqual({ label: null, source: "none" });
    expect(getDisplayedLabel(breastRun())).toEqual({ label: "malignant", source: "model" });
  });

  it("uses the decision tones, one per decision", () => {
    expect(decisionTones).toEqual({ CORRECTED: "warning", REJECTED: "danger", VALIDATED: "success" });
  });
});

describe("latest retained run (record summary)", () => {
  it("takes the most recent validated or corrected run, skipping rejected and pending ones", () => {
    const runs = [
      run({ createdAt: "2026-10-07T12:00:00.000Z", id: "pending" }),
      run({ createdAt: "2026-10-07T11:00:00.000Z", decisionStatus: "REJECTED", id: "rejected" }),
      run({ createdAt: "2026-10-05T09:00:00.000Z", decisionLabel: "meningioma", decisionStatus: "VALIDATED", id: "older" }),
      run({ createdAt: "2026-10-06T09:00:00.000Z", decisionLabel: "glioma", decisionStatus: "CORRECTED", id: "newer" }),
    ];

    expect(getLatestRetainedRun(runs)?.id).toBe("newer");
  });

  it("is null when nothing was validated", () => {
    expect(getLatestRetainedRun([run(), run({ decisionStatus: "REJECTED" })])).toBeNull();
    expect(getLatestRetainedRun([])).toBeNull();
  });
});

describe("decision draft", () => {
  const draft = (overrides: Partial<DecisionDraft>): DecisionDraft => ({
    correctedLabel: "",
    reason: "",
    status: null,
    ...overrides,
  });

  it("offers every class of the chain but the model's for a correction", () => {
    expect(getCorrectionOptions("brain", "meningioma")).toEqual(["glioma", "notumor", "pituitary", "other"]);
    expect(getCorrectionOptions("brain", null)).toEqual([...correctionLabels.brain]);
    expect(getCorrectionOptions("pathology-breast", "malignant")).toEqual(["benign", "other"]);
    expect(getCorrectionOptions("pathology-nuclei", null)).toEqual([]);
    expect(getCorrectionOptions("cardio-seg-mri", null)).toEqual([]);
  });

  it("knows every class a decision may retain, once", () => {
    expect([...aiDecisionLabels].sort()).toEqual(
      ["benign", "glioma", "malignant", "meningioma", "notumor", "other", "pituitary", "NORM", "MI", "STTC", "CD", "HYP"].sort(),
    );
  });

  it("offers no correction for segmentation maps", () => {
    expect(getDecisionOptions("brain")).toEqual(["VALIDATED", "CORRECTED", "REJECTED"]);
    expect(getDecisionOptions("pathology-breast")).toEqual(["VALIDATED", "CORRECTED", "REJECTED"]);
    expect(getDecisionOptions("pathology-nuclei")).toEqual(["VALIDATED", "REJECTED"]);
    expect(getDecisionOptions("cardio-seg-mri")).toEqual(["VALIDATED", "REJECTED"]);
    expect(validateDecisionDraft(draft({ correctedLabel: "other", reason: "Carte floue.", status: "CORRECTED" }), null, "pathology-nuclei")).toEqual({
      status: "required",
    });
    expect(validateDecisionDraft(draft({ status: "VALIDATED" }), null, "pathology-nuclei")).toEqual({});
    expect(validateDecisionDraft(draft({ correctedLabel: "other", reason: "Contours faux.", status: "CORRECTED" }), null, "cardio-seg-mri")).toEqual({
      status: "required",
    });
  });

  it("takes a breast correction among the breast classes only", () => {
    const reason = "Atypies marquées.";

    expect(validateDecisionDraft(draft({ correctedLabel: "glioma", reason, status: "CORRECTED" }), "benign", "pathology-breast")).toEqual({
      correctedLabel: "required",
    });
    expect(validateDecisionDraft(draft({ correctedLabel: "malignant", reason, status: "CORRECTED" }), "benign", "pathology-breast")).toEqual({});
  });

  it("needs a choice, then nothing more to validate", () => {
    expect(validateDecisionDraft(draft({}), "meningioma", "brain")).toEqual({ status: "required" });
    expect(validateDecisionDraft(draft({ status: "VALIDATED" }), "meningioma", "brain")).toEqual({});
  });

  it("requires a reason of 5 to 500 characters, as stored", () => {
    const rejected = (reason: string) => validateDecisionDraft(draft({ reason, status: "REJECTED" }), "meningioma", "brain");

    expect(rejected("   ")).toEqual({ reason: "required" });
    expect(rejected("a \n\n b")).toEqual({ reason: "tooShort" });
    expect(rejected("x".repeat(501))).toEqual({ reason: "tooLong" });
    expect(rejected("Image floue.")).toEqual({});
  });

  it("requires a corrected class different from the model's", () => {
    const reason = "Prise de contraste en anneau.";

    expect(validateDecisionDraft(draft({ reason, status: "CORRECTED" }), "meningioma", "brain")).toEqual({
      correctedLabel: "required",
    });
    expect(validateDecisionDraft(draft({ correctedLabel: "meningioma", reason, status: "CORRECTED" }), "meningioma", "brain")).toEqual({
      correctedLabel: "matchesModel",
    });
    expect(validateDecisionDraft(draft({ correctedLabel: "other", reason, status: "CORRECTED" }), "meningioma", "brain")).toEqual({});
  });

  it("sends only what each decision carries", () => {
    const filled = { correctedLabel: "glioma", reason: "  Aspect   infiltrant. " };

    expect(toDecisionPayload({ ...filled, status: "VALIDATED" })).toEqual({ status: "VALIDATED" });
    expect(toDecisionPayload({ ...filled, status: "CORRECTED" })).toEqual({
      correctedLabel: "glioma",
      reason: "Aspect infiltrant.",
      status: "CORRECTED",
    });
    expect(toDecisionPayload({ ...filled, status: "REJECTED" })).toEqual({
      reason: "Aspect infiltrant.",
      status: "REJECTED",
    });
  });
});

describe("decision errors", () => {
  it("explains the backend codes, and nothing else", () => {
    expect(getDecisionErrorKey(axiosError(409, { code: "AI_RUN_ALREADY_DECIDED" }))).toBe("AI_RUN_ALREADY_DECIDED");
    expect(getDecisionErrorKey(axiosError(400, { code: "AI_CORRECTION_MATCHES_MODEL" }))).toBe("AI_CORRECTION_MATCHES_MODEL");
    expect(getDecisionErrorKey(axiosError(400, { code: "AI_CORRECTED_LABEL_INVALID" }))).toBe("AI_CORRECTED_LABEL_INVALID");
    expect(getDecisionErrorKey(axiosError(400, { code: "AI_CORRECTION_NOT_APPLICABLE" }))).toBe("AI_CORRECTION_NOT_APPLICABLE");
    expect(getDecisionErrorKey(axiosError(500, { code: "SOMETHING" }))).toBe("unknown");
    expect(getDecisionErrorKey(new Error("network"))).toBe("unknown");
  });
});
