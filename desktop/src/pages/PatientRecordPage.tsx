import { useMemo, useState } from "react";
import {
  Droplets, ExternalLink, FileText, HeartPulse, History, LockKeyhole, Pill as PillIcon, Plus, ShieldCheck,
  Sparkles, Stethoscope, TriangleAlert, UserRound,
} from "lucide-react";
import {
  Button, ListState, MetricStrip, PageHeader, StatusBadge, ageFromBirthDate, cn, formatBirthDate, formatDate, initials,
} from "../dashboard-ui";
import { useLoad } from "../data";
import { formatDateOnly } from "../dates";
import { listConsultations, listPrescriptions } from "../desktop-api";
import { fr } from "../i18n/fr";
import { consultationState, prescriptionStatus } from "../statuses";
import type { LocalPatient } from "../types";
import { WEB_APP_URL } from "../web-app";

type RecordTab = "SUMMARY" | "CONSULTATIONS" | "PRESCRIPTIONS";

const RECORD_TABS: Array<{ key: RecordTab; label: string }> = [
  { key: "SUMMARY", label: "Résumé" },
  { key: "CONSULTATIONS", label: "Consultations" },
  { key: "PRESCRIPTIONS", label: "Ordonnances" },
];

const GENDERS: Record<string, string> = { MALE: "Homme", FEMALE: "Femme" };

// The allergies of the record, always visible under the header: red badges, or
// the explicit "Aucune allergie connue".
export function AllergyBand({ allergies }: { allergies?: string[] }) {
  const list = (allergies ?? []).filter((item) => item.trim());
  return (
    <section
      aria-label="Allergies"
      data-allergies=""
      className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-5 py-3 lg:px-7"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-soft)]">
        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
        Allergies
      </span>
      {list.length ? (
        <ul className="flex flex-wrap gap-2">
          {list.map((allergy) => (
            <li key={allergy} className="rounded-full border border-[var(--danger-line)] bg-[var(--danger-soft)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--danger-ink)]">
              {allergy}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-[var(--ink-faint)]">Aucune allergie connue</span>
      )}
    </section>
  );
}

export function PatientRecordPage({
  patient,
  version,
  offline,
  onNewConsultation,
  onNewPrescription,
  onOpenConsultation,
  onOpenPrescription,
  onOpenHealixAi,
}: {
  patient: LocalPatient;
  // Bumped after a synchronization or a save: the lists reload.
  version: number;
  offline: boolean;
  onNewConsultation: () => void;
  onNewPrescription: () => void;
  onOpenConsultation: (localId: string) => void;
  onOpenPrescription: (localId: string) => void;
  onOpenHealixAi: () => void;
}) {
  const [tab, setTab] = useState<RecordTab>("SUMMARY");
  const summary = useMemo(() => patient.medicalSummary ?? {}, [patient.medicalSummary]);
  const consultations = useLoad(() => listConsultations(patient.id), [patient.id, version]);
  const prescriptions = useLoad(() => listPrescriptions(patient.id), [patient.id, version]);
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const arabicName = `${patient.firstNameAr ?? ""} ${patient.lastNameAr ?? ""}`.trim();
  const age = ageFromBirthDate(patient.birthDate);
  const consultationCount = consultations.data?.length ?? 0;
  const prescriptionCount = prescriptions.data?.length ?? 0;

  return (
    <section className="workspace-stack" aria-label={`Dossier de ${fullName}`}>
      <PageHeader
        icon={<span className="text-base font-semibold" aria-hidden="true">{initials(fullName)}</span>}
        eyebrow={<><ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />Dossier patient</>}
        title={fullName}
        description={
          <>
            {arabicName ? <span className="mb-1 block text-left text-base text-[var(--ink)]" dir="rtl" lang="ar">{arabicName}</span> : null}
            {patient.locked
              ? `Dossier verrouillé (${patient.lockReason ?? "hors périmètre"}) · lecture seule`
              : `Disponible hors ligne · Dernière synchronisation : ${formatDate(patient.lastSyncedAt)}`}
          </>
        }
        actions={
          !patient.locked && tab === "CONSULTATIONS" ? (
            <Button onClick={onNewConsultation}><Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />Nouvelle consultation</Button>
          ) : !patient.locked && tab === "PRESCRIPTIONS" ? (
            <Button onClick={onNewPrescription}><Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />Nouveau brouillon</Button>
          ) : undefined
        }
      >
        <AllergyBand allergies={summary.allergies} />
        <MetricStrip
          items={[
            { icon: FileText, tone: "neutral", value: patient.hospitalRecordNumber ?? fr.common.notProvided, label: "N° de dossier", compact: true },
            { icon: UserRound, tone: "neutral", value: age !== null ? `${age} ans` : "—", label: "Âge", note: formatBirthDate(patient.birthDate) },
            { icon: UserRound, tone: "neutral", value: (patient.gender && GENDERS[patient.gender]) || fr.common.notProvided, label: "Sexe", compact: true },
            { icon: Droplets, tone: "neutral", value: patient.bloodGroup ?? fr.common.notProvided, label: "Groupe sanguin", compact: true },
          ]}
        />
      </PageHeader>

      <div className="team-content">
        <nav className="team-tabs" aria-label="Dossier patient">
          <ul>
            {RECORD_TABS.map(({ key, label }) => (
              <li key={key}>
                <button type="button" className="team-tab" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>
                  {label}
                  {key === "CONSULTATIONS" && consultationCount ? <span className="team-tab-count">{consultationCount}</span> : null}
                  {key === "PRESCRIPTIONS" && prescriptionCount ? <span className="team-tab-count">{prescriptionCount}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {tab === "PRESCRIPTIONS" ? (
          <ListState
            loading={prescriptions.loading}
            error={prescriptions.error}
            empty={prescriptionCount === 0}
            emptyIcon={FileText}
            emptyTitle="Aucune ordonnance locale"
            emptyText="Créez un brouillon pour préparer une ordonnance hors ligne."
          >
            <ul className="divide-y divide-[var(--line)]">
              {(prescriptions.data ?? []).map((prescription) => {
                const status = prescriptionStatus(prescription);
                return (
                  <li key={prescription.localId}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-start transition hover:bg-[var(--panel-soft)] sm:px-6"
                      onClick={() => onOpenPrescription(prescription.localId)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
                        <FileText className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--ink)]">{prescription.number ?? "Ordonnance sans numéro"}</span>
                        <span className="mt-1 block text-xs text-[var(--ink-faint)]">{prescription.medications || "Sans médicament"}</span>
                      </span>
                      <StatusBadge label={status.label} tone={status.tone} />
                      <span className="text-xs font-medium text-[var(--accent-dark)]">{status.editable ? "Modifier" : "Voir"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ListState>
        ) : tab === "CONSULTATIONS" ? (
          <ListState
            loading={consultations.loading}
            error={consultations.error}
            empty={consultationCount === 0}
            emptyIcon={Stethoscope}
            emptyTitle="Aucune consultation sur cet appareil"
            emptyText="Créez une nouvelle consultation depuis ce dossier."
          >
            <ul className="divide-y divide-[var(--line)]">
              {(consultations.data ?? []).map((consultation) => {
                const state = consultationState(consultation.state);
                return (
                  <li key={consultation.localId}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-start transition hover:bg-[var(--panel-soft)] sm:px-6"
                      onClick={() => onOpenConsultation(consultation.localId)}
                    >
                      <span className="clinical-figure w-24 shrink-0 text-xs text-[var(--ink-soft)]">{formatDateOnly(consultation.date)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--ink)]">{consultation.chiefComplaint || fr.common.notProvided}</span>
                        <span className="block truncate text-xs text-[var(--ink-faint)]">{consultation.firstDiagnosis || "Sans diagnostic"}</span>
                      </span>
                      <StatusBadge label={state.label} tone={state.tone} />
                      <span className="text-xs font-medium text-[var(--accent-dark)]">{consultation.editable ? "Reprendre" : "Voir"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ListState>
        ) : (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ClinicalCard icon={Droplets} title="Groupe sanguin" values={[patient.bloodGroup ?? fr.common.notProvided]} />
              <ClinicalCard icon={HeartPulse} title="Maladies chroniques" values={summary.chronicDiseases} />
              <ClinicalCard icon={PillIcon} title="Médicaments actuels" values={summary.currentMedications} />
              <ClinicalCard icon={History} title="Antécédents" values={summary.history} />
            </div>
            <aside className="surface-section ai-widget overflow-hidden" aria-label="Analyses IA sur HealixDz Web">
              <div className="clinical-section-heading">
                <h2 className="flex items-center gap-2"><Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />Analyses IA sur HealixDz Web</h2>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
                <p className="min-w-0 max-w-xl text-xs leading-5 text-[var(--ink-soft)]">
                  Les analyses d’imagerie par IA se consultent sur la plateforme web, avec une connexion Internet.
                </p>
                {WEB_APP_URL ? (
                  <Button variant="outline" size="sm" disabled={offline} title={offline ? fr.common.webOffline : undefined} onClick={onOpenHealixAi}>
                    <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    Ouvrir le dossier sur HealixDz Web
                  </Button>
                ) : null}
              </div>
            </aside>
            {patient.locked ? (
              <p className="flex items-center gap-2 text-xs text-[var(--ink-faint)]"><LockKeyhole size={13} aria-hidden="true" />Dossier en lecture seule.</p>
            ) : null}
            <p className="text-xs text-[var(--ink-faint)]">
              Dernière mise à jour serveur : {formatDate(patient.serverUpdatedAt)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export function ClinicalCard({
  icon: Icon,
  title,
  values,
}: {
  icon: typeof Droplets;
  title: string;
  values?: string[];
}) {
  return (
    <article className="surface-section p-5">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]")}>
          <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      </div>
      {values?.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {values.map((value) => (
            <li key={value} className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--accent-dark)]">
              {value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-[var(--ink-faint)]">Aucune information synchronisée</p>
      )}
    </article>
  );
}
