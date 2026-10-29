export type SessionStatus = {
  authorized: boolean;
  expiresAt?: string;
  workspace?: { id: string; name: string };
  user?: { id: string; fullName: string; email: string };
};

export type LocalPatient = {
  id: string;
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
  birthDate: string;
  bloodGroup?: string | null;
  hospitalRecordNumber?: string | null;
  locked?: boolean;
  lockReason?: string;
  medicalSummary?: {
    allergies?: string[];
    chronicDiseases?: string[];
    currentMedications?: string[];
    history?: string[];
    notes?: string;
  } | null;
  serverUpdatedAt: string;
  lastSyncedAt: string;
};

export type SyncState =
  | "ONLINE"
  | "OFFLINE"
  | "SYNCING"
  | "CONFLICT"
  | "LOCKED"
  | "AUTH_EXPIRED"
  | "SCOPE_REVOKED";

export type SyncStatus = {
  state: SyncState;
  pendingCount: number;
  conflictCount: number;
  lockedCount?: number;
  lastSyncedAt?: string | null;
  processed?: number;
  total?: number;
};

export type ConsultationDraftInput = {
  localId?: string;
  patientId: string;
  localStatus: "LOCAL_DRAFT" | "IN_PROGRESS" | "READY_TO_SYNC";
  chiefComplaint: string;
  historyPresentIllness: string;
  clinicalExamination: string;
  assessment: string;
  carePlan: string;
  followUpPlan: string;
};

export type LocalMedication = {
  id: string;
  dci: string;
  brandName?: string | null;
  strength: string;
  pharmaceuticalForm: string;
  route: string;
  manufacturer?: string | null;
  regulatoryCategory: string;
  active: boolean;
  updatedAt: string;
};

export type PrescriptionItemInput = {
  medicationId?: string | null;
  dci: string;
  brandName?: string | null;
  strength: string;
  pharmaceuticalForm: string;
  route: string;
  manufacturer?: string | null;
  regulatoryCategory: string;
  dosePerIntake: string;
  frequency: string;
  intakeMoment?: string | null;
  durationDays?: number | null;
  quantity: string;
  patientInstructions?: string | null;
  indication?: string | null;
  asNeeded: boolean;
  renewalAllowed: boolean;
  substitutionAllowed: boolean;
};

export type PrescriptionDraftInput = {
  localId?: string;
  patientId: string;
  encounterId?: string | null;
  type: string;
  validUntil?: string | null;
  regulatory?: Record<string, unknown> | null;
  items: PrescriptionItemInput[];
};

export type LocalPrescription = {
  localId: string;
  serverId?: string | null;
  patientId: string;
  serverStatus?: "DRAFT" | "PENDING_VALIDATION" | "VALIDATED" | "CANCELED" | null;
  localStatus: "LOCAL_DRAFT" | "PENDING_SYNC" | "SYNCED" | "CONFLICT" | "READ_ONLY";
  baseVersion?: number | null;
  type: string;
  validUntil?: string | null;
  items: PrescriptionItemInput[];
  number?: string | null;
  updatedAt: string;
};
