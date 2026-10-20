import {
  type PrescriptionCapabilities,
  type PrescriptionClinicalGrant,
} from "../types/prescription.types";

export function resolvePrescriptionCapabilities(
  grants: ReadonlyArray<PrescriptionClinicalGrant>,
): PrescriptionCapabilities {
  const has = (grant: PrescriptionClinicalGrant) => grants.includes(grant);

  return {
    canViewPrescriptions: has("PRESCRIPTION_VIEW"),
    canCreatePrescription: has("PRESCRIPTION_CREATE"),
    canEditPrescription: has("PRESCRIPTION_EDIT"),
    canSignPrescription: has("PRESCRIPTION_SIGN"),
    canCancelPrescription: has("PRESCRIPTION_CANCEL"),
    canPrintPrescription: has("PRESCRIPTION_PRINT"),
  };
}

// Temporary frontend claims. They deliberately model clinical authorization
// separately from the visual workspace role and can later be replaced by API claims.
export const mockPrescriptionGrants = {
  DOCTOR: [
    "PRESCRIPTION_VIEW",
    "PRESCRIPTION_CREATE",
    "PRESCRIPTION_EDIT",
    "PRESCRIPTION_SIGN",
    "PRESCRIPTION_CANCEL",
    "PRESCRIPTION_PRINT",
  ],
  ESTABLISHMENT: ["PRESCRIPTION_VIEW", "PRESCRIPTION_PRINT"],
} as const satisfies Record<
  "DOCTOR" | "ESTABLISHMENT",
  ReadonlyArray<PrescriptionClinicalGrant>
>;

