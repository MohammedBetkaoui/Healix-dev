import {
  mockPrescriptionGrants,
  resolvePrescriptionCapabilities,
} from "./prescription-permissions";

describe("prescription clinical capabilities", () => {
  it("does not grant prescribing rights to the establishment workspace by default", () => {
    expect(resolvePrescriptionCapabilities(mockPrescriptionGrants.ESTABLISHMENT)).toEqual({
      canViewPrescriptions: true,
      canCreatePrescription: false,
      canEditPrescription: false,
      canSignPrescription: false,
      canCancelPrescription: false,
      canPrintPrescription: true,
    });
  });

  it("maps explicit clinician grants to the doctor workspace", () => {
    expect(resolvePrescriptionCapabilities(mockPrescriptionGrants.DOCTOR)).toEqual({
      canViewPrescriptions: true,
      canCreatePrescription: true,
      canEditPrescription: true,
      canSignPrescription: true,
      canCancelPrescription: true,
      canPrintPrescription: true,
    });
  });
});

