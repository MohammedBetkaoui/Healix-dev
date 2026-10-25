import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { cineStackRefusals } from "@/features/dicom/dicom.types";
import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { getDicomErrorMessage } from "./dicom-error";
import { getMutationErrorMessage } from "./get-mutation-error-message";

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

const tFor =
  (locale: Locale): TranslationFunction =>
  (key, params) =>
    translate(dictionaries[locale], key, params);

describe("getDicomErrorMessage", () => {
  it.each<Locale>(["fr", "ar"])("explains a refused ZIP by its reason (%s)", (locale) => {
    const t = tFor(locale);

    for (const reason of ["CORRUPT", "ENCRYPTED", "NESTED_ZIP", "PATH", "TOO_LARGE", "TOO_MANY_FILES"]) {
      const message = getDicomErrorMessage(
        axiosError(422, { code: "DICOM_ZIP_UNSAFE", reason }),
        t,
      );
      expect(message).toBe(t(`dicom.errors.DICOM_ZIP_UNSAFE.${reason}`));
      expect(message).not.toBe("");
    }
  });

  it("falls back on a generic text for a reason it does not know", () => {
    const t = tFor("fr");

    expect(
      getDicomErrorMessage(axiosError(422, { code: "DICOM_ZIP_UNSAFE", reason: "NEW" }), t),
    ).toBe(t("dicom.errors.generic"));
  });

  it.each<Locale>(["fr", "ar"])("says how many files were ignored when none is DICOM (%s)", (locale) => {
    const t = tFor(locale);

    const message = getDicomErrorMessage(
      axiosError(422, { code: "DICOM_NO_VALID_FILE", skipped: 7 }),
      t,
    );

    expect(message).toContain("7");
    expect(message).toBe(t("dicom.errors.DICOM_NO_VALID_FILE", { skipped: 7 }));
  });

  it("knows an invalid upload and an unreachable store", () => {
    const t = tFor("fr");

    expect(getDicomErrorMessage(axiosError(400, { code: "DICOM_UPLOAD_INVALID" }), t)).toBe(
      t("dicom.errors.DICOM_UPLOAD_INVALID"),
    );
    expect(getDicomErrorMessage(axiosError(502, { code: "DICOM_STORE_UNAVAILABLE" }), t)).toBe(
      t("dicom.errors.DICOM_STORE_UNAVAILABLE"),
    );
  });

  it.each<Locale>(["fr", "ar"])("explains a slice that cannot be analysed (%s)", (locale) => {
    const t = tFor(locale);

    for (const reason of ["PIPELINE", "MODALITY"]) {
      const message = getDicomErrorMessage(
        axiosError(422, { code: "DICOM_PIPELINE_NOT_SUPPORTED", reason }),
        t,
      );
      expect(message).toBe(t(`dicom.errors.DICOM_PIPELINE_NOT_SUPPORTED.${reason}`));
      expect(message).not.toContain("dicom.");
    }
    expect(
      getDicomErrorMessage(axiosError(422, { code: "DICOM_PIPELINE_NOT_SUPPORTED", reason: "NEW" }), t),
    ).toBe(t("dicom.analysis.error"));

    const multiframe = getDicomErrorMessage(
      axiosError(422, { code: "DICOM_MULTIFRAME_NOT_SUPPORTED", frames: 25 }),
      t,
    );
    expect(multiframe).toContain("25");
    expect(multiframe).toBe(t("dicom.errors.DICOM_MULTIFRAME_NOT_SUPPORTED", { frames: 25 }));
  });

  it.each<Locale>(["fr", "ar"])("explains a cine series the volumetry cannot read, by its reason (%s)", (locale) => {
    const t = tFor(locale);

    for (const reason of cineStackRefusals) {
      const message = getDicomErrorMessage(axiosError(422, { code: "DICOM_CINE_STACK_INVALID", reason }), t);
      expect(message).toBe(t(`dicom.errors.DICOM_CINE_STACK_INVALID.${reason}`));
      expect(message).not.toContain("dicom.");
    }
    expect(
      getDicomErrorMessage(axiosError(422, { code: "DICOM_CINE_STACK_INVALID", reason: "NEW" }), t),
    ).toBe(t("dicom.errors.generic"));
  });

  it("reads a 413 (Caddy, with no code) as an import that is too large", () => {
    const t = tFor("fr");

    expect(getDicomErrorMessage(axiosError(413, "Request Entity Too Large"), t)).toBe(
      t("dicom.import.problems.tooLarge"),
    );
  });

  it("has nothing to say about another error", () => {
    const t = tFor("fr");

    expect(getDicomErrorMessage(axiosError(500, { code: "OTHER" }), t)).toBeUndefined();
    expect(getDicomErrorMessage(new Error("boom"), t)).toBeUndefined();
    expect(getDicomErrorMessage(undefined, t)).toBeUndefined();
  });

  it("is part of the message of a write modal, before the backend's French text", () => {
    const t = tFor("ar");
    const error = axiosError(422, {
      code: "DICOM_ZIP_UNSAFE",
      message: "Cette archive ZIP est refusée",
      reason: "NESTED_ZIP",
    });

    expect(getMutationErrorMessage(error, t, "fallback")).toBe(
      t("dicom.errors.DICOM_ZIP_UNSAFE.NESTED_ZIP"),
    );
  });
});
