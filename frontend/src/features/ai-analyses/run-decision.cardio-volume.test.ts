import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import {
  correctionLabels,
  getDecisionAgreement,
  getDecisionErrorKey,
  getDecisionOptions,
  getDisplayedLabel,
  knownDecisionErrorCodes,
  toDecisionPayload,
  validateDecisionDraft,
  type DecisionDraft,
} from "./run-decision";

const draft = (overrides: Partial<DecisionDraft> = {}): DecisionDraft => ({
  correctedLabel: "",
  correctedLabels: [],
  reason: "",
  status: null,
  ...overrides,
});

describe("the decision on the measures of a cardiac cine", () => {
  it("offers to validate the measures as the model gave them, or to reject them", () => {
    expect(getDecisionOptions("cardio-volume-mri")).toEqual(["VALIDATED", "REJECTED"]);
    expect(getDecisionOptions("cardio-volume-mri", false)).toEqual(["VALIDATED", "REJECTED"]);
  });

  it("offers a correction, not a validation, once the physician changed them", () => {
    expect(getDecisionOptions("cardio-volume-mri", true)).toEqual(["CORRECTED", "REJECTED"]);
  });

  it("changes nothing for the other chains", () => {
    expect(getDecisionOptions("brain", true)).toEqual(["VALIDATED", "CORRECTED", "REJECTED"]);
    expect(getDecisionOptions("cardio-seg-mri", true)).toEqual(["VALIDATED", "REJECTED"]);
    expect(getDecisionOptions("pathology-nuclei", true)).toEqual(["VALIDATED", "REJECTED"]);
  });

  it("has no class to correct to: the correction is made on the measures", () => {
    expect(correctionLabels["cardio-volume-mri"]).toEqual([]);
  });

  describe("validation of the draft", () => {
    const check = (status: DecisionDraft["status"], modified: boolean, reason = "") =>
      validateDecisionDraft(draft({ reason, status }), null, "cardio-volume-mri", null, modified);

    it("needs a choice that is offered", () => {
      expect(check(null, false)).toEqual({ status: "required" });
      // Not offered while the measures are the model's / once they were changed.
      expect(check("CORRECTED", false, "Télésystole décalée.")).toEqual({ status: "required" });
      expect(check("VALIDATED", true)).toEqual({ status: "required" });
    });

    it("validates without a reason", () => {
      expect(check("VALIDATED", false)).toEqual({});
    });

    it("asks only for a reason to correct the measures: no class", () => {
      expect(check("CORRECTED", true)).toEqual({ reason: "required" });
      expect(check("CORRECTED", true, "abc")).toEqual({ reason: "tooShort" });
      expect(check("CORRECTED", true, "Télésystole décalée, coupe basale exclue.")).toEqual({});
    });

    it("asks for a reason to reject, whether or not the measures were changed", () => {
      expect(check("REJECTED", false)).toEqual({ reason: "required" });
      expect(check("REJECTED", true)).toEqual({ reason: "required" });
      expect(check("REJECTED", true, "Série non exploitable.")).toEqual({});
    });
  });

  describe("what is sent", () => {
    it("validates with nothing else", () => {
      expect(toDecisionPayload({ ...draft(), status: "VALIDATED" }, "cardio-volume-mri")).toEqual({ status: "VALIDATED" });
    });

    it("corrects by saying so, with the reason, and no class", () => {
      expect(
        toDecisionPayload({ ...draft({ reason: "  Télésystole   décalée. " }), status: "CORRECTED" }, "cardio-volume-mri"),
      ).toEqual({ measuresCorrected: true, reason: "Télésystole décalée.", status: "CORRECTED" });
    });

    it("rejects with the reason only", () => {
      expect(toDecisionPayload({ ...draft({ reason: "Série non exploitable." }), status: "REJECTED" }, "cardio-volume-mri")).toEqual({
        reason: "Série non exploitable.",
        status: "REJECTED",
      });
    });

    it("keeps the payload of the other chains as it was", () => {
      expect(toDecisionPayload({ ...draft({ correctedLabel: "other", reason: "Autre." }), status: "CORRECTED" }, "brain")).toEqual({
        correctedLabel: "other",
        reason: "Autre.",
        status: "CORRECTED",
      });
    });
  });

  describe("agreement with the model", () => {
    const run = (decisionStatus: "VALIDATED" | "CORRECTED" | "REJECTED" | null) => ({
      decisionLabel: null,
      decisionStatus,
      modelDecision: null,
      modelLabel: null,
      pipeline: "cardio-volume-mri" as const,
      predictions: null,
    });

    it("agrees when the measures were kept as they were, disagrees when they were corrected", () => {
      expect(getDecisionAgreement(run("VALIDATED"))).toBe("agrees");
      expect(getDecisionAgreement(run("CORRECTED"))).toBe("disagrees");
      expect(getDecisionAgreement(run("REJECTED"))).toBe("rejected");
      expect(getDecisionAgreement(run(null))).toBe("pending");
    });

    it("has no class to show as retained", () => {
      expect(getDisplayedLabel(run("VALIDATED"))).toEqual({ label: null, source: "none" });
    });
  });

  it("explains the refusals of the decision on measures, in both languages", () => {
    for (const code of ["AI_VOLUMETRY_MODIFIED", "AI_MEASURES_CORRECTED_UNEXPECTED", "AI_MEASURES_CORRECTED_NOT_APPLICABLE"]) {
      expect(knownDecisionErrorCodes).toContain(code);
      for (const locale of ["fr", "ar"] as const) {
        expect(translate(dictionaries[locale], `aiAnalyses.decision.errors.${code}`)).not.toBe(`aiAnalyses.decision.errors.${code}`);
      }
      const error = new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
        config: { headers: new AxiosHeaders() },
        data: { code },
        headers: {},
        status: 400,
        statusText: "Bad Request",
      } as AxiosResponse);
      expect(getDecisionErrorKey(error)).toBe(code);
    }
  });
});
