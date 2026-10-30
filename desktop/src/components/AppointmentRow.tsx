import { Play } from "lucide-react";
import { Button, StatusBadge, cn } from "../dashboard-ui";
import { formatTime } from "../dates";
import { fr } from "../i18n/fr";
import { appointmentStatus, canStartConsultation } from "../statuses";
import type { LocalAppointment } from "../types";

// One appointment of the agenda: time, patient, reason, duration and status,
// with the same badges and edge colours as the Web agenda. The row opens the
// patient's record; "Démarrer la consultation" opens the editor with the
// patient and the reason already filled in.
export function AppointmentRow({ appointment, done, highlighted, canStart, onOpenPatient, onStart }: {
  appointment: LocalAppointment;
  // A consultation of this patient already exists that day.
  done: boolean;
  // The next appointment of the day.
  highlighted?: boolean;
  // Only appointments of the current day can be started.
  canStart: boolean;
  onOpenPatient: (patientId: string) => void;
  onStart: (appointment: LocalAppointment) => void;
}) {
  const status = appointmentStatus(appointment);
  const startable = canStart && canStartConsultation(appointment) && !done;
  return (
    <li
      data-highlighted={highlighted ? "" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-s-[3px] px-5 py-3.5 sm:px-6",
        highlighted && "bg-[var(--accent-soft)]",
      )}
      style={{ borderInlineStartColor: status.rail }}
    >
      <span className="clinical-figure w-14 shrink-0 text-sm font-semibold text-[var(--ink)]">
        {formatTime(appointment.scheduledAt)}
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 text-start"
        onClick={() => onOpenPatient(appointment.patientId)}
        aria-label={`Ouvrir le dossier de ${appointment.patientName}`}
      >
        <span className="block truncate text-sm font-semibold text-[var(--ink)]">{appointment.patientName}</span>
        <span className="block truncate text-xs text-[var(--ink-faint)]">
          {appointment.reason || fr.appointment.noReason}
          {appointment.durationMinutes ? ` · ${fr.appointment.minutes(appointment.durationMinutes)}` : ""}
        </span>
      </button>
      {highlighted ? <StatusBadge label={fr.appointment.next} tone="info" /> : null}
      <StatusBadge label={status.label} tone={status.tone} />
      {done ? (
        <span className="text-xs font-medium text-[var(--success-ink)]">{fr.appointment.done}</span>
      ) : startable ? (
        <Button size="sm" onClick={() => onStart(appointment)}>
          <Play className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          {fr.appointment.start}
        </Button>
      ) : null}
    </li>
  );
}
