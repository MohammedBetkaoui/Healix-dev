import { History, LayoutDashboard, LockKeyhole, RefreshCw, TriangleAlert, Users } from "lucide-react";
import { MetricStrip, PageHeader, initials } from "../dashboard-ui";
import { fr } from "../i18n/fr";
import { relativeTime } from "../relative-time";
import type { LocalPatient, SyncStatus } from "../types";

export function TodayPage({ name, patientCount, sync, recentPatients, onOpenPatient }: {
  name: string;
  patientCount: number;
  sync: SyncStatus;
  recentPatients: LocalPatient[];
  onOpenPatient: (patient: LocalPatient) => void;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={fr.header.context}
        title={fr.nav.items.today}
        description={`Bonjour ${name}. Voici l’état de votre espace de travail sur cet appareil.`}
      >
        <MetricStrip
          items={[
            { icon: Users, tone: "neutral", value: String(patientCount), label: "Patients sur l’appareil" },
            { icon: RefreshCw, tone: sync.pendingCount ? "accent" : "success", value: String(sync.pendingCount), label: "Opérations en attente" },
            { icon: TriangleAlert, tone: sync.conflictCount ? "accent" : "success", value: String(sync.conflictCount), label: "Conflits" },
            { icon: History, tone: "neutral", value: relativeTime(sync.lastSyncedAt), label: "Dernière synchronisation", compact: true },
          ]}
        />
      </PageHeader>

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
                  <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-start text-sm transition hover:bg-[var(--panel-soft)] sm:px-6" onClick={() => onOpenPatient(patient)}>
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
