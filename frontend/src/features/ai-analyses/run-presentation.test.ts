import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { type AiServiceStatus } from "./ai-analyses.types";
import {
  getFailedRunId,
  getGliomaMissedShare,
  getLaunchState,
  getRunErrorKey,
  getTopLabel,
  shortSha256,
  shouldWarnGliomaRecall,
  sortPredictions,
} from "./run-presentation";

const CLASSIFIER = "brain-efficientnetb4-tumor-classification";

const status = (service: AiServiceStatus["service"], loaded = true): AiServiceStatus => ({
  models: [{ error: null, loaded, modelId: CLASSIFIER, weightsSha256: "a".repeat(64) }],
  service,
});

const axiosError = (status: number, data: unknown) => {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, {}, response);
};

describe("predictions", () => {
  const predictions = [
    { label: "glioma", probability: 0.05 },
    { label: "meningioma", probability: 0.8 },
    { label: "notumor", probability: 0.1 },
    { label: "pituitary", probability: 0.05 },
  ];

  it("sorts by descending probability without mutating the input", () => {
    expect(sortPredictions(predictions).map((p) => p.label)).toEqual(["meningioma", "notumor", "glioma", "pituitary"]);
    expect(predictions[0].label).toBe("glioma");
  });

  it("gives the top label, or null without predictions", () => {
    expect(getTopLabel(predictions)).toBe("meningioma");
    expect(getTopLabel(null)).toBeNull();
    expect(getTopLabel([])).toBeNull();
  });
});

describe("glioma recall warning", () => {
  it("derives the missed share from the registry recall (0.835 → 16.5 %)", () => {
    expect(getGliomaMissedShare(CLASSIFIER)).toBe(0.165);
    expect(getGliomaMissedShare("unknown-model")).toBeNull();
  });

  it("warns for notumor and meningioma only", () => {
    expect(shouldWarnGliomaRecall("notumor")).toBe(true);
    expect(shouldWarnGliomaRecall("meningioma")).toBe(true);
    expect(shouldWarnGliomaRecall("glioma")).toBe(false);
    expect(shouldWarnGliomaRecall("pituitary")).toBe(false);
    expect(shouldWarnGliomaRecall(null)).toBe(false);
  });
});

describe("launch state", () => {
  const query = (data: AiServiceStatus | undefined, flags: Partial<{ isError: boolean; isLoading: boolean }> = {}) => ({
    data,
    isError: flags.isError ?? false,
    isLoading: flags.isLoading ?? false,
  });

  it("is ready only when the service answers with the classifier loaded", () => {
    expect(getLaunchState(query(status("available")), CLASSIFIER)).toBe("ready");
    expect(getLaunchState(query(status("available", false)), CLASSIFIER)).toBe("classifier_not_loaded");
    expect(getLaunchState(query({ models: [], service: "available" }), CLASSIFIER)).toBe("classifier_not_loaded");
  });

  it("gives the real reason otherwise", () => {
    expect(getLaunchState(query(undefined, { isLoading: true }), CLASSIFIER)).toBe("loading");
    expect(getLaunchState(query(undefined, { isError: true }), CLASSIFIER)).toBe("status_error");
    expect(getLaunchState(query(status("unavailable")), CLASSIFIER)).toBe("service_unavailable");
    expect(getLaunchState(query(status("not_configured")), CLASSIFIER)).toBe("service_not_configured");
    expect(getLaunchState(query(status("unauthorized")), CLASSIFIER)).toBe("service_unauthorized");
    expect(getLaunchState(query(status("error")), CLASSIFIER)).toBe("service_error");
  });
});

describe("run helpers", () => {
  it("shortens a SHA-256 to 12 characters", () => {
    expect(shortSha256("0123456789abcdef".repeat(4))).toBe("0123456789ab");
    expect(shortSha256(null)).toBeNull();
  });

  it("maps known error codes and falls back to unknown", () => {
    expect(getRunErrorKey("SERVICE_TIMEOUT")).toBe("SERVICE_TIMEOUT");
    expect(getRunErrorKey("SOMETHING_NEW")).toBe("unknown");
    expect(getRunErrorKey(null)).toBe("unknown");
  });

  it("reads the recorded run id from a failed POST", () => {
    expect(getFailedRunId(axiosError(503, { code: "AI_SERVICE_UNAVAILABLE", runId: "run-1" }))).toBe("run-1");
    expect(getFailedRunId(axiosError(422, { code: "AI_INPUT_REJECTED", runId: "run-2" }))).toBe("run-2");
    // Refused before any run (consent, document): no id.
    expect(getFailedRunId(axiosError(403, { message: "Consentement requis" }))).toBeNull();
    expect(getFailedRunId(new Error("network"))).toBeNull();
  });
});
