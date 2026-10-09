import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { getReportBlocker, getReportErrorKey, reportFileName } from "./run-report";

const axiosError = (status: number, data: unknown) => {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, {}, response);
};

describe("report availability", () => {
  it("is available for a SUCCEEDED run validated or corrected only", () => {
    expect(getReportBlocker({ decisionStatus: "VALIDATED", status: "SUCCEEDED" })).toBeNull();
    expect(getReportBlocker({ decisionStatus: "CORRECTED", status: "SUCCEEDED" })).toBeNull();
    expect(getReportBlocker({ decisionStatus: null, status: "SUCCEEDED" })).toBe("notDecided");
    expect(getReportBlocker({ decisionStatus: "REJECTED", status: "SUCCEEDED" })).toBe("rejected");
    expect(getReportBlocker({ decisionStatus: null, status: "FAILED" })).toBe("notSucceeded");
  });
});

describe("report errors", () => {
  it("explains AI_REPORT_NOT_AVAILABLE by its reason", () => {
    expect(getReportErrorKey(axiosError(409, { code: "AI_REPORT_NOT_AVAILABLE", reason: "NOT_DECIDED" }))).toBe("NOT_DECIDED");
    expect(getReportErrorKey(axiosError(409, { code: "AI_REPORT_NOT_AVAILABLE", reason: "REJECTED" }))).toBe("REJECTED");
  });

  it("explains a failed rendering, and nothing it does not know", () => {
    expect(getReportErrorKey(axiosError(500, { code: "AI_REPORT_RENDER_FAILED" }))).toBe("AI_REPORT_RENDER_FAILED");
    expect(getReportErrorKey(axiosError(500, { code: "SOMETHING" }))).toBe("unknown");
    expect(getReportErrorKey(axiosError(409, { code: "AI_REPORT_NOT_AVAILABLE", reason: "OTHER" }))).toBe("unknown");
    expect(getReportErrorKey(new Error("network"))).toBe("unknown");
  });
});

describe("report file name", () => {
  it("is the report number, never anything else", () => {
    expect(reportFileName("CR-IA-2026-000042")).toBe("CR-IA-2026-000042.pdf");
    expect(reportFileName(null)).toBe("compte-rendu.pdf");
    expect(reportFileName("Haddad Karim")).toBe("compte-rendu.pdf");
  });
});
