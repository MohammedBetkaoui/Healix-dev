import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import {
  analysableInstances,
  analysableSeries,
  canLaunchDicomAnalysis,
  DICOM_ANALYSIS_PIPELINES,
  dicomRunPagePath,
  failedRunPagePath,
  formatDicomSlice,
} from "./dicom-analysis";
import { type DicomInstance, type DicomSeries, type DicomStudyDetail } from "./dicom.types";

const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const ar = (key: string, params?: Record<string, string | number>) => translate(dictionaries.ar, key, params);

const instance = (id: string, overrides: Partial<DicomInstance> = {}): DicomInstance => ({
  frames: 1,
  id,
  instanceNumber: Number(id.replace(/\D/g, "")) || null,
  multiFrame: false,
  sopInstanceUid: `1.2.3.${id}`,
  ...overrides,
});

const series = (id: string, overrides: Partial<DicomSeries> = {}): DicomSeries => ({
  description: null,
  id,
  instances: [instance("i1"), instance("i2")],
  instancesCount: 2,
  modality: "MR",
  number: 1,
  seriesInstanceUid: `1.2.${id}`,
  ...overrides,
});

const study = (...allSeries: DicomSeries[]): DicomStudyDetail => ({
  createdAt: "2026-10-24T10:00:00.000Z",
  id: "study-1",
  identityWarnings: [],
  instancesCount: 4,
  modalities: ["MR"],
  patientId: "patient-1",
  series: allSeries,
  seriesCount: allSeries.length,
  sizeBytes: 1024,
  studyDate: null,
  studyDescription: null,
  studyInstanceUid: "1.2.826.0.1.1",
  uploadedById: "user-1",
});

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

describe("the chains that read a slice", () => {
  it("are the brain chain and the cardiac MRI segmentation, as in the backend", () => {
    expect(DICOM_ANALYSIS_PIPELINES).toEqual(["brain", "cardio-seg-mri"]);
  });
});

describe("analysableInstances", () => {
  it("keeps the single-frame images, in the order of the stack", () => {
    const mixed = series("s", {
      instances: [instance("i1"), instance("i2", { frames: 30, multiFrame: true }), instance("i3")],
    });

    expect(analysableInstances(mixed).map((item) => item.id)).toEqual(["i1", "i3"]);
  });
});

describe("analysableSeries", () => {
  it("keeps the MRI series that have a single-frame image", () => {
    const result = analysableSeries(
      study(
        series("mr-a"),
        series("ct", { modality: "CT" }),
        series("mr-cine", { instances: [instance("i1", { frames: 25, multiFrame: true })] }),
        series("none", { modality: null }),
        series("mr-b", { number: 2 }),
      ),
    );

    expect(result.map((item) => item.id)).toEqual(["mr-a", "mr-b"]);
  });

  it("is empty for a study with no MRI", () => {
    expect(analysableSeries(study(series("ct", { modality: "CT" })))).toEqual([]);
    expect(analysableSeries(study())).toEqual([]);
  });
});

describe("formatDicomSlice", () => {
  it.each([
    [fr, { instanceNumber: 12, seriesNumber: 3 }, "Série 3, coupe n° 12"],
    [fr, { instanceNumber: null, seriesNumber: 3 }, "Série 3, coupe n° sans numéro"],
    [fr, { instanceNumber: 12, seriesNumber: null }, "Série sans numéro, coupe n° 12"],
  ])("writes %#", (t, slice, expected) => {
    expect(formatDicomSlice(slice, t)).toBe(expected);
  });

  it("is written in Arabic as well", () => {
    const text = formatDicomSlice({ instanceNumber: 12, seriesNumber: 3 }, ar);

    expect(text).toContain("3");
    expect(text).toContain("12");
    expect(text).not.toContain("dicom.");
  });
});

describe("dicomRunPagePath", () => {
  it("opens the run in the workspace of the account, with the patient", () => {
    expect(dicomRunPagePath("DOCTOR", "p 1", "run/1")).toBe("/doctor/ai-analyses/runs/run%2F1?patient=p%201");
    expect(dicomRunPagePath("ESTABLISHMENT", "p1", "r1")).toBe("/establishment/ai-analyses/runs/r1?patient=p1");
  });
});

describe("failedRunPagePath", () => {
  it("opens the run a refused analysis was recorded as", () => {
    expect(failedRunPagePath("DOCTOR", "p1", axiosError(422, { code: "AI_INPUT_REJECTED", runId: "run-9" }))).toBe(
      "/doctor/ai-analyses/runs/run-9?patient=p1",
    );
  });

  it.each([
    ["a quota", axiosError(403, { code: "QUOTA_EXCEEDED" })],
    ["a chain that reads no slice", axiosError(422, { code: "DICOM_PIPELINE_NOT_SUPPORTED", reason: "PIPELINE" })],
    ["a network error", new Error("Network Error")],
    ["nothing", undefined],
  ])("has no page for %s: no run exists", (_label, error) => {
    expect(failedRunPagePath("DOCTOR", "p1", error)).toBeNull();
  });
});

describe("canLaunchDicomAnalysis", () => {
  const ready = { busy: false, consentMissing: false, hasSlice: true, pipeline: "brain" as const, readOnly: false };

  it("is on with a slice, a chain, the consent and a live subscription", () => {
    expect(canLaunchDicomAnalysis(ready)).toBe(true);
    expect(canLaunchDicomAnalysis({ ...ready, pipeline: "cardio-seg-mri" })).toBe(true);
  });

  it.each([
    ["no chain chosen", { pipeline: null }],
    ["no slice", { hasSlice: false }],
    ["the AI consent missing", { consentMissing: true }],
    ["a read-only account", { readOnly: true }],
    ["an analysis already running", { busy: true }],
  ])("is off with %s", (_label, change) => {
    expect(canLaunchDicomAnalysis({ ...ready, ...change })).toBe(false);
  });
});
