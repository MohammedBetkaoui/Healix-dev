// What is printed on a prescription, from the last online login (see the
// bootstrap): the prescriber's lines and the cabinet's. Absent from an older
// server, and emptied at logout.
export type PrescriberIdentity = {
  fullName?: string | null;
  speciality?: string | null;
  registrationNumber?: string | null;
  regionalCouncil?: string | null;
  professionalAddress?: string | null;
};

export type OrganizationIdentity = {
  name?: string | null;
  address?: string | null;
  wilaya?: string | null;
  phone?: string | null;
};

export type SessionStatus = {
  authorized: boolean;
  expiresAt?: string;
  workspace?: { id: string; name: string; organization?: OrganizationIdentity | null };
  user?: { id: string; fullName: string; email: string; prescriber?: PrescriberIdentity | null };
};

export type LocalPatient = {
  id: string;
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
  birthDate: string;
  bloodGroup?: string | null;
  gender?: string | null;
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
  // When the validated AI results were last brought up to date, and whether the
  // latest attempt failed ("Résultats IA non mis à jour"). The sync itself is fine.
  aiReportsSyncedAt?: string | null;
  aiReportsFailed?: boolean;
  processed?: number;
  total?: number;
};

// A validated or corrected AI analysis, as the device keeps it (GET /sync/ai-reports):
// conclusions and figures only, never an image or a path.
export type AiReportPrediction = { label: string; probability: number };

export type AiReport = {
  runId: string;
  patientId: string;
  pipeline: string;
  moduleLabel: string;
  createdAt: string;
  decidedAt: string | null;
  decisionStatus: "VALIDATED" | "CORRECTED";
  decisionLabel: string | null;
  decisionLabels: string[] | null;
  clinicianImpression: string | null;
  modelDecision: string | null;
  modelLabels: string[] | null;
  topPredictions: AiReportPrediction[];
  measures: Record<string, number | null>;
  classificationModelId: string | null;
  classificationWeightsSha12: string | null;
  segmentationModelId: string | null;
  segmentationWeightsSha12: string | null;
  decidedByName: string | null;
  reportNumber: string | null;
  reportSha256: string | null;
  fetchedAt: string;
};

export type ConsultationDraftInput = {
  localId?: string;
  patientId: string;
  localStatus: "LOCAL_DRAFT" | "IN_PROGRESS" | "READY_TO_SYNC";
  // The appointment this consultation is for. Absent: the stored link is kept.
  appointmentId?: string | null;
  chiefComplaint: string;
  historyPresentIllness: string;
  clinicalExamination: string;
  assessment: string;
  carePlan: string;
  followUpPlan: string;
  // Three states, decided by the presence of the key (see consultation.rs):
  // absent = untouched (the stored value is kept, whether it came from the
  // server or from an earlier save), null = removed on purpose, a value = entered.
  vitalSigns?: ConsultationVitalSigns | null;
  diagnoses?: ConsultationDiagnosis[] | null;
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
  // The doctor's confirmation despite a known allergy: kept in the local audit
  // trail only (the server payload has no field for it).
  allergyOverride?: { reason: string; medications: string[] };
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
  // A prescription validated on the server: the fingerprint of its content and
  // the date it was prescribed, printed with it.
  contentFingerprint?: string | null;
  prescribedAt?: string | null;
};

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELED";

// A cached appointment (cloud -> device, read-only), with its patient.
export type LocalAppointment = {
  id: string;
  patientId: string;
  patientName: string;
  patientLocked: boolean;
  scheduledAt: string;
  durationMinutes: number | null;
  reason: string | null;
  status: AppointmentStatus | null;
};

// What the pages show of a consultation, deduced from the consultation and the
// outbox: DRAFT (local draft), PENDING_SYNC, SYNCED, CONFLICT.
export type ConsultationState = "DRAFT" | "PENDING_SYNC" | "SYNCED" | "CONFLICT";

export type ConsultationSummary = {
  localId: string;
  serverId: string | null;
  // The appointment it was started from, when it is linked to one.
  appointmentId?: string | null;
  patientId: string;
  patientName: string;
  patientLocked: boolean;
  date: string;
  chiefComplaint: string | null;
  firstDiagnosis: string | null;
  status: string | null;
  localStatus: string;
  state: ConsultationState;
  pendingSync: boolean;
  editable: boolean;
};

export type ConsultationDiagnosis = {
  label: string;
  code?: string | null;
  codeSystem?: string | null;
  isPrimary?: boolean;
  note?: string | null;
};

export type ConsultationVitalSigns = {
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  oxygenSaturation?: number | null;
  temperature?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
};

export type ConsultationDetail = Omit<ConsultationSummary, "chiefComplaint" | "firstDiagnosis"> & {
  appointmentId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  chiefComplaint: string;
  historyPresentIllness: string;
  clinicalExamination: string;
  assessment: string;
  carePlan: string;
  followUpPlan: string;
  vitalSigns: ConsultationVitalSigns | null;
  diagnoses: ConsultationDiagnosis[];
  addenda: Array<{ id: string; content: string; createdAt?: string }>;
};

export type PrescriptionSummary = {
  localId: string;
  serverId: string | null;
  patientId: string;
  patientName: string;
  patientLocked: boolean;
  serverStatus: LocalPrescription["serverStatus"];
  localStatus: LocalPrescription["localStatus"];
  type: string;
  validUntil: string | null;
  number: string | null;
  updatedAt: string;
  itemCount: number;
  medications: string | null;
};
