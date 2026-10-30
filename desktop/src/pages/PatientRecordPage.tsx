import { Droplets, FileText, HeartPulse, History, LockKeyhole, Pill as PillIcon, Plus, ShieldCheck, Sparkles, Stethoscope, TriangleAlert, UserRound } from "lucide-react";
import { Button, MetricStrip, PageHeader, Pill, ageFromBirthDate, cn, formatBirthDate, formatDate, initials } from "../dashboard-ui";
import type { LocalPatient, LocalPrescription } from "../types";

type RecordTab = "SUMMARY" | "CONSULTATIONS" | "PRESCRIPTIONS";

const RECORD_TABS: Array<{ key: RecordTab; label: string }> = [
  { key: "SUMMARY", label: "Résumé" },
  { key: "CONSULTATIONS", label: "Consultations" },
  { key: "PRESCRIPTIONS", label: "Ordonnances" },
];

type PatientSummary = NonNullable<LocalPatient["medicalSummary"]>;

export function PatientRecordPage({
  patient,
  summary,
  tab,
  prescriptions,
  onTab,
  onNewConsultation,
  onNewPrescription,
  onEditPrescription,
}: {
  patient: LocalPatient;
  summary: PatientSummary;
  tab: RecordTab;
  prescriptions: LocalPrescription[];
  onTab: (tab: RecordTab) => void;
  onNewConsultation: () => void;
  onNewPrescription: () => void;
  onEditPrescription: (prescription: LocalPrescription) => void;
}) {
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const age = ageFromBirthDate(patient.birthDate);
  const synced = patient.lastSyncedAt ? new Date(patient.lastSyncedAt) : null;

  return (
    <section className="workspace-stack" aria-label={`Dossier de ${fullName}`}>
      <PageHeader
        icon={<span className="text-base font-semibold" aria-hidden="true">{initials(fullName)}</span>}
        eyebrow={<><ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />Dossier patient</>}
        title={fullName}
        description={
          patient.locked
            ? `Dossier verrouillé (${patient.lockReason ?? "hors périmètre"}) · lecture seule`
            : `Disponible hors ligne · Dernière synchronisation : ${formatDate(patient.lastSyncedAt)}`
        }
        actions={
          !patient.locked && tab === "CONSULTATIONS" ? (
            <Button onClick={onNewConsultation}><Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />Nouvelle consultation</Button>
          ) : !patient.locked && tab === "PRESCRIPTIONS" ? (
            <Button onClick={onNewPrescription}><Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />Nouveau brouillon</Button>
          ) : undefined
        }
      >
        <MetricStrip
          items={[
            { icon: FileText, tone: "neutral", value: patient.hospitalRecordNumber ?? "Non renseigné", label: "N° de dossier", compact: true },
            { icon: UserRound, tone: "neutral", value: age !== null ? `${age} ans` : "—", label: "Âge", note: formatBirthDate(patient.birthDate) },
            { icon: patient.locked ? LockKeyhole : ShieldCheck, tone: patient.locked ? "accent" : "success", value: patient.locked ? "Lecture seule" : "Modifiable", label: "Accès local", note: patient.locked ? undefined : "Consultations et ordonnances" },
            { icon: History, tone: "neutral", value: synced ? new Intl.DateTimeFormat("fr-DZ", { dateStyle: "short" }).format(synced) : "Jamais", label: "Dernière synchronisation", note: synced ? new Intl.DateTimeFormat("fr-DZ", { timeStyle: "short" }).format(synced) : undefined },
          ]}
        />
      </PageHeader>

      <div className="team-content">
        <nav className="team-tabs" aria-label="Dossier patient">
          <ul>
            {RECORD_TABS.map(({ key, label }) => (
              <li key={key}>
                <button type="button" className="team-tab" aria-current={tab === key ? "page" : undefined} onClick={() => onTab(key)}>
                  {label}
                  {key === "PRESCRIPTIONS" && prescriptions.length ? <span className="team-tab-count">{prescriptions.length}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {tab === "PRESCRIPTIONS" ? (
          <PrescriptionList prescriptions={prescriptions} locked={Boolean(patient.locked)} onEdit={onEditPrescription} />
        ) : tab === "CONSULTATIONS" ? (
          <div className="team-empty">
            <Stethoscope size={32} strokeWidth={1.5} aria-hidden="true" />
            <strong className="text-[var(--ink)]">Consultations hors ligne</strong>
            <span>Créez une nouvelle consultation depuis ce dossier.</span>
          </div>
        ) : (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ClinicalCard icon={Droplets} title="Groupe sanguin" values={[patient.bloodGroup ?? "Non renseigné"]} />
              <ClinicalCard icon={TriangleAlert} tone="warning" title="Allergies" values={summary.allergies} />
              <ClinicalCard icon={HeartPulse} title="Maladies chroniques" values={summary.chronicDiseases} />
              <ClinicalCard icon={PillIcon} title="Médicaments actuels" values={summary.currentMedications} />
              <ClinicalCard icon={History} title="Antécédents" values={summary.history} />
            </div>
            <aside className="surface-section ai-widget overflow-hidden">
              <div className="clinical-section-heading">
                <h2 className="flex items-center gap-2"><Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />Analyse IA</h2>
              </div>
              <p className="px-5 pb-5 text-xs leading-5 text-[var(--ink-soft)]">Analyse IA indisponible hors connexion</p>
            </aside>
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
  tone = "default",
}: {
  icon: typeof Droplets;
  title: string;
  values?: string[];
  tone?: "default" | "warning";
}) {
  return (
    <article className="surface-section p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
            tone === "warning" ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-[var(--medical-soft)] text-[var(--medical)]",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      </div>
      {values?.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {values.map((value) => (
            <li
              key={value}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.7rem] font-medium",
                tone === "warning"
                  ? "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]"
                  : "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]",
              )}
            >
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

export function PrescriptionList({
  prescriptions,
  locked,
  onEdit,
}: {
  prescriptions: LocalPrescription[];
  locked: boolean;
  onEdit: (prescription: LocalPrescription) => void;
}) {
  if (!prescriptions.length) {
    return (
      <div className="team-empty">
        <FileText size={32} strokeWidth={1.5} aria-hidden="true" />
        <strong className="text-[var(--ink)]">Aucune ordonnance locale</strong>
        <span>Créez un brouillon pour préparer une ordonnance hors ligne.</span>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--line)]">
      {prescriptions.map((prescription) => {
        const editable =
          !locked &&
          prescription.localStatus !== "CONFLICT" &&
          prescription.localStatus !== "READ_ONLY" &&
          (!prescription.serverStatus || prescription.serverStatus === "DRAFT");
        const status: { label: string; tone: "success" | "warning" | "danger" | "accent" | "neutral" } =
          prescription.localStatus === "CONFLICT"
            ? { label: "Conflit — attention requise", tone: "danger" }
            : prescription.serverStatus === "VALIDATED"
              ? { label: `Validée ${prescription.number ?? ""} · lecture seule`, tone: "success" }
              : prescription.serverStatus === "CANCELED"
                ? { label: "Annulée · lecture seule", tone: "neutral" }
                : prescription.localStatus === "PENDING_SYNC"
                  ? { label: "En attente de synchronisation", tone: "accent" }
                  : prescription.serverStatus === "DRAFT"
                    ? { label: "Brouillon synchronisé", tone: "accent" }
                    : { label: "Brouillon local", tone: "warning" };
        return (
          <li key={prescription.localId} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
              <FileText className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">{prescription.number ?? "Ordonnance sans numéro"}</p>
              <div className="mt-1.5"><Pill tone={status.tone}>{status.label}</Pill></div>
              <p className="mt-1.5 text-xs text-[var(--ink-faint)]">
                {prescription.items.map((item) => item.dci).join(" · ") || "Sans médicament"}
              </p>
            </div>
            {editable && (
              <Button variant="outline" size="sm" onClick={() => onEdit(prescription)}>
                Modifier
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
