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
