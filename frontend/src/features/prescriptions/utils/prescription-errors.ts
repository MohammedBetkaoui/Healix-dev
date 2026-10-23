import { isAxiosError } from "axios";

// Codes of backend/src/prescriptions/prescription-errors.ts (and the services
// that throw with a `code`), each with a message under prescriptions.errors.
const KNOWN_CODES = new Set([
  "ENCOUNTER_MISMATCH",
  "MEDICATION_NOT_FOUND",
  "PATIENT_OUT_OF_SCOPE",
  "PRESCRIBER_CREDENTIALS_INCOMPLETE",
  "PRESCRIBER_NOT_VERIFIED",
  "PRESCRIBER_REQUIRED",
  "PRESCRIBER_SUBSCRIPTION_INACTIVE",
  "PRESCRIPTION_CANCELED",
  "PRESCRIPTION_CONTENT_INTEGRITY_FAILED",
  "PRESCRIPTION_DOCUMENT_INTEGRITY_FAILED",
  "PRESCRIPTION_DOCUMENT_NOT_AVAILABLE",
  "PRESCRIPTION_DOCUMENT_NOT_FOUND",
  "PRESCRIPTION_EMPTY",
  "PRESCRIPTION_ITEM_INVALID",
  "PRESCRIPTION_NOT_CANCELABLE",
  "PRESCRIPTION_NOT_EDITABLE",
  "PRESCRIPTION_NOT_FOUND",
  "PRESCRIPTION_NOT_RENEWABLE",
  "PRESCRIPTION_PDF_RENDER_FAILED",
  "PRESCRIPTION_PDF_STORAGE_FAILED",
  "PRESCRIPTION_PERMISSION_DENIED",
  "REGULATORY_CARNET_REFERENCE_REQUIRED",
  "REGULATORY_CONFIRMATION_REQUIRED",
]);

/**
 * Key under prescriptions.errors for a failed call: the code of the API when
 * it is known, else the kind of failure (403 forbidden, 409 conflict, 400 or
 * 422 invalid, 404 notFound, no answer network).
 */
export function getPrescriptionErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "unknown";
  const status = error.response?.status;
  if (status === undefined) return "network";
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && KNOWN_CODES.has(code)) return code;
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "invalid";
  return "unknown";
}
