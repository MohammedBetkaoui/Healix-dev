import { AxiosError, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { getReportErrorKey } from "./report-errors";

const failure = (status: number, data: unknown = {}) =>
  new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { data, status } as AxiosResponse);

describe("getReportErrorKey", () => {
  it("returns the code of the API when it is a known one", () => {
    expect(getReportErrorKey(failure(409, { code: "REPORT_NOT_EDITABLE" }))).toBe("REPORT_NOT_EDITABLE");
    expect(getReportErrorKey(failure(409, { code: "REPORT_AI_IMMUTABLE" }))).toBe("REPORT_AI_IMMUTABLE");
    expect(getReportErrorKey(failure(403, { code: "REPORT_PERMISSION_DENIED" }))).toBe("REPORT_PERMISSION_DENIED");
    expect(getReportErrorKey(failure(409, { code: "PRESCRIBER_CREDENTIALS_INCOMPLETE" }))).toBe("PRESCRIBER_CREDENTIALS_INCOMPLETE");
  });

  it("falls back to the kind of failure", () => {
    expect(getReportErrorKey(failure(403, { code: "SOMETHING_NEW" }))).toBe("forbidden");
    expect(getReportErrorKey(failure(404))).toBe("notFound");
    expect(getReportErrorKey(failure(409))).toBe("conflict");
    expect(getReportErrorKey(failure(400, { message: ["title must not be empty"] }))).toBe("invalid");
    expect(getReportErrorKey(failure(422))).toBe("invalid");
    expect(getReportErrorKey(failure(413))).toBe("fileTooLarge");
    expect(getReportErrorKey(failure(415))).toBe("fileType");
    expect(getReportErrorKey(new AxiosError("Network Error"))).toBe("network");
    expect(getReportErrorKey(failure(500))).toBe("unknown");
    expect(getReportErrorKey(new Error("boom"))).toBe("unknown");
  });

  it("has a message in French and in Arabic for every code it can return", () => {
    const keys = [
      "unknown", "network", "forbidden", "notFound", "conflict", "invalid", "fileTooLarge", "fileType",
      "ENCOUNTER_MISMATCH", "PATIENT_OUT_OF_SCOPE", "PRESCRIBER_CREDENTIALS_INCOMPLETE", "PRESCRIBER_NOT_VERIFIED", "PRESCRIBER_REQUIRED",
      "PRESCRIBER_SUBSCRIPTION_INACTIVE", "REPORT_AI_IMMUTABLE", "REPORT_AMENDMENT_IN_PROGRESS", "REPORT_AUTHOR_REQUIRED",
      "REPORT_DOCUMENT_NOT_AVAILABLE", "REPORT_DOCUMENT_NOT_FOUND", "REPORT_EMPTY", "REPORT_IMPORT_FILE_REQUIRED", "REPORT_INTEGRITY_FAILED",
      "REPORT_NOT_AMENDABLE", "REPORT_NOT_CANCELABLE", "REPORT_NOT_EDITABLE", "REPORT_NOT_FINALIZABLE", "REPORT_NOT_FOUND",
      "REPORT_PDF_RENDER_FAILED", "REPORT_PDF_STORAGE_FAILED", "REPORT_PERMISSION_DENIED",
    ];
    for (const locale of ["fr", "ar"] as const) {
      for (const key of keys) {
        const path = `reports.errors.${key}`;
        expect(translate(dictionaries[locale], path)).not.toBe(path);
      }
    }
  });
});
