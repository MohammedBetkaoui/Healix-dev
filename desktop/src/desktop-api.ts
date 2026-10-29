import { invoke } from "@tauri-apps/api/core";
import type {
  ConsultationDraftInput,
  LocalPatient,
  LocalMedication,
  LocalPrescription,
  PrescriptionDraftInput,
  SessionStatus,
  SyncStatus,
} from "./types";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api";

export async function sessionStatus() {
  return invoke<SessionStatus>("session_status");
}

export async function loginAndBootstrap(input: {
  accountType: "INDEPENDENT_DOCTOR" | "ESTABLISHMENT";
  email: string;
  password: string;
  deviceName: string;
}) {
  return invoke<SessionStatus>("login_register_and_bootstrap", {
    apiBase: API_BASE,
    input,
  });
}

export async function listLocalPatients(query: string) {
  return invoke<LocalPatient[]>("list_local_patients", { query });
}

export async function saveConsultationDraft(input: ConsultationDraftInput) {
  return invoke<{ localId: string; operationId: string }>(
    "save_consultation_draft",
    { input },
  );
}

export async function listPatientPrescriptions(patientId: string) {
  return invoke<LocalPrescription[]>("list_patient_prescriptions", { patientId });
}

export async function getLocalPrescription(localId: string) {
  return invoke<LocalPrescription>("get_local_prescription", { localId });
}

export async function savePrescriptionDraft(input: PrescriptionDraftInput) {
  return invoke<{ localId: string; operationId: string }>(
    "save_prescription_draft",
    { input },
  );
}

export async function searchLocalMedications(query: string) {
  return invoke<LocalMedication[]>("search_local_medications", { query });
}

export async function syncNow() {
  return invoke<SyncStatus>("sync_now", { apiBase: API_BASE });
}

export async function getSyncStatus() {
  return invoke<SyncStatus>("get_sync_status");
}

export async function logoutLocal() {
  return invoke<void>("logout_local");
}
