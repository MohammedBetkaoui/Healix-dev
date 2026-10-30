import type { KeyboardEvent } from "react";
import { Activity, FileText, LockKeyhole, ShieldCheck, Users, UsersRound } from "lucide-react";
import {
  Button, MetricStrip, Notice, PageHeader, Pill, ageFromBirthDate, formatBirthDate, formatDate, initials,
} from "./dashboard-ui";
import type { LocalPatient } from "./types";

type Props = {
  patients: LocalPatient[];
  query: string;
  onSelect: (patient: LocalPatient) => void;
};

function access(patient: LocalPatient) {
  return patient.locked
    ? { tone: "neutral" as const, label: "Lecture seule" }
    : { tone: "success" as const, label: "Disponible" };
}

function openFromKeyboard(event: KeyboardEvent, open: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    open();
  }
}

function PatientAvatar({ patient, size }: { patient: LocalPatient; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-dark)] transition group-hover:border-[var(--accent)] ${size === "md" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs"}`}
    >
      {initials(`${patient.firstName} ${patient.lastName}`)}
    </span>
  );
}

// The Desktop counterpart of the Web patient registry
// (components/patients/PatientRegistryPage.tsx).
export function PatientDirectory({ patients, query, onSelect }: Props) {
  const lockedCount = patients.filter((patient) => patient.locked).length;
  const editableCount = patients.length - lockedCount;
  const format = (value: number) => value.toLocaleString("fr-DZ");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<UsersRound className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow="Disponible hors ligne"
        title="Dossiers patients"
        description="Retrouvez les dossiers synchronisés sur cet appareil pour poursuivre votre activité."
      >
        <MetricStrip
          items={[
            { icon: UsersRound, tone: "neutral", value: format(patients.length), label: "Patients synchronisés", note: query ? "Résultats de la recherche" : "Sur cet appareil" },
            { icon: Activity, tone: "success", value: format(editableCount), label: "Modifiables hors ligne", note: "Consultations et ordonnances" },
            { icon: LockKeyhole, tone: "accent", value: format(lockedCount), label: "Lecture seule", note: "Hors du périmètre autorisé" },
          ]}
        />
      </PageHeader>

      <section className="surface-section overflow-hidden" aria-label="Patients synchronisés">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
              <UsersRound className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">Patients synchronisés</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-faint)]">Sélectionnez un dossier pour consulter son résumé ou préparer un brouillon.</p>
            </div>
          </div>
          <span className="clinical-figure rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-[0.68rem] font-medium text-[var(--ink-soft)]">
            {patients.length} résultat{patients.length > 1 ? "s" : ""}
          </span>
        </header>

        {patients.length === 0 ? (
          <div className="team-empty">
            <Users size={32} strokeWidth={1.5} aria-hidden="true" />
            <strong className="text-[var(--ink)]">{query ? "Aucun patient trouvé" : "Aucun dossier synchronisé"}</strong>
            <span>{query ? "Essayez avec un autre nom ou numéro de dossier." : "Les dossiers de votre périmètre apparaîtront ici après synchronisation."}</span>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[var(--line)] lg:hidden">
              {patients.map((patient) => {
                const status = access(patient);
                const age = ageFromBirthDate(patient.birthDate);
                return (
                  <article
                    key={patient.id}
                    className="group cursor-pointer p-5 transition hover:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                    role="link"
                    tabIndex={0}
                    onClick={() => onSelect(patient)}
                    onKeyDown={(event) => openFromKeyboard(event, () => onSelect(patient))}
                  >
                    <div className="flex items-start gap-3">
                      <PatientAvatar patient={patient} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{patient.firstName} {patient.lastName}</p>
                        <p className="clinical-figure mt-1 text-[0.66rem] text-[var(--ink-faint)]" dir="ltr">{patient.hospitalRecordNumber ?? "Sans numéro de dossier"}</p>
                      </div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-[var(--radius-sm)] bg-[var(--panel-soft)] p-3"><span className="block text-[0.68rem] font-medium text-[var(--ink-faint)]">Naissance</span><span className="mt-1 block text-[var(--ink-soft)]">{age !== null ? `${age} ans · ` : ""}{formatBirthDate(patient.birthDate)}</span></div>
                      <div className="rounded-[var(--radius-sm)] bg-[var(--panel-soft)] p-3"><span className="block text-[0.68rem] font-medium text-[var(--ink-faint)]">Groupe sanguin</span><span className="mt-1 block text-[var(--ink-soft)]">{patient.bloodGroup ?? "Non renseigné"}</span></div>
                      <div className="rounded-[var(--radius-sm)] bg-[var(--panel-soft)] p-3"><span className="block text-[0.68rem] font-medium text-[var(--ink-faint)]">Dernière synchronisation</span><span className="mt-1 block text-[var(--ink-soft)]">{formatDate(patient.lastSyncedAt)}</span></div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[820px] text-[0.78rem]">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-[0.7rem] text-[var(--ink-soft)]">
                    <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Patient</th>
                    <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">N° de dossier</th>
                    <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Âge · naissance</th>
                    <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Groupe sanguin</th>
                    <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Dernière synchronisation</th>
                    <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Accès local</th>
                    <th className="px-4 py-3.5 text-end font-semibold"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => {
                    const status = access(patient);
                    const age = ageFromBirthDate(patient.birthDate);
                    return (
                      <tr
                        key={patient.id}
                        className="group cursor-pointer border-b border-[var(--line-soft)] align-middle transition last:border-0 hover:bg-[var(--panel-soft)] focus-visible:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                        tabIndex={0}
                        onClick={() => onSelect(patient)}
                        onKeyDown={(event) => openFromKeyboard(event, () => onSelect(patient))}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <PatientAvatar patient={patient} size="sm" />
                            <div>
                              <p className="whitespace-nowrap font-semibold text-[var(--ink)]">{patient.firstName} {patient.lastName}</p>
                              {patient.firstNameAr || patient.lastNameAr ? (
                                <p className="mt-0.5 whitespace-nowrap text-[0.68rem] text-[var(--ink-faint)]" lang="ar">{patient.firstNameAr} {patient.lastNameAr}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="clinical-figure whitespace-nowrap px-4 py-3.5 text-[0.66rem] text-[var(--ink-soft)]" dir="ltr">{patient.hospitalRecordNumber ?? "Non renseigné"}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]">
                          <span className="font-medium text-[var(--ink)]">{age !== null ? `${age} ans` : "—"}</span>
                          <span className="mt-0.5 block text-[0.68rem] text-[var(--ink-faint)]">{formatBirthDate(patient.birthDate)}</span>
                        </td>
                        <td className="px-4 py-4 text-[var(--ink-soft)]">{patient.bloodGroup ?? "Non renseigné"}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]">{formatDate(patient.lastSyncedAt)}</td>
                        <td className="px-4 py-4">
                          <Pill tone={status.tone}>{status.label}</Pill>
                        </td>
                        <td className="px-4 py-4 text-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => { event.stopPropagation(); onSelect(patient); }}
                            aria-label={`Ouvrir le dossier de ${patient.firstName} ${patient.lastName}`}
                          >
                            <FileText className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />Ouvrir
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Notice icon={<ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--medical)]" strokeWidth={1.7} aria-hidden="true" />}>
        Données chiffrées sur cet appareil et limitées à votre périmètre autorisé.
      </Notice>
    </div>
  );
}
