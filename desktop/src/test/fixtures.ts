import type {
  AiReport, ConsultationDetail, ConsultationSummary, LocalAppointment, LocalPatient, PrescriptionSummary, SyncStatus,
} from "../types";

// Synthetic data only.
export const online: SyncStatus = { state: "ONLINE", pendingCount: 0, conflictCount: 0, lastSyncedAt: null };

export const patient = (id: string, extra: Partial<LocalPatient> = {}): LocalPatient => ({
  id,
  firstName: `Prénom${id}`,
  lastName: `Nom${id}`,
  firstNameAr: "",
  lastNameAr: "",
  birthDate: "1990-01-01",
  serverUpdatedAt: "2026-10-30T10:00:00Z",
  lastSyncedAt: "2026-10-30T10:00:00Z",
  ...extra,
});

// An ISO instant `hours` from now.
export const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export const appointment = (id: string, patientId: string, extra: Partial<LocalAppointment> = {}): LocalAppointment => ({
  id,
  patientId,
  patientName: `Prénom${patientId} Nom${patientId}`,
  patientLocked: false,
  scheduledAt: inHours(1),
  durationMinutes: 30,
  reason: "Contrôle",
  status: "SCHEDULED",
  ...extra,
});

export const consultationSummary = (
  localId: string,
  patientId: string,
  extra: Partial<ConsultationSummary> = {},
): ConsultationSummary => ({
  localId,
  serverId: null,
  patientId,
  patientName: `Prénom${patientId} Nom${patientId}`,
  patientLocked: false,
  date: "2026-10-30T09:00:00.000Z",
  chiefComplaint: "Toux",
  firstDiagnosis: null,
  status: null,
  localStatus: "LOCAL_DRAFT",
  state: "DRAFT",
  pendingSync: false,
  editable: true,
  ...extra,
});

export const consultationDetail = (extra: Partial<ConsultationDetail> = {}): ConsultationDetail => ({
  localId: "c1",
  serverId: null,
  patientId: "1",
  patientName: "Prénom1 Nom1",
  patientLocked: false,
  date: "2026-10-30T09:00:00.000Z",
  status: null,
  localStatus: "LOCAL_DRAFT",
  state: "DRAFT",
  pendingSync: false,
  editable: true,
  appointmentId: null,
  startedAt: null,
  completedAt: null,
  chiefComplaint: "Toux persistante",
  historyPresentIllness: "",
  clinicalExamination: "",
  assessment: "",
  carePlan: "",
  followUpPlan: "",
  vitalSigns: null,
  diagnoses: [],
  addenda: [],
  ...extra,
});

export const prescriptionSummary = (localId: string, patientId: string, extra: Partial<PrescriptionSummary> = {}): PrescriptionSummary => ({
  localId,
  serverId: null,
  patientId,
  patientName: `Prénom${patientId} Nom${patientId}`,
  patientLocked: false,
  serverStatus: null,
  localStatus: "LOCAL_DRAFT",
  type: "STANDARD",
  validUntil: null,
  number: null,
  updatedAt: "2026-10-30T09:00:00.000Z",
  itemCount: 1,
  medications: "Paracétamol",
  ...extra,
});

// A validated brain MRI analysis, decided `daysAgo` days ago.
export const aiReport = (runId: string, patientId: string, extra: Partial<AiReport> = {}, daysAgo = 1): AiReport => {
  const decidedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    runId,
    patientId,
    pipeline: "brain",
    moduleLabel: "IRM cérébrale",
    createdAt: decidedAt,
    decidedAt,
    decisionStatus: "VALIDATED",
    decisionLabel: "glioma",
    decisionLabels: null,
    clinicianImpression: "Lésion compatible avec un gliome.",
    modelDecision: "glioma",
    modelLabels: null,
    topPredictions: [
      { label: "glioma", probability: 0.9 },
      { label: "meningioma", probability: 0.05 },
      { label: "pituitary", probability: 0.03 },
    ],
    measures: { maskAreaRatio: 0.042 },
    classificationModelId: "brain-effnet",
    classificationWeightsSha12: "abcdef012345",
    segmentationModelId: null,
    segmentationWeightsSha12: null,
    decidedByName: "Dr Démonstration",
    reportNumber: "CR-IA-2026-000123",
    reportSha256: "9".repeat(64),
    fetchedAt: decidedAt,
    ...extra,
  };
};
