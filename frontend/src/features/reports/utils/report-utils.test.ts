import { NO_REPORT_CAPABILITIES } from "./report-permissions";
import {
  aiResults,
  getAiRunHref,
  getReportActions,
  getReportAge,
  getReportPatientName,
  initialReportFilters,
  isAiReportEligible,
  summarizeAiReportAvailability,
  toReportListFilters,
} from "./report-utils";

describe("AI report availability", () => {
  it("exposes only succeeded runs with a retained medical decision", () => {
    expect(isAiReportEligible({ decisionStatus: "VALIDATED", status: "SUCCEEDED" })).toBe(true);
    expect(isAiReportEligible({ decisionStatus: "CORRECTED", status: "SUCCEEDED" })).toBe(true);
    expect(isAiReportEligible({ decisionStatus: null, status: "SUCCEEDED" })).toBe(false);
    expect(isAiReportEligible({ decisionStatus: "REJECTED", status: "SUCCEEDED" })).toBe(false);
    expect(isAiReportEligible({ decisionStatus: null, status: "FAILED" })).toBe(false);
  });

  it("keeps unavailable AI states visible without manufacturing documents", () => {
    expect(summarizeAiReportAvailability([
      { decisionStatus: "VALIDATED", status: "SUCCEEDED" },
      { decisionStatus: null, status: "SUCCEEDED" },
      { decisionStatus: "REJECTED", status: "SUCCEEDED" },
      { decisionStatus: null, status: "FAILED" },
    ])).toEqual({ available: 1, notDecided: 1, notSucceeded: 1, rejected: 1 });
  });
});

const all = Object.fromEntries(Object.keys(NO_REPORT_CAPABILITIES).map((key) => [key, true])) as typeof NO_REPORT_CAPABILITIES;
type Source = Parameters<typeof getReportActions>[0];
const report = (overrides: Partial<Source> = {}): Source => ({
  documentAvailable: true,
  importedDocument: null,
  isCurrent: true,
  replacedBy: null,
  sourceType: "CONSULTATION",
  status: "FINAL",
  ...overrides,
});

describe("getReportActions", () => {
  it("lets a physician edit, finalize and delete a draft, but neither amend nor cancel it", () => {
    expect(getReportActions(report({ documentAvailable: false, status: "DRAFT" }), all)).toMatchObject({
      canAmend: false, canCancel: false, canDeleteDraft: true, canDownload: false, canEditDraft: true, canFinalize: true,
    });
  });

  it("lets a physician amend and cancel the current version of a finalized report", () => {
    for (const status of ["FINAL", "AMENDED"] as const) {
      expect(getReportActions(report({ status }), all)).toMatchObject({ canAmend: true, canCancel: true, canDeleteDraft: false, canDownload: true, canEditDraft: false, canFinalize: false, canPrint: true });
    }
  });

  it("offers neither Edit, Amend nor Cancel on the report of an AI analysis, which opens its PDF", () => {
    const ai = getReportActions(report({ sourceType: "AI_ANALYSIS" }), all);
    expect(ai).toMatchObject({ canAmend: false, canCancel: false, canEditDraft: false, canFinalize: false, canDownload: true, isAi: true });
  });

  it("does not amend an imported document, but can cancel it", () => {
    const imported = report({ importedDocument: { fileName: "bilan.pdf", id: "d1", mimeType: "application/pdf", sizeBytes: 10 }, sourceType: "EXTERNAL_DOCUMENT" });
    expect(getReportActions(imported, all)).toMatchObject({ canAmend: false, canCancel: true });
  });

  it("freezes a replaced, canceled or already amended version", () => {
    for (const closed of [report({ isCurrent: false }), report({ status: "CANCELED" }), report({ replacedBy: { id: "r2", number: null, version: 2 } })]) {
      expect(getReportActions(closed, all)).toMatchObject({ canAmend: false, canCancel: false });
    }
  });

  it("never shows an action the API did not grant", () => {
    expect(Object.entries(getReportActions(report(), NO_REPORT_CAPABILITIES)).filter(([key, value]) => key !== "isAi" && value)).toEqual([]);
    expect(getReportActions(report(), { ...all, canAmendReports: false, canCancelReports: false })).toMatchObject({ canAmend: false, canCancel: false, canDownload: true });
  });
});

describe("toReportListFilters", () => {
  it("sends only what is filled, a day as the whole day, and the debounced search", () => {
    expect(toReportListFilters({ ...initialReportFilters, query: "ignored", status: "FINAL", from: "2026-10-01", to: "2026-10-31", category: "RADIOLOGY" }, "amin", 2, 20)).toEqual({
      authorId: undefined,
      category: "RADIOLOGY",
      from: "2026-10-01T00:00:00.000Z",
      limit: 20,
      page: 2,
      patientId: undefined,
      query: "amin",
      sourceType: undefined,
      status: "FINAL",
      to: "2026-10-31T23:59:59.999Z",
    });
  });
});

describe("aiResults", () => {
  it("lists the top predictions of a classifier", () => {
    expect(aiResults({ pipeline: "brain", predictions: [{ label: "meningioma", probability: 0.9 }, { label: "glioma", probability: 0.1 }] })).toEqual([
      { code: "meningioma", label: "meningioma", score: 0.9, value: "meningioma" },
      { code: "glioma", label: "glioma", score: 0.1, value: "glioma" },
    ]);
  });

  it("marks the positive classes of an ECG and shows the areas of a cardiac segmentation", () => {
    const ecg = aiResults({ pipeline: "cardio-ecg", predictions: { positive: ["AFIB"], probabilities: { AFIB: 0.8, NORM: 0.1 } } });
    expect(ecg.map((row) => [row.code, row.value])).toEqual([["AFIB", "positive"], ["NORM", "below-threshold"]]);
    const mri = aiResults({ pipeline: "cardio-seg-mri", predictions: { structures: { LV: { areaMm2: 1234.56, pixels: 90 }, RV: { areaMm2: null, pixels: 42 } } } });
    expect(mri.map((row) => row.value)).toEqual(["1234.6 mm²", "42 px"]);
    expect(aiResults({ pipeline: "pathology-nuclei", predictions: null })).toEqual([]);
  });
});

describe("report helpers", () => {
  it("names the patient in the script of the page, falling back on the other", () => {
    const patient = { firstName: "Amina", firstNameAr: "أمينة", lastName: "Benali", lastNameAr: "" };
    expect(getReportPatientName(patient, "fr")).toBe("Amina Benali");
    expect(getReportPatientName(patient, "ar")).toBe("أمينة Benali");
  });

  it("computes the age on the date of the report", () => {
    expect(getReportAge("1985-03-12", "2026-03-11T10:00:00Z")).toBe(40);
    expect(getReportAge("1985-03-12", "2026-03-12T10:00:00Z")).toBe(41);
    expect(getReportAge(null, "2026-03-12T10:00:00Z")).toBeNull();
  });

  it("links an AI report to its analysis, in the space of the account", () => {
    const ai = { patientId: "p 1", runId: "run/1" };
    expect(getAiRunHref(ai, "DOCTOR")).toBe("/doctor/ai-analyses/runs/run%2F1?patient=p%201");
    expect(getAiRunHref(ai, "ESTABLISHMENT")).toBe("/establishment/ai-analyses/runs/run%2F1?patient=p%201");
  });
});
