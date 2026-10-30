import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { AppointmentRow } from "../components/AppointmentRow";
import { Button, ListState, OfflineBanner, PageHeader, StatusBadge, cn } from "../dashboard-ui";
import { useLoad } from "../data";
import { addDays, formatLongDay, formatShortDay, formatTime, formatWeekRange, isSameDay, startOfDay, startOfWeek } from "../dates";
import { listAppointments, listConsultations } from "../desktop-api";
import { fr } from "../i18n/fr";
import { appointmentStatus, consultationDoneFor } from "../statuses";
import type { LocalAppointment, SyncStatus } from "../types";
import { WEB_APP_URL, openWebPath } from "../web-app";

type View = "day" | "week";

export function AppointmentsPage({ sync, version, onOpenPatient, onStartConsultation }: {
  sync: SyncStatus;
  version: number;
  onOpenPatient: (patientId: string) => void;
  onStartConsultation: (appointment: LocalAppointment) => void;
}) {
  const offline = sync.state === "OFFLINE";
  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const start = view === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const end = addDays(start, view === "week" ? 7 : 1);
  const appointments = useLoad(
    () => listAppointments(start.toISOString(), end.toISOString()),
    [start.getTime(), end.getTime(), version],
  );
  const consultations = useLoad(() => listConsultations(), [version]);
  const list = useMemo(() => appointments.data ?? [], [appointments.data]);
  const today = startOfDay(new Date());
  const step = view === "week" ? 7 : 1;
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const title = view === "week" ? formatWeekRange(start) : formatLongDay(start);

  const done = (appointment: LocalAppointment) => consultationDoneFor(appointment, consultations.data ?? []);
  const onDay = (day: Date) => list.filter((item) => isSameDay(new Date(item.scheduledAt), day));
  const canStartOn = (day: Date) => isSameDay(day, today);

  return (
    <div className="space-y-6">
      {offline ? <OfflineBanner>{fr.common.offlineBanner}</OfflineBanner> : null}
      <PageHeader
        icon={<Calendar className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={fr.nav.sections.clinical}
        title={fr.nav.items.appointments}
        description="Votre agenda, d’après les rendez-vous synchronisés sur cet appareil."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-label="Navigation dans l’agenda">
          <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, -step))} aria-label={view === "week" ? "Semaine précédente" : "Jour précédent"}>
            <ChevronLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />Précédent
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>Aujourd’hui</Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, step))} aria-label={view === "week" ? "Semaine suivante" : "Jour suivant"}>
            Suivant<ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </Button>
        </div>
        <h2 className="min-w-0 flex-1 text-center text-base font-semibold text-[var(--ink)]" aria-live="polite">{title}</h2>
        <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] p-1" role="group" aria-label="Affichage">
          {(["day", "week"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              className={cn(
                "h-8 rounded-[var(--radius-xs)] px-3 text-xs font-medium transition",
                view === option ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]" : "text-[var(--ink-soft)] hover:bg-[var(--panel-soft)]",
              )}
              onClick={() => setView(option)}
            >
              {option === "day" ? "Jour" : "Semaine"}
            </button>
          ))}
        </div>
      </div>

      <section className="surface-section overflow-hidden" aria-label={title}>
        <ListState
          loading={appointments.loading}
          error={appointments.error}
          empty={list.length === 0}
          emptyIcon={Calendar}
          emptyTitle={view === "week" ? "Aucun rendez-vous cette semaine" : "Aucun rendez-vous ce jour"}
          emptyText="Les rendez-vous synchronisés sur cet appareil apparaissent ici."
        >
          {view === "day" ? (
            <ul className="divide-y divide-[var(--line)]">
              {list.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  done={done(appointment)}
                  canStart={canStartOn(start)}
                  onOpenPatient={onOpenPatient}
                  onStart={onStartConsultation}
                />
              ))}
            </ul>
          ) : (
            <>
              {/* Wide window: the seven days side by side. */}
              <div className="hidden grid-cols-7 divide-x divide-[var(--line)] lg:grid" data-week-grid="">
                {days.map((day) => (
                  <div key={day.getTime()} className="min-w-0">
                    <h3 className={cn(
                      "border-b border-[var(--line)] px-2 py-2.5 text-center text-xs font-semibold",
                      isSameDay(day, today) ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]" : "bg-[var(--panel-soft)] text-[var(--ink-soft)]",
                    )}>
                      {formatShortDay(day)}
                    </h3>
                    <ul className="min-h-40 space-y-1.5 p-1.5">
                      {onDay(day).map((appointment) => {
                        const status = appointmentStatus(appointment);
                        return (
                          <li key={appointment.id}>
                            <button
                              type="button"
                              className="w-full rounded-[var(--radius-sm)] border border-s-[3px] border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-start transition hover:bg-[var(--panel-soft)]"
                              style={{ borderInlineStartColor: status.rail }}
                              onClick={() => onOpenPatient(appointment.patientId)}
                              aria-label={`${formatTime(appointment.scheduledAt)} ${appointment.patientName}, ${status.label}`}
                            >
                              <span className="clinical-figure block text-[0.68rem] font-semibold text-[var(--ink)]">{formatTime(appointment.scheduledAt)}</span>
                              <span className="block truncate text-xs text-[var(--ink)]">{appointment.patientName}</span>
                              <span className="block truncate text-[0.65rem] text-[var(--ink-faint)]">{appointment.reason || fr.appointment.noReason}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              {/* Narrow window: a list grouped by day. */}
              <div className="divide-y divide-[var(--line)] lg:hidden" data-week-list="">
                {days.map((day) => {
                  const items = onDay(day);
                  if (!items.length) return null;
                  return (
                    <section key={day.getTime()} aria-label={formatLongDay(day)}>
                      <h3 className="flex items-center gap-2 bg-[var(--panel-soft)] px-5 py-2 text-xs font-semibold text-[var(--ink-soft)] sm:px-6">
                        {formatLongDay(day)}
                        {isSameDay(day, today) ? <StatusBadge label={fr.nav.items.today} tone="info" /> : null}
                      </h3>
                      <ul className="divide-y divide-[var(--line)]">
                        {items.map((appointment) => (
                          <AppointmentRow
                            key={appointment.id}
                            appointment={appointment}
                            done={done(appointment)}
                            canStart={canStartOn(day)}
                            onOpenPatient={onOpenPatient}
                            onStart={onStartConsultation}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </ListState>
      </section>

      <aside className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3">
        <p className="min-w-0 text-xs leading-5 text-[var(--ink-soft)]">Les rendez-vous se créent et se modifient sur HealixDz Web.</p>
        {WEB_APP_URL ? (
          <Button
            variant="outline"
            size="sm"
            disabled={offline}
            title={offline ? fr.common.webOffline : undefined}
            onClick={() => void openWebPath("/doctor/appointments").catch(() => undefined)}
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Ouvrir l’agenda sur HealixDz Web
          </Button>
        ) : null}
      </aside>
    </div>
  );
}
