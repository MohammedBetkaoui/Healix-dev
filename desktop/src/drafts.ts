import type { ConsultationDraftInput, PrescriptionDraftInput, PrescriptionItemInput } from "./types";

export const emptyDraft = (patientId: string): ConsultationDraftInput => ({
  patientId,
  localStatus: "LOCAL_DRAFT",
  chiefComplaint: "",
  historyPresentIllness: "",
  clinicalExamination: "",
  assessment: "",
  carePlan: "",
  followUpPlan: "",
});

export const emptyPrescriptionItem = (): PrescriptionItemInput => ({
  dci: "",
  brandName: null,
  strength: "",
  pharmaceuticalForm: "",
  route: "",
  manufacturer: null,
  regulatoryCategory: "STANDARD",
  dosePerIntake: "",
  frequency: "",
  intakeMoment: null,
  durationDays: null,
  quantity: "",
  patientInstructions: null,
  indication: null,
  asNeeded: false,
  renewalAllowed: false,
  substitutionAllowed: false,
});

export const emptyPrescriptionDraft = (patientId: string): PrescriptionDraftInput => ({
  patientId,
  type: "STANDARD",
  validUntil: null,
  regulatory: null,
  items: [emptyPrescriptionItem()],
});
