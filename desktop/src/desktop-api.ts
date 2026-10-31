import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  AiReport,
  ConsultationDetail,
  ConsultationDraftInput,
  ConsultationSummary,
  LocalAppointment,
  LocalPatient,
  LocalMedication,
  LocalPrescription,
  PrescriptionDraftInput,
  PrescriptionSummary,
  SessionStatus,
  SyncStatus,
} from "./types";

// The API base ships with the build and is never silently defaulted: a
// production installer pointing at localhost would fail inside a clinic with
// an obscure network error. `npm run dev` keeps the local backend default,
// a missing production configuration makes every release build fail fast.
const configuredBase = import.meta.env.VITE_API_BASE_URL;
export const API_BASE: string =
  configuredBase ?? (import.meta.env.DEV ? "http://localhost:3001/api" : "");
// Belt-and-braces at startup: a release build without an explicit HTTPS API
// URL dies immediately instead of silently pointing at the dev backend. The
// only escape hatch is the CI validation build (VITE_IGNORE_MISSING_API_BASE
// =1), whose artifacts are never distributed.
if (
  !import.meta.env.DEV &&
  import.meta.env.VITE_IGNORE_MISSING_API_BASE !== "1" &&
  !API_BASE.startsWith("https://")
) {
  throw new Error(
    "Build Desktop mal configuré : VITE_API_BASE_URL doit pointer explicitement vers l'API HealixDz en HTTPS.",
  );
}

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

// Read-only views for the pages: the agenda of a period (ISO instants, the end
// excluded), and the consultations and prescriptions of the workspace or of one
// patient.
export async function listAppointments(from: string, to: string) {
  return invokeDesktop<LocalAppointment[]>("list_appointments", { from, to });
}

export async function listConsultations(patientId?: string | null) {
  return invokeDesktop<ConsultationSummary[]>("list_consultations", {
    patientId: patientId ?? null,
  });
}

// One patient of this device, wherever it lies in the list: the medical summary
// of the safety checks and the identity of a printed prescription.
export async function getLocalPatient(patientId: string) {
  return invokeDesktop<LocalPatient>("get_local_patient", { patientId });
}

// A prescription printed here is noted in the local audit trail.
export async function recordPrescriptionPrint(localId: string) {
  return invokeDesktop<void>("record_prescription_print", { localId });
}

// The validated AI results of the device, most recent decision first. `since` is an
// ISO-8601 instant in UTC. Read-only: the desktop never starts an analysis.
export async function listAiReports(patientId?: string | null, since?: string | null) {
  return invokeDesktop<AiReport[]>("list_ai_reports", {
    patientId: patientId ?? null,
    since: since ?? null,
  });
}

export async function getAiReport(runId: string) {
  return invokeDesktop<AiReport>("get_ai_report", { runId });
}

export async function getConsultation(localId: string) {
  return invokeDesktop<ConsultationDetail>("get_consultation", { localId });
}

export async function listPrescriptions(patientId?: string | null) {
  return invokeDesktop<PrescriptionSummary[]>("list_prescriptions", {
    patientId: patientId ?? null,
  });
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
