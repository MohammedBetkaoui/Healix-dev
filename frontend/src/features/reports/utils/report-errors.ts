import { isAxiosError } from "axios";

// Codes of backend/src/reports/report-errors.ts (and the shared physician
// checks of the prescriptions), each with a message under reports.errors.
const KNOWN_CODES = new Set([
  "ENCOUNTER_MISMATCH",
  "PATIENT_OUT_OF_SCOPE",
  "PRESCRIBER_CREDENTIALS_INCOMPLETE",
  "PRESCRIBER_NOT_VERIFIED",
  "PRESCRIBER_REQUIRED",
  "PRESCRIBER_SUBSCRIPTION_INACTIVE",
  "REPORT_AI_IMMUTABLE",
  "REPORT_AMENDMENT_IN_PROGRESS",
  "REPORT_AUTHOR_REQUIRED",
  "REPORT_DOCUMENT_NOT_AVAILABLE",
  "REPORT_DOCUMENT_NOT_FOUND",
  "REPORT_EMPTY",
  "REPORT_IMPORT_FILE_REQUIRED",
  "REPORT_INTEGRITY_FAILED",
  "REPORT_NOT_AMENDABLE",
  "REPORT_NOT_CANCELABLE",
  "REPORT_NOT_EDITABLE",
  "REPORT_NOT_FINALIZABLE",
  "REPORT_NOT_FOUND",
  "REPORT_PDF_RENDER_FAILED",
  "REPORT_PDF_STORAGE_FAILED",
  "REPORT_PERMISSION_DENIED",
]);

/**
 * Key under reports.errors for a failed call: the code of the API when it is
 * a known one, else the kind of failure (403 forbidden, 404 notFound, 409
 * conflict, 400 / 413 / 415 / 422 invalid, no answer network).
 */
export function getReportErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "unknown";
  const status = error.response?.status;
  if (status === undefined) return "network";
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && KNOWN_CODES.has(code)) return code;
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status === 413) return "fileTooLarge";
  if (status === 415) return "fileType";
  if (status === 400 || status === 422) return "invalid";
  return "unknown";
}
