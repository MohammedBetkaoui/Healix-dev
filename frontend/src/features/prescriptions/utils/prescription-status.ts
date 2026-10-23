import {
  type PrescriptionStatus,
  type StoredPrescriptionStatus,
} from "../types/prescription.types";

type StatusSource = {
  effectiveStatus: StoredPrescriptionStatus | "EXPIRED";
  printedAt: string | null;
};

/**
 * Status shown to the user.
 *
 * The API stores DRAFT / PENDING_VALIDATION / VALIDATED / CANCELED and
 * computes `effectiveStatus` (VALIDATED past `validUntil` becomes EXPIRED).
 * It does not derive PRINTED: a validated prescription whose document was
 * printed or exported (`printedAt`) is shown as PRINTED. An expired or
 * canceled prescription keeps its own status even if it was printed.
 */
export function getDisplayStatus({ effectiveStatus, printedAt }: StatusSource): PrescriptionStatus {
  return effectiveStatus === "VALIDATED" && printedAt ? "PRINTED" : effectiveStatus;
}

/**
 * The list endpoint only filters on the stored statuses. PRINTED and EXPIRED
 * are both VALIDATED in storage: they are requested as VALIDATED, then the
 * rows of the page are narrowed with `matchesDisplayStatus`.
 */
export function toStoredStatusFilter(status: "" | PrescriptionStatus): StoredPrescriptionStatus | undefined {
  if (!status) return undefined;
  return status === "PRINTED" || status === "EXPIRED" ? "VALIDATED" : status;
}

export function matchesDisplayStatus(row: StatusSource, status: "" | PrescriptionStatus) {
  return !status || getDisplayStatus(row) === status;
}

type ActionSource = StatusSource & { status: StoredPrescriptionStatus };

/** A validated prescription (printed or not), not expired, can be canceled. */
export function isCancelable(source: ActionSource) {
  const display = getDisplayStatus(source);
  return display === "VALIDATED" || display === "PRINTED";
}

/** Renewing starts a new draft from a validated prescription (expired included). */
export function isRenewable(source: ActionSource) {
  return source.status === "VALIDATED";
}

export function isDraft(source: Pick<ActionSource, "status">) {
  return source.status === "DRAFT";
}

/** A draft, or a draft submitted for validation, can be validated. */
export function isValidatable(source: Pick<ActionSource, "status">) {
  return source.status === "DRAFT" || source.status === "PENDING_VALIDATION";
}
