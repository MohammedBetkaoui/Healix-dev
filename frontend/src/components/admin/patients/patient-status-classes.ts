import { type Patient } from "@/types/patient";

// Shared by AdminPatientsPage (table rows) and AdminPatientDetailModal
// (header badge), so the modal never imports from the page that renders it.
export function getPatientStatusClasses(status: Patient["status"]) {
  if (status === "URGENT") {
    return "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]";
  }

  if (status === "FOLLOW_UP") {
    return "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]";
  }

  if (status === "NEW") {
    return "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]";
  }

  return "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]";
}
