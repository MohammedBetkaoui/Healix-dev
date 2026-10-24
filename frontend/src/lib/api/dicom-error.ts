import { isAxiosError } from "axios";

import type { TranslationFunction } from "@/lib/i18n";

// The refusals of the DICOM routes (backend/src/dicom/dicom-errors.ts) in the
// user's language, the backend's messages being French only. undefined for any
// other error.
//   422 DICOM_ZIP_UNSAFE        { reason }   a ZIP refused as a whole
//   422 DICOM_NO_VALID_FILE     { skipped }
//   400 DICOM_UPLOAD_INVALID
//   502 DICOM_STORE_UNAVAILABLE
//   413 (Caddy or the backend)   the import is over 512 MiB
const zipReasons: readonly string[] = [
  "CORRUPT",
  "ENCRYPTED",
  "NESTED_ZIP",
  "PATH",
  "TOO_LARGE",
  "TOO_MANY_FILES",
];

export function getDicomErrorMessage(
  error: unknown,
  t: TranslationFunction,
): string | undefined {
  if (!isAxiosError(error)) {
    return undefined;
  }

  const status = error.response?.status;
  const data = error.response?.data as Record<string, unknown> | undefined;
  const code = typeof data?.code === "string" ? data.code : undefined;

  if (status === 413) {
    return t("dicom.import.problems.tooLarge");
  }

  switch (code) {
    case "DICOM_ZIP_UNSAFE": {
      const reason = typeof data?.reason === "string" ? data.reason : "";
      return zipReasons.includes(reason)
        ? t(`dicom.errors.DICOM_ZIP_UNSAFE.${reason}`)
        : t("dicom.errors.generic");
    }
    case "DICOM_NO_VALID_FILE":
      return t("dicom.errors.DICOM_NO_VALID_FILE", {
        skipped: typeof data?.skipped === "number" ? data.skipped : 0,
      });
    case "DICOM_UPLOAD_INVALID":
    case "DICOM_STORE_UNAVAILABLE":
      return t(`dicom.errors.${code}`);
    default:
      return undefined;
  }
}
