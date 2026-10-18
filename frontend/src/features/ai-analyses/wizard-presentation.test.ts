import { type LaunchState } from "./run-presentation";
import { canLaunchPreparedAnalysis, getAcquisitionIssue } from "./wizard-presentation";

const acquisition = {
  pipelineId: "brain" as const,
  magnification: null,
  he40xConfirmed: false,
  isArchive: false,
  samplingRate: null,
  rateChoice: null,
  otherRate: "",
};

describe("model-specific acquisition prerequisites", () => {
  it("does not require histology or signal settings for a brain image", () => {
    expect(getAcquisitionIssue(acquisition)).toBeNull();
  });

  it("requires a declared breast magnification before leaving the checks", () => {
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "pathology-breast" })).toBe("magnification");
    for (const magnification of [40, 100, 200, 400] as const) {
      expect(getAcquisitionIssue({ ...acquisition, pipelineId: "pathology-breast", magnification })).toBeNull();
    }
  });

  it("requires the nuclei confirmation even if another magnification was set", () => {
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "pathology-nuclei", magnification: 40 })).toBe("he40x");
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "pathology-nuclei", he40xConfirmed: true })).toBeNull();
  });

  it("distinguishes a missing ECG frequency from an invalid custom entry", () => {
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "cardio-ecg" })).toBe("samplingRate");
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "cardio-ecg", rateChoice: "other", otherRate: " " })).toBe("samplingRate");
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "cardio-ecg", rateChoice: "other", otherRate: "99" })).toBe("samplingRateInvalid");
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "cardio-ecg", rateChoice: 500, samplingRate: 500 })).toBeNull();
  });

  it("lets a WFDB header supply frequency and units instead of requiring manual settings", () => {
    expect(getAcquisitionIssue({ ...acquisition, pipelineId: "cardio-ecg", isArchive: true, rateChoice: "other", otherRate: "99" })).toBeNull();
  });
});

const prepared = {
  hasPatient: true, hasDocument: true, consentSigned: true, qualityPassed: true,
  acquisitionIssue: null, launchState: "ready" as const, isLaunching: false,
};

describe("launching a prepared analysis", () => {
  it("allows a complete preparation with a ready inference service", () => {
    expect(canLaunchPreparedAnalysis(prepared)).toBe(true);
  });

  it.each(["hasPatient", "hasDocument", "consentSigned", "qualityPassed"] as const)("rechecks %s instead of trusting previously completed steps", (key) => {
    expect(canLaunchPreparedAnalysis({ ...prepared, [key]: false })).toBe(false);
  });

  it("prevents launching with missing settings or while a request is already pending", () => {
    expect(canLaunchPreparedAnalysis({ ...prepared, acquisitionIssue: "magnification" })).toBe(false);
    expect(canLaunchPreparedAnalysis({ ...prepared, isLaunching: true })).toBe(false);
  });

  it.each<LaunchState>(["loading", "status_error", "service_unavailable", "service_not_configured", "service_unauthorized", "service_error", "model_not_loaded"])("blocks launching when the service reports %s", (launchState) => {
    expect(canLaunchPreparedAnalysis({ ...prepared, launchState })).toBe(false);
  });
});
