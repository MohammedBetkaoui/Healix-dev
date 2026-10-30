import { fr } from "./i18n/fr";
import type {
  AppointmentStatus, ConsultationState, ConsultationSummary, LocalAppointment, LocalPrescription,
  PrescriptionSummary,
} from "./types";
import { isSameDay } from "./dates";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

// Same tones as the Web agenda (AppointmentsAgendaPage): confirmed = info,
// completed = success, no-show = danger; `rail` is the colour at the row's edge.
const appointmentPresentation: Record<AppointmentStatus, { tone: Tone; rail: string }> = {
  CANCELED: { tone: "neutral", rail: "var(--line)" },
  COMPLETED: { tone: "success", rail: "var(--success)" },
  CONFIRMED: { tone: "info", rail: "var(--accent)" },
  NO_SHOW: { tone: "danger", rail: "var(--danger)" },
  SCHEDULED: { tone: "neutral", rail: "var(--border-strong)" },
};

export function appointmentStatus(appointment: LocalAppointment) {
  const status = appointment.status ?? "SCHEDULED";
  const presentation = appointmentPresentation[status] ?? appointmentPresentation.SCHEDULED;
  return { label: fr.appointment.statuses[status] ?? fr.appointment.statuses.SCHEDULED, ...presentation };
}

// An appointment still waiting for its consultation.
export const canStartConsultation = (appointment: LocalAppointment) =>
  !appointment.patientLocked &&
  (appointment.status === null || appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED");

// The consultation of an appointment: one of the same patient on the same day
// (the sync protocol does not link a local draft to an appointment). A saved
// consultation wins over a draft.
export function consultationFor(appointment: LocalAppointment, consultations: ConsultationSummary[]) {
  const day = new Date(appointment.scheduledAt);
  const sameDay = consultations.filter(
    (consultation) =>
      consultation.patientId === appointment.patientId && isSameDay(new Date(consultation.date), day),
  );
  return sameDay.find((consultation) => consultation.state !== "DRAFT") ?? sameDay[0];
}

// "Consultation faite": the consultation is past the draft stage. A draft is
// not done: the doctor is offered to resume it instead.
export const consultationDoneFor = (appointment: LocalAppointment, consultations: ConsultationSummary[]) => {
  const found = consultationFor(appointment, consultations);
  return found !== undefined && found.state !== "DRAFT";
};

export const draftFor = (appointment: LocalAppointment, consultations: ConsultationSummary[]) => {
  const found = consultationFor(appointment, consultations);
  return found?.state === "DRAFT" ? found : undefined;
};

const consultationTones: Record<ConsultationState, Tone> = {
  DRAFT: "warning",
  PENDING_SYNC: "info",
  SYNCED: "success",
  CONFLICT: "danger",
};

export const consultationState = (state: ConsultationState) => ({
  label: fr.consultation.states[state],
  tone: consultationTones[state],
});

type PrescriptionLike = Pick<
  PrescriptionSummary | LocalPrescription,
  "serverStatus" | "localStatus"
> & { patientLocked?: boolean };

// The written status of a prescription and whether the doctor may still edit it.
export function prescriptionStatus(prescription: PrescriptionLike): {
  label: string;
  tone: Tone;
  editable: boolean;
} {
  const labels = fr.prescription.statuses;
  const base =
    prescription.localStatus === "CONFLICT"
      ? { label: labels.conflict, tone: "danger" as const }
      : prescription.serverStatus === "VALIDATED"
        ? { label: labels.validated, tone: "success" as const }
        : prescription.serverStatus === "CANCELED"
          ? { label: labels.canceled, tone: "neutral" as const }
          : prescription.localStatus === "PENDING_SYNC"
            ? { label: labels.pendingSync, tone: "info" as const }
            : prescription.serverStatus === "DRAFT"
              ? { label: labels.syncedDraft, tone: "info" as const }
              : { label: labels.localDraft, tone: "warning" as const };
  const editable =
    !prescription.patientLocked &&
    prescription.localStatus !== "CONFLICT" &&
    prescription.localStatus !== "READ_ONLY" &&
    (!prescription.serverStatus || prescription.serverStatus === "DRAFT");
  return { ...base, editable };
}
