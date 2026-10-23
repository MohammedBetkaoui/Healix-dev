import { type PrescriptionCapabilities } from "../types/prescription.types";

// Nothing is allowed until GET /prescriptions/capabilities has answered (or
// when it fails): the page never shows an action the API did not grant.
export const NO_PRESCRIPTION_CAPABILITIES: PrescriptionCapabilities = {
  canCancelPrescription: false,
  canCreatePrescription: false,
  canEditPrescription: false,
  canPrintPrescription: false,
  canSignPrescription: false,
  canViewPrescriptions: false,
};
