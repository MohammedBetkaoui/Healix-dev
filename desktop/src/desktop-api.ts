import { invoke as tauriInvoke } from "@tauri-apps/api/core";
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

type InvokeArgs = Parameters<typeof tauriInvoke>[1];

function invokeDesktop<T>(command: string, args?: InvokeArgs): Promise<T> {
  // Vite can render this UI in an ordinary browser during development, but
  // secrets, SQLCipher and native commands are intentionally unavailable
  // there. Avoid Tauri's opaque `undefined.invoke` TypeError.
  if (
    typeof window === "undefined" ||
    !("__TAURI_INTERNALS__" in window)
  ) {
    return Promise.reject(
      new Error(
        "Cette interface doit être ouverte par HealixDz Desktop. Lancez `npm run tauri dev`, pas `npm run dev` dans Chrome.",
      ),
    );
  }
  return tauriInvoke<T>(command, args);
}

export async function sessionStatus() {
  return invokeDesktop<SessionStatus>("session_status");
}

export async function loginAndBootstrap(input: {
  accountType: "INDEPENDENT_DOCTOR" | "ESTABLISHMENT";
  email: string;
  password: string;
  deviceName: string;
}) {
  return invokeDesktop<SessionStatus>("login_register_and_bootstrap", {
    apiBase: API_BASE,
    input,
  });
}

export async function listLocalPatients(query: string) {
  return invokeDesktop<LocalPatient[]>("list_local_patients", { query });
}

export async function saveConsultationDraft(input: ConsultationDraftInput) {
  return invokeDesktop<{ localId: string; operationId: string }>(
    "save_consultation_draft",
    { input },
  );
}

export async function listPatientPrescriptions(patientId: string) {
  return invokeDesktop<LocalPrescription[]>("list_patient_prescriptions", { patientId });
}

export async function getLocalPrescription(localId: string) {
  return invokeDesktop<LocalPrescription>("get_local_prescription", { localId });
}

export async function savePrescriptionDraft(input: PrescriptionDraftInput) {
  return invokeDesktop<{ localId: string; operationId: string }>(
    "save_prescription_draft",
    { input },
  );
}

export async function searchLocalMedications(query: string) {
  return invokeDesktop<LocalMedication[]>("search_local_medications", { query });
}

export async function syncNow() {
  return invokeDesktop<SyncStatus>("sync_now", { apiBase: API_BASE });
}

export async function getSyncStatus() {
  return invokeDesktop<SyncStatus>("get_sync_status");
}

export async function logoutLocal() {
  return invokeDesktop<void>("logout_local");
}
