import type { LocalPatient, LocalPrescription, PrescriptionItemInput, SessionStatus } from "../types";
import type { PrescriptionPrintInput } from "./prescription-print";

// What a prescription needs to be printed: the patient, and the prescriber and
// cabinet the last online login brought.
export type PrintIdentity = {
  prescriber: NonNullable<NonNullable<SessionStatus["user"]>["prescriber"]> | null;
  organization: NonNullable<NonNullable<SessionStatus["workspace"]>["organization"]> | null;
};

export const printIdentityOf = (session: SessionStatus): PrintIdentity => ({
  prescriber: session.user?.prescriber ?? null,
  organization: session.workspace?.organization ?? null,
});

// The printed identity is there only after an online login with a server that
// sends it; without it the page would lack the registration number.
export const hasPrintIdentity = (identity: PrintIdentity) =>
  Boolean(identity.prescriber?.fullName && identity.prescriber.registrationNumber && identity.organization?.name);

// A prescription validated on the server: its official number, the date it was
// prescribed and its fingerprint.
export function printInputForPrescription(
  prescription: Pick<LocalPrescription, "number" | "serverStatus" | "updatedAt" | "prescribedAt" | "contentFingerprint">,
  items: PrescriptionItemInput[],
  patient: LocalPatient,
  identity: PrintIdentity,
): PrescriptionPrintInput {
  const validated = prescription.serverStatus === "VALIDATED" && Boolean(prescription.number);
  return {
    number: validated ? (prescription.number ?? null) : null,
    date: validated ? (prescription.prescribedAt ?? prescription.updatedAt) : prescription.updatedAt,
    contentFingerprint: validated ? (prescription.contentFingerprint ?? null) : null,
    patient,
    prescriber: identity.prescriber ?? {},
    organization: identity.organization ?? {},
    items,
  };
}

// A draft being written: no number, no fingerprint, established now.
export function printInputForDraft(
  items: PrescriptionItemInput[],
  patient: LocalPatient,
  identity: PrintIdentity,
  establishedAt: string = new Date().toISOString(),
): PrescriptionPrintInput {
  return {
    number: null,
    date: establishedAt,
    contentFingerprint: null,
    patient,
    prescriber: identity.prescriber ?? {},
    organization: identity.organization ?? {},
    items,
  };
}
