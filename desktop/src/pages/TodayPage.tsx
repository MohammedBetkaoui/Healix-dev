import { useMemo } from "react";
import { Calendar, FilePen, History, LayoutDashboard, LockKeyhole, RefreshCw, TriangleAlert } from "lucide-react";
import { AppointmentRow } from "../components/AppointmentRow";
import { ListState, MetricStrip, OfflineBanner, PageHeader, StatusBadge, initials } from "../dashboard-ui";
import { useLoad } from "../data";
import { addDays, formatTime, startOfDay } from "../dates";
import { listAppointments, listConsultations, listPrescriptions } from "../desktop-api";
import { fr } from "../i18n/fr";
import { relativeTime } from "../relative-time";
import { consultationDoneFor, consultationState, draftFor, prescriptionStatus } from "../statuses";
import type { LocalAppointment, LocalPatient, SyncStatus } from "../types";

export function TodayPage({ name, sync, version, recentPatients, onOpenPatient, onStartConsultation, onOpenConsultation, onOpenPrescription }: {
  name: string;
  sync: SyncStatus;
  // Bumped after a synchronization or a save: the lists reload.
  version: number;
  recentPatients: LocalPatient[];
  onOpenPatient: (patientId: string) => void;
  onStartConsultation: (appointment: LocalAppointment) => void;
  onOpenConsultation: (localId: string) => void;
  onOpenPrescription: (localId: string) => void;
}) {
  const offline = sync.state === "OFFLINE";
  const day = startOfDay(new Date());
  const dayKey = day.getTime();
  const appointments = useLoad(
    () => listAppointments(day.toISOString(), addDays(day, 1).toISOString()),
    [dayKey, version],
  );
  const consultations = useLoad(() => listConsultations(), [version]);
  const prescriptions = useLoad(() => listPrescriptions(), [version]);

  const today = useMemo(() => appointments.data ?? [], [appointments.data]);
  // The next appointment still to come (or in progress): the first not over.
  const nextId = useMemo(() => {
    const now = Date.now();
    return today.find(
      (item) =>
        (item.status === null || item.status === "SCHEDULED" || item.status === "CONFIRMED") &&
        new Date(item.scheduledAt).getTime() + (item.durationMinutes ?? 30) * 60_000 >= now,
    )?.id;
  }, [today]);
  const next = today.find((item) => item.id === nextId);

  const drafts = (consultations.data ?? []).filter((item) => item.state === "DRAFT");
  const unfinished = [
    ...drafts.map((item) => ({
      key: `c-${item.localId}`,
      title: item.patientName,
      detail: `Consultation · ${item.chiefComplaint || fr.common.notProvided}`,
      badge: consultationState(item.state),
      updated: item.date,
      open: () => onOpenConsultation(item.localId),
    })),
    ...(prescriptions.data ?? [])
      .filter((item) => prescriptionStatus(item).editable)
      .map((item) => ({
        key: `r-${item.localId}`,
        title: item.patientName,
        detail: `Ordonnance · ${item.medications || "Sans médicament"}`,
        badge: prescriptionStatus(item),
        updated: item.updatedAt,
        open: () => onOpenPrescription(item.localId),
      })),
  ].sort((a, b) => b.updated.localeCompare(a.updated));

  return (
    <div className="space-y-6">
      {offline ? <OfflineBanner>{fr.common.offlineBanner}</OfflineBanner> : null}
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={fr.header.context}
        title={fr.nav.items.today}
        description={`Bonjour ${name}. Voici votre journée et l’état de cet appareil.`}
      >
        <MetricStrip
          items={[
            {
              icon: Calendar,
              tone: today.length ? "accent" : "neutral",
              value: String(today.length),
              label: "Rendez-vous aujourd’hui",
              note: next ? `Prochain à ${formatTime(next.scheduledAt)}` : undefined,
            },
            { icon: RefreshCw, tone: sync.pendingCount ? "accent" : "success", value: String(sync.pendingCount), label: "Opérations en attente" },
            { icon: TriangleAlert, tone: sync.conflictCount ? "accent" : "success", value: String(sync.conflictCount), label: "Conflits" },
            { icon: History, tone: "neutral", value: relativeTime(sync.lastSyncedAt), label: "Dernière synchronisation", compact: true },
          ]}
        />
      </PageHeader>

      <section className="surface-section overflow-hidden" aria-labelledby="today-agenda">
        <header className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <h2 id="today-agenda" className="text-base font-semibold text-[var(--ink)]">Rendez-vous du jour</h2>
          <p className="mt-0.5 text-xs text-[var(--ink-faint)]">Triés par heure, d’après les rendez-vous synchronisés.</p>
        </header>
        <ListState
          loading={appointments.loading}
          error={appointments.error}
          empty={today.length === 0}
          emptyIcon={Calendar}
          emptyTitle="Aucun rendez-vous aujourd’hui"
          emptyText="Les rendez-vous synchronisés sur cet appareil apparaissent ici."
        >
          <ul className="divide-y divide-[var(--line)]">
            {today.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                done={consultationDoneFor(appointment, consultations.data ?? [])}
                draftId={draftFor(appointment, consultations.data ?? [])?.localId}
                highlighted={appointment.id === nextId}
                canStart
                onOpenPatient={onOpenPatient}
                onStart={onStartConsultation}
                onResume={onOpenConsultation}
              />
            ))}
          </ul>
        </ListState>
      </section>

      <section className="surface-section overflow-hidden" aria-labelledby="today-unfinished">
        <header className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <h2 id="today-unfinished" className="text-base font-semibold text-[var(--ink)]">À terminer</h2>
          <p className="mt-0.5 text-xs text-[var(--ink-faint)]">Brouillons de consultation et d’ordonnance à reprendre.</p>
        </header>
        <ListState
          loading={consultations.loading || prescriptions.loading}
          error={consultations.error ?? prescriptions.error}
          empty={unfinished.length === 0}
          emptyIcon={FilePen}
          emptyTitle="Rien à terminer"
          emptyText="Aucun brouillon en cours sur cet appareil."
        >
          <ul className="divide-y divide-[var(--line)]">
            {unfinished.map((item) => (
              <li key={item.key}>
                <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-start transition hover:bg-[var(--panel-soft)] sm:px-6" onClick={item.open}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">{item.title}</span>
                    <span className="block truncate text-xs text-[var(--ink-faint)]">{item.detail}</span>
                  </span>
                  <StatusBadge label={item.badge.label} tone={item.badge.tone} />
                  <span className="text-xs font-medium text-[var(--accent-dark)]">Reprendre</span>
                </button>
              </li>
            ))}
          </ul>
        </ListState>
      </section>

      <section className="surface-section overflow-hidden" aria-labelledby="recent-title">
        <header className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <h2 id="recent-title" className="text-base font-semibold text-[var(--ink)]">{fr.nav.sections.recent}</h2>
          <p className="mt-0.5 text-xs text-[var(--ink-faint)]">Les dossiers ouverts pendant cette session.</p>
        </header>
        {recentPatients.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {recentPatients.map((patient) => {
              const patientName = `${patient.firstName} ${patient.lastName}`;
              return (
                <li key={patient.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-start text-sm transition hover:bg-[var(--panel-soft)] sm:px-6" onClick={() => onOpenPatient(patient.id)}>
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-dark)]">{initials(patientName)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[var(--ink)]">{patientName}</span>
                      <span className="block truncate text-xs text-[var(--ink-faint)]">{patient.hospitalRecordNumber ?? "—"}</span>
                    </span>
                    {patient.locked ? <LockKeyhole size={14} aria-label={fr.nav.lockedRecord} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-[var(--ink-faint)]">Aucun dossier ouvert pour l’instant.</p>
        )}
      </section>
    </div>
  );
}
