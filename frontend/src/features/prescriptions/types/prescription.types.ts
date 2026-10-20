export type LocalizedText = {
  fr: string;
  ar: string;
};

export type PrescriptionStatus =
  | "DRAFT"
  | "PENDING_VALIDATION"
  | "VALIDATED"
  | "PRINTED"
  | "CANCELED"
  | "EXPIRED";

export type PrescriptionType =
  | "STANDARD"
  | "REGULATED"
  | "PSYCHOTROPIC"
  | "NARCOTIC";

export type RegulatoryCategory =
  | "STANDARD"
  | "REGULATED"
  | "PSYCHOTROPIC"
  | "NARCOTIC";

export type PharmaceuticalForm =
  | "TABLET"
  | "CAPSULE"
  | "ORAL_SOLUTION"
  | "INJECTABLE"
  | "EYE_DROPS"
  | "OINTMENT"
  | "INHALER";

export type AdministrationRoute =
  | "ORAL"
  | "IV"
  | "IM"
  | "SC"
  | "CUTANEOUS"
  | "OPHTHALMIC"
  | "INHALED";

export type VerificationState = "YES" | "NO" | "UNKNOWN";
export type SafetyLevel = "information" | "attention" | "critical";

export type PrescriptionClinicalGrant =
  | "PRESCRIPTION_VIEW"
  | "PRESCRIPTION_CREATE"
  | "PRESCRIPTION_EDIT"
  | "PRESCRIPTION_SIGN"
  | "PRESCRIPTION_CANCEL"
  | "PRESCRIPTION_PRINT";

export type PrescriptionCapabilities = {
  canViewPrescriptions: boolean;
  canCreatePrescription: boolean;
  canEditPrescription: boolean;
  canSignPrescription: boolean;
  canCancelPrescription: boolean;
  canPrintPrescription: boolean;
};

export type InsuranceContextData = {
  organization: "CNAS" | "CASNOS" | "OTHER" | "UNKNOWN";
  beneficiaryType: "INSURED" | "BENEFICIARY" | "UNKNOWN";
  maskedInsuredNumber?: string;
  maskedChifaNumber?: string;
  coverageKnown: boolean;
};

export type PrescriptionPatient = {
  id: string;
  fileNumber: string;
  firstName: LocalizedText;
  lastName: LocalizedText;
  birthDate: string;
  sex: "FEMALE" | "MALE";
  phone: string;
  address?: LocalizedText;
  identityDocumentNumber?: string;
  insurance: InsuranceContextData;
  allergies?: LocalizedText[];
  activeTreatments?: LocalizedText[];
  chronicConditions?: LocalizedText[];
  pregnancyBreastfeeding?: LocalizedText;
  weightKg?: number;
  renalFunction?: LocalizedText;
  hepaticFunction?: LocalizedText;
};

export type Practitioner = {
  id: string;
  firstName: string;
  lastName: string;
  specialty: LocalizedText;
  registrationNumber: string;
  regionalCouncil: LocalizedText;
  organization: LocalizedText;
  professionalAddress: LocalizedText;
  phone: string;
};

export type PrescriptionEncounter = {
  id: string;
  date: string;
  practitionerId: string;
  label: LocalizedText;
};

export type Medication = {
  id: string;
  dci: string;
  brandName?: string;
  strength: string;
  pharmaceuticalForm: PharmaceuticalForm;
  route: AdministrationRoute;
  manufacturer: string;
  regulatoryCategory: RegulatoryCategory;
  reimbursable: VerificationState;
  requiresPriorApproval: VerificationState;
};

export type PrescriptionItem = {
  id: string;
  medication: Medication;
  dosePerIntake: LocalizedText;
  frequency: LocalizedText;
  intakeMoment: LocalizedText;
  durationDays: number;
  quantity: LocalizedText;
  patientInstructions: LocalizedText;
  indication: LocalizedText;
  asNeeded: boolean;
  renewalAllowed: boolean;
  substitutionAllowed: boolean;
};

export type ClinicalSafetyAlert = {
  id: string;
  kind:
    | "ALLERGY_CLEAR"
    | "ALLERGY"
    | "INTERACTION"
    | "DUPLICATION"
    | "DURATION"
    | "DOSAGE"
    | "PREGNANCY"
    | "RENAL"
    | "HEPATIC"
    | "HIGH_RISK"
    | "REGULATED";
  level: SafetyLevel;
  title: LocalizedText;
  detail?: LocalizedText;
  resolved: boolean;
};

export type PrescriptionAuditEvent = {
  id: string;
  at: string;
  actor: string;
  label: LocalizedText;
};

export type RegulatoryDetails = {
  supportRequired: boolean;
  validityLabel: LocalizedText;
  carnetReference?: string;
  ordinalRegistration?: string;
  signatureRecorded: boolean;
};

export type Prescription = {
  id: string;
  number: string;
  patient: PrescriptionPatient;
  prescriber: Practitioner;
  encounter?: PrescriptionEncounter;
  prescribedAt: string;
  validUntil?: string;
  status: PrescriptionStatus;
  type: PrescriptionType;
  items: PrescriptionItem[];
  alerts: ClinicalSafetyAlert[];
  auditTrail: PrescriptionAuditEvent[];
  basedOnPrescriptionNumber?: string;
  canceledAt?: string;
  canceledBy?: string;
  cancellationReason?: string;
  validatedAt?: string;
  printedAt?: string;
  regulatoryDetails?: RegulatoryDetails;
};

export type PrescriptionDraft = {
  patientId: string;
  encounterId?: string;
  items: PrescriptionItem[];
  basedOnPrescriptionNumber?: string;
};

