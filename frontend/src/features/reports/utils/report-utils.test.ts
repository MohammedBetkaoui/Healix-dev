import { isAiReportEligible, summarizeAiReportAvailability } from "./report-utils";

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

