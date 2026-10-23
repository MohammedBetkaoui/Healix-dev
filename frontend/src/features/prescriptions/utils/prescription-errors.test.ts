import { AxiosError, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { getPrescriptionErrorKey } from "./prescription-errors";

const failure = (status: number, data: unknown = {}) =>
  new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { data, status } as AxiosResponse);

describe("getPrescriptionErrorKey", () => {
  it("returns the code of the API when it is a known one", () => {
    expect(getPrescriptionErrorKey(failure(409, { code: "PRESCRIPTION_NOT_EDITABLE", message: "x" }))).toBe("PRESCRIPTION_NOT_EDITABLE");
    expect(getPrescriptionErrorKey(failure(403, { code: "PRESCRIBER_REQUIRED" }))).toBe("PRESCRIBER_REQUIRED");
    expect(getPrescriptionErrorKey(failure(400, { code: "REGULATORY_CONFIRMATION_REQUIRED" }))).toBe("REGULATORY_CONFIRMATION_REQUIRED");
  });

  it("falls back to the kind of failure for 403, 404, 409 and 400 / 422", () => {
    expect(getPrescriptionErrorKey(failure(403, { code: "SOMETHING_NEW" }))).toBe("forbidden");
    expect(getPrescriptionErrorKey(failure(404))).toBe("notFound");
    expect(getPrescriptionErrorKey(failure(409))).toBe("conflict");
    expect(getPrescriptionErrorKey(failure(400, { message: ["items must not be empty"] }))).toBe("invalid");
    expect(getPrescriptionErrorKey(failure(422))).toBe("invalid");
  });

  it("tells a missing answer from other failures", () => {
    expect(getPrescriptionErrorKey(new AxiosError("Network Error"))).toBe("network");
    expect(getPrescriptionErrorKey(failure(500))).toBe("unknown");
    expect(getPrescriptionErrorKey(new Error("boom"))).toBe("unknown");
  });

  it("has a message in French and in Arabic for every key it can return", () => {
    const keys = ["unknown", "network", "forbidden", "notFound", "conflict", "invalid", "PRESCRIPTION_NOT_EDITABLE", "PRESCRIPTION_NOT_CANCELABLE", "PRESCRIPTION_NOT_RENEWABLE", "PRESCRIBER_REQUIRED", "PRESCRIPTION_PERMISSION_DENIED", "REGULATORY_CONFIRMATION_REQUIRED", "PRESCRIBER_CREDENTIALS_INCOMPLETE"];
    for (const locale of ["fr", "ar"] as const) {
      for (const key of keys) {
        const path = `prescriptions.errors.${key}`;
        expect(translate(dictionaries[locale], path)).not.toBe(path);
      }
    }
  });
});
