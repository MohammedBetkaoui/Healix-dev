// Wire types of backend/src/prescriptions (controller, DTOs, response mapper).
// Texts typed by the prescriber are plain strings: the API stores one value,
// not a French/Arabic pair.

/** Status stored by the API (Prisma `PrescriptionStatus`). */
export type StoredPrescriptionStatus =
  | "DRAFT"
  | "PENDING_VALIDATION"
  | "VALIDATED"
  | "CANCELED";

/**
 * Status shown to the user. The API stores four statuses and computes
 * `effectiveStatus` (adds EXPIRED); PRINTED is derived from `printedAt`
 * (see utils/prescription-status.ts).
 */
export type PrescriptionStatus =
  | StoredPrescriptionStatus
  | "PRINTED"
  | "EXPIRED";

export type PrescriptionType =
  | "STANDARD"
  | "REGULATED"
  | "PSYCHOTROPIC"
  | "NARCOTIC";

export type RegulatoryCategory = PrescriptionType;

export type PharmaceuticalForm =
  | "TABLET"
  | "CAPSULE"
  | "ORAL_SOLUTION"
  | "INJECTABLE"
  | "EYE_DROPS"
  | "OINTMENT"
  | "INHALER"
  | "OTHER";

export type AdministrationRoute =
  | "ORAL"
  | "IV"
  | "IM"
  | "SC"
  | "CUTANEOUS"
  | "OPHTHALMIC"
  | "INHALED"
  | "OTHER";

export type VerificationState = "YES" | "NO" | "UNKNOWN";
export type SafetyLevel = "information" | "attention" | "critical";

export type PrescriptionCapabilities = {
  canViewPrescriptions: boolean;
  canCreatePrescription: boolean;
  canEditPrescription: boolean;
  canSignPrescription: boolean;
  canCancelPrescription: boolean;
  canPrintPrescription: boolean;
};

export type PrescriptionMeta = {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};

export type PrescriptionStats = {
  alerts: number;
  canceled: number;
  drafts: number;
  month: number;
  renewSoon: number;
};

/** One entry of GET /prescriptions/medications. */
export type Medication = {
  id: string;
  dci: string;
  brandName: string | null;
  strength: string;
  pharmaceuticalForm: PharmaceuticalForm;
  route: AdministrationRoute;
  manufacturer: string | null;
  regulatoryCategory: RegulatoryCategory;
  reimbursable: VerificationState;
  requiresPriorApproval: VerificationState;
  source: string;
};

export type PrescriptionPatient = {
  id: string;
  firstName: string | null;
  firstNameAr: string | null;
  lastName: string | null;
  lastNameAr: string | null;
  birthDate: string | null;
  gender: "MALE" | "FEMALE" | null;
  hospitalRecordNumber: string | null;
};

export type PrescriptionPrescriber = {
  id: string;
  fullName: string | null;
  speciality: string | null;
  /** Only known once the prescription is validated (frozen snapshot). */
  registrationNumber: string | null;
  regionalCouncil: string | null;
  professionalAddress: string | null;
  phone: string | null;
};

export type PrescriptionEncounter = {
  id: string;
  date: string;
  practitionerId: string | null;
  label: string;
};

export type PrescriptionInsurance = {
  organization: string | null;
  maskedInsuredNumber: string | null;
};

export type PrescriptionMedication = {
  id: string | null;
  dci: string;
  brandName: string | null;
  strength: string;
  pharmaceuticalForm: PharmaceuticalForm;
  route: AdministrationRoute;
  manufacturer: string | null;
  regulatoryCategory: RegulatoryCategory;
};

export type PrescriptionItem = {
  id: string;
  position: number;
  medication: PrescriptionMedication;
  dosePerIntake: string;
  frequency: string;
  intakeMoment: string | null;
  durationDays: number | null;
  quantity: string;
  patientInstructions: string | null;
  indication: string | null;
  asNeeded: boolean;
  renewalAllowed: boolean;
  substitutionAllowed: boolean;
};

export type ClinicalSafetyAlert = {
  id: string;
  kind:
    | "ALLERGY"
    | "DUPLICATION"
    | "DURATION"
    | "DOSAGE"
    | "REGULATED"
    | "MISSING_CONTEXT";
  level: SafetyLevel;
  title: string;
  detail?: string;
  resolved: boolean;
};

/** Draft: what the prescriber entered. Frozen: the snapshot taken on validation. */
export type RegulatoryDetails = {
  acknowledgement?: boolean;
  carnetReference?: string | null;
  note?: string | null;
  category?: RegulatoryCategory;
  supportRequired?: boolean;
  prescriberRegistrationNumber?: string | null;
};

/** GET /prescriptions/:id and every action that returns the prescription. */
export type Prescription = {
  id: string;
  number: string | null;
  patient: PrescriptionPatient;
  prescriber: PrescriptionPrescriber;
  encounter: PrescriptionEncounter | null;
  prescribedAt: string;
  validUntil: string | null;
  status: StoredPrescriptionStatus;
  /** `status`, or EXPIRED once a validated prescription is past `validUntil`. */
  effectiveStatus: StoredPrescriptionStatus | "EXPIRED";
  type: PrescriptionType;
  items: PrescriptionItem[];
  alerts: ClinicalSafetyAlert[];
  regulatoryDetails: RegulatoryDetails | null;
  basedOnPrescriptionNumber: string | null;
  validatedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  printedAt: string | null;
  printCount: number;
  documentAvailable: boolean;
  insurance: PrescriptionInsurance | null;
  createdAt: string;
  updatedAt: string;
};

/** One row of GET /prescriptions. */
export type PrescriptionListItem = {
  id: string;
  number: string | null;
  prescribedAt: string;
  validUntil: string | null;
  status: StoredPrescriptionStatus;
  effectiveStatus: StoredPrescriptionStatus | "EXPIRED";
  type: PrescriptionType;
  patient: Pick<
    PrescriptionPatient,
    | "id"
    | "firstName"
    | "firstNameAr"
    | "lastName"
    | "lastNameAr"
    | "hospitalRecordNumber"
  >;
  prescriber: { id: string; fullName: string };
  medications: Array<{ dci: string; brandName: string | null }>;
  itemCount: number;
  validatedAt: string | null;
  canceledAt: string | null;
  printedAt: string | null;
  printCount: number;
  documentAvailable: boolean;
};

export type PrescriptionPage = {
  data: PrescriptionListItem[];
  meta: PrescriptionMeta;
};

export type PrescriptionListFilters = {
  from?: string;
  limit?: number;
  medicationId?: string;
  page?: number;
  patientId?: string;
  prescriberId?: string;
  query?: string;
  status?: StoredPrescriptionStatus;
  type?: PrescriptionType;
};

export type PrescriptionHistoryEntry = {
  id: string;
  /** Audit action code, e.g. PRESCRIPTION_VALIDATED. */
  action: string;
  actorName: string | null;
  createdAt: string;
};

/** GET /prescriptions/prescriber-context. */
export type PrescriberIdentity = {
  doctorProfileId: string;
  fullName: string;
  speciality: string;
  registrationNumber: string | null;
  regionalCouncil: string | null;
  registrationWilaya: string | null;
  professionalAddress: string;
  professionalPhone: string;
  organization: {
    id: string | null;
    name: string;
    address: string;
    wilaya: string;
    phone: string;
  };
  credentialsComplete: boolean;
};

export type PatientMedicalSummary = {
  allergies?: string[];
  chronicDiseases?: string[];
  currentMedications?: string[];
  history?: string[];
  notes?: string;
} | null;

/** GET /prescriptions/patients/:id/context. */
export type PatientContext = {
  patient: {
    id: string;
    firstName: string;
    firstNameAr: string;
    lastName: string;
    lastNameAr: string;
    birthDate: string;
    gender: "MALE" | "FEMALE";
    hospitalRecordNumber: string | null;
    insurance: "CNAS" | "CASNOS" | "UNINSURED" | "PRIVATE";
    maskedInsuredNumber: string | null;
    medicalSummary: PatientMedicalSummary;
  };
  encounters: Array<
    PrescriptionEncounter & { practitionerName: string | null }
  >;
};

// --- Request bodies (CreatePrescriptionDto, UpdatePrescriptionDto) ---

export type PrescriptionItemInput = {
  medicationId?: string;
  dci: string;
  brandName?: string;
  strength: string;
  pharmaceuticalForm: PharmaceuticalForm;
  route: AdministrationRoute;
  manufacturer?: string;
  regulatoryCategory: RegulatoryCategory;
  dosePerIntake: string;
  frequency: string;
  intakeMoment?: string;
  durationDays?: number;
  quantity: string;
  patientInstructions?: string;
  indication?: string;
  asNeeded?: boolean;
  renewalAllowed?: boolean;
  substitutionAllowed?: boolean;
};

export type RegulatoryDetailsInput = {
  acknowledgement: boolean;
  carnetReference?: string;
  note?: string;
};

export type CreatePrescriptionInput = {
  patientId: string;
  encounterId?: string;
  type?: PrescriptionType;
  validUntil?: string;
  items: PrescriptionItemInput[];
  regulatory?: RegulatoryDetailsInput;
};

export type UpdatePrescriptionInput = Partial<
  Omit<CreatePrescriptionInput, "patientId" | "encounterId" | "validUntil">
> & {
  encounterId?: string | null;
  validUntil?: string | null;
};
