import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Droplets, FileText, HeartPulse, History, LockKeyhole, Pill as PillIcon, Plus, ShieldCheck,
  Sparkles, Stethoscope, TriangleAlert, UserRound,
} from "lucide-react";
import { DashboardShell } from "./DashboardShell";
import { PatientDirectory } from "./PatientDirectory";
import {
  Button, Field, MetricStrip, Notice, PageHeader, Pill, ageFromBirthDate, cn, formatBirthDate,
  formatDate, initials, inputClass, textareaClass,
} from "./dashboard-ui";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type Update,
} from "@tauri-apps/plugin-updater";
import {
  getSyncStatus,
  listPatientPrescriptions,
  listLocalPatients,
  loginAndBootstrap,
  logoutLocal,
  saveConsultationDraft,
  savePrescriptionDraft,
  searchLocalMedications,
  sessionStatus,
  syncNow,
} from "./desktop-api";
import type {
  ConsultationDraftInput,
  LocalMedication,
  LocalPatient,
  LocalPrescription,
  PrescriptionDraftInput,
  PrescriptionItemInput,
  SessionStatus,
  SyncStatus,
} from "./types";

const emptyDraft = (patientId: string): ConsultationDraftInput => ({
  patientId,
  localStatus: "LOCAL_DRAFT",
  chiefComplaint: "",
  historyPresentIllness: "",
  clinicalExamination: "",
  assessment: "",
  carePlan: "",
  followUpPlan: "",
});

const emptyPrescriptionItem = (): PrescriptionItemInput => ({
  dci: "",
  brandName: null,
  strength: "",
  pharmaceuticalForm: "",
  route: "",
  manufacturer: null,
  regulatoryCategory: "STANDARD",
  dosePerIntake: "",
  frequency: "",
  intakeMoment: null,
  durationDays: null,
  quantity: "",
  patientInstructions: null,
  indication: null,
  asNeeded: false,
  renewalAllowed: false,
  substitutionAllowed: false,
});

const emptyPrescriptionDraft = (patientId: string): PrescriptionDraftInput => ({
  patientId,
  type: "STANDARD",
  validUntil: null,
  regulatory: null,
  items: [emptyPrescriptionItem()],
});

function App() {
  const [session, setSession] = useState<SessionStatus>({ authorized: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<LocalPatient[]>([]);
  const [selected, setSelected] = useState<LocalPatient | null>(null);
  const [draft, setDraft] = useState<ConsultationDraftInput | null>(null);
  const [recordTab, setRecordTab] = useState<
    "SUMMARY" | "CONSULTATIONS" | "PRESCRIPTIONS"
  >("SUMMARY");
  const [prescriptions, setPrescriptions] = useState<LocalPrescription[]>([]);
  const [prescriptionDraft, setPrescriptionDraft] =
    useState<PrescriptionDraftInput | null>(null);
  const [sync, setSync] = useState<SyncStatus>({
    state: navigator.onLine ? "ONLINE" : "OFFLINE",
    pendingCount: 0,
    conflictCount: 0,
  });

  const refreshPatients = useCallback(
    async (search = query) => {
      const rows = await listLocalPatients(search);
      setPatients(rows);
      setSelected((current) =>
        current ? (rows.find((row) => row.id === current.id) ?? current) : null,
      );
    },
    [query],
  );

  const refreshPrescriptions = useCallback(async (patientId?: string) => {
    if (!patientId) {
      setPrescriptions([]);
      return;
    }
    setPrescriptions(await listPatientPrescriptions(patientId));
  }, []);

  const performSync = useCallback(async () => {
    // navigator.onLine is an indication only: the real availability is the
    // success of the signed API call. A DNS, TLS or 5xx failure leaves the
    // desktop fully usable offline.
    setSync((current) => ({ ...current, state: "SYNCING" }));
    try {
      const next = await syncNow();
      setSync(next);
      await refreshPatients();
      await refreshPrescriptions(selected?.id);
    } catch {
      const currentSession = await sessionStatus();
      if (!currentSession.authorized) {
        setSession({ authorized: false });
        setPatients([]);
        setSelected(null);
        setDraft(null);
      } else {
        setSync((current) => ({ ...current, state: "OFFLINE" }));
      }
    }
  }, [refreshPatients, refreshPrescriptions, selected?.id]);

  useEffect(() => {
    setPrescriptionDraft(null);
    void refreshPrescriptions(selected?.id);
  }, [refreshPrescriptions, selected?.id]);

  useEffect(() => {
    void (async () => {
      try {
        const current = await sessionStatus();
        setSession(current);
        if (current.authorized) {
          await refreshPatients("");
          setSync(await getSyncStatus());
        }
      } catch (cause) {
        setError(String(cause));
      } finally {
        setLoading(false);
      }
    })();
  }, []); // one secure-session check at startup

  useEffect(() => {
    if (!session.authorized) return;
    const online = () => void performSync();
    const offline = () =>
      setSync((current) => ({ ...current, state: "OFFLINE" }));
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [performSync, session.authorized]);

  const patientSummary = useMemo(
    () => selected?.medicalSummary ?? {},
    [selected],
  );

  if (loading) return <main className="center-card">Ouverture sécurisée…</main>;

  if (!session.authorized) {
    return (
      <LoginScreen
        error={error}
        onSubmit={async (input) => {
          setError("");
          setLoading(true);
          try {
            const next = await loginAndBootstrap(input);
            setSession(next);
            await refreshPatients("");
            setSync(await getSyncStatus());
          } catch (cause) {
            setError(String(cause));
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  const openPatient = (patient: LocalPatient) => {
    setSelected(patient);
    setDraft(null);
    setPrescriptionDraft(null);
    setRecordTab("SUMMARY");
  };

  return (
    <DashboardShell
      session={session}
      patients={patients}
      selectedId={selected?.id}
      query={query}
      sync={sync}
      onQuery={(value) => {
        setQuery(value);
        void refreshPatients(value);
      }}
      onSelect={openPatient}
      onHome={() => {
        setSelected(null);
        setDraft(null);
        setPrescriptionDraft(null);
      }}
      onLock={() => void logoutLocal().then(() => setSession({ authorized: false }))}
      onSync={() => void performSync()}
    >
      {!selected ? (
        <PatientDirectory patients={patients} query={query} onSelect={openPatient} />
      ) : prescriptionDraft ? (
        <PrescriptionEditor
          patient={selected}
          value={prescriptionDraft}
          onChange={setPrescriptionDraft}
          onCancel={() => setPrescriptionDraft(null)}
          onSave={async () => {
            const saved = await savePrescriptionDraft(prescriptionDraft);
            setPrescriptionDraft((current) =>
              current ? { ...current, localId: saved.localId } : current,
            );
            await refreshPrescriptions(selected.id);
            setSync(await getSyncStatus());
            void performSync();
          }}
        />
      ) : draft ? (
        <ConsultationEditor
          patient={selected}
          value={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={async () => {
            const saved = await saveConsultationDraft(draft);
            setDraft((current) =>
              current ? { ...current, localId: saved.localId } : current,
            );
            setSync(await getSyncStatus());
            void performSync();
          }}
        />
      ) : (
        <PatientRecord
          patient={selected}
          summary={patientSummary}
          tab={recordTab}
          prescriptions={prescriptions}
          onTab={setRecordTab}
          onNewConsultation={() => setDraft(emptyDraft(selected.id))}
          onNewPrescription={() => setPrescriptionDraft(emptyPrescriptionDraft(selected.id))}
          onEditPrescription={(prescription) =>
            setPrescriptionDraft({
              localId: prescription.localId,
              patientId: prescription.patientId,
              type: prescription.type,
              validUntil: prescription.validUntil,
              items: prescription.items,
            })
          }
        />
      )}
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// App identity and self-update
//
// The footer shows the exact build the support team must identify (version +
// commit). The update check sits here, on the login screen, on purpose: never
// while a consultation is open and never while the outbox is being processed.
// Nothing ever installs without the user's click, and the downloaded package
// is verified by the updater plugin against the minisign public key before
// the installer runs.
// ---------------------------------------------------------------------------

const DESKTOP_BUILD_SHA: string = import.meta.env.VITE_BUILD_SHA ?? "";
const inTauriWindow =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function ReleaseFooter() {
  return (
    <footer className="release-footer">
      <span className="release-version">
        HealixDz Desktop v{__APP_VERSION__}
        {DESKTOP_BUILD_SHA ? (
          <small> · build {DESKTOP_BUILD_SHA}</small>
        ) : null}
      </span>
      {inTauriWindow ? <UpdateControl /> : null}
    </footer>
  );
}

type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; update: Update; targetVersion: string }
  | { kind: "applying"; update: Update; step: string }
  | { kind: "error"; message: string };

function UpdateControl() {
  const [phase, setPhase] = useState<UpdatePhase>({ kind: "idle" });

  const verifyUpdate = async () => {
    if (phase.kind === "checking" || phase.kind === "applying") return;
    setPhase({ kind: "checking" });
    try {
      // The plugin fetches latest.json, downloads nothing else, and checks
      // the minisign signature of the release against the embedded public
      // key before this branch can ever run.
      const update = await check();
      if (update) {
        setPhase({ kind: "available", update, targetVersion: update.version });
      } else {
        setPhase({ kind: "uptodate" });
      }
    } catch (error) {
      // Unreachable endpoint (offline, no published release yet) is a normal
      // state, not a support case.
      setPhase({ kind: "error", message: String(error) });
    }
  };

  const applyUpdate = async (phase: Extract<UpdatePhase, { kind: "available" }>) => {
    setPhase({ kind: "applying", update: phase.update, step: "Téléchargement..." });
    try {
      await phase.update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setPhase({ kind: "applying", update: phase.update, step: "Téléchargement..." });
        } else if (event.event === "Finished") {
          setPhase({ kind: "applying", update: phase.update, step: "Installation..." });
        }
      });
      setPhase({ kind: "applying", update: phase.update, step: "Redémarrage de l'application..." });
      await relaunch();
    } catch (error) {
      setPhase({ kind: "error", message: String(error) });
    }
  };

  return (
    <div className="release-update">
      {phase.kind === "idle" && (
        <button type="button" onClick={() => void verifyUpdate()}>
          Vérifier la mise à jour
        </button>
      )}
      {phase.kind === "idle" && (
        <small>Les données locales et la configuration de l'appareil sont conservées par la mise à jour.</small>
      )}
      {phase.kind === "checking" && <small>Vérification de la dernière version publiée…</small>}
      {phase.kind === "uptodate" && (
        <small>HealixDz Desktop est à jour.</small>
      )}
      {phase.kind === "available" && (
        <>
          <button
            type="button"
            onClick={() => void applyUpdate(phase)}
            className="release-update-apply"
          >
            Installer la version {phase.targetVersion}
          </button>
          <small>L'application redémarre à la fin de l'installation.</small>
        </>
      )}
      {phase.kind === "applying" && <small>{phase.step}</small>}
      {phase.kind === "error" && (
        <small aria-live="polite">Mise à jour indisponible : {phase.message}</small>
      )}
    </div>
  );
}

function LoginScreen({
  error,
  onSubmit,
}: {
  error: string;
  onSubmit: (input: {
    accountType: "INDEPENDENT_DOCTOR" | "ESTABLISHMENT";
    email: string;
    password: string;
    deviceName: string;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  return (
    <main className="login-shell">
      <section className="login-hero" aria-label="HealixDz Desktop">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M4 17h6l2.7-7 4.1 13 3.2-9 1.8 3H28"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="login-brand-name">
            Healix<span>Dz</span>
          </span>
          <span className="login-brand-product">Desktop</span>
        </div>

        <div className="login-hero-copy">
          <p className="login-compliance">
            <span aria-hidden="true" /> Accès clinique sécurisé
          </p>
          <h1>
            La continuité des soins,
            <em> même hors connexion.</em>
          </h1>
          <p>
            Préparez vos consultations et ordonnances avec les données autorisées
            de votre espace de soin.
          </p>
        </div>

        <div className="login-trust-rail" aria-label="Garanties HealixDz Desktop">
          <article>
            <span className="login-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </span>
            <div>
              <strong>Appareil protégé</strong>
              <span>Clés stockées localement</span>
            </div>
          </article>
          <article>
            <span className="login-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M3 12h4l2-5 4 10 2.5-7 2 3H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <strong>Mode hors ligne</strong>
              <span>Synchronisation contrôlée</span>
            </div>
          </article>
          <article>
            <span className="login-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 5.5 5.7v5.1c0 4.4 2.7 7.7 6.5 10.1 3.8-2.4 6.5-5.7 6.5-10.1V5.7L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="m9.4 12 1.7 1.7 3.6-3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <strong>Accès audité</strong>
              <span>Périmètre patient respecté</span>
            </div>
          </article>
        </div>
      </section>

      <div className="login-pulse-divider" aria-hidden="true">
        <svg viewBox="0 0 58 1000" preserveAspectRatio="none">
          <path d="M29 0v360H18l6 32 8-80 7 134 6-86H29v640" />
        </svg>
      </div>

      <section className="login-form-column">
        <form
          className="login-card"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            void onSubmit({
              accountType: data.get("accountType") as
                | "INDEPENDENT_DOCTOR"
                | "ESTABLISHMENT",
              email: String(data.get("email")),
              password: String(data.get("password")),
              deviceName: String(data.get("deviceName")),
            }).finally(() => setBusy(false));
          }}
        >
          <header className="login-card-header">
            <div>
              <p className="eyebrow">Espace professionnel</p>
              <h2>Se connecter</h2>
              <p>
                Connectez cet appareil à votre espace HealixDz pour activer le
                travail hors ligne.
              </p>
            </div>
            <span className="login-shield" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 2.5 5 5.3v5.4c0 4.6 2.9 8 7 10.5 4.1-2.5 7-5.9 7-10.5V5.3L12 2.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
                <path d="m9.3 11.5 1.8 1.8 3.8-4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </header>

          <input type="hidden" name="accountType" value="INDEPENDENT_DOCTOR" />
          <p className="login-profile-note">
            Accès médecin indépendant ou médecin affilié.
          </p>

          <label className="login-field" htmlFor="desktop-email">
            <span>E-mail professionnel <b>*</b></span>
            <span className="login-input-shell">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="desktop-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                placeholder="nom@cabinet.dz"
              />
            </span>
          </label>

          <label className="login-field" htmlFor="desktop-password">
            <span>Mot de passe <b>*</b></span>
            <span className="login-input-shell">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="desktop-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Votre mot de passe"
              />
              <button
                className="login-password-toggle"
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {passwordVisible ? "Masquer" : "Afficher"}
              </button>
            </span>
          </label>

          <label className="login-field" htmlFor="desktop-device-name">
            <span>Nom de l’appareil <b>*</b></span>
            <span className="login-input-shell">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="desktop-device-name"
                name="deviceName"
                defaultValue="Poste clinique"
                required
                autoComplete="off"
              />
            </span>
            <small>Ce nom vous aidera à reconnaître ce poste dans votre espace.</small>
          </label>

          {error && (
            <p className="error login-error" role="alert" aria-live="assertive">
              <span aria-hidden="true">!</span>
              {error}
            </p>
          )}

          <button className="primary login-submit" disabled={busy}>
            {busy ? (
              <><span className="login-spinner" aria-hidden="true" /> Connexion en cours…</>
            ) : (
              <>Connexion sécurisée <span aria-hidden="true">→</span></>
            )}
          </button>

          <p className="login-security-note">
            <span aria-hidden="true">✓</span>
            La première connexion nécessite Internet. Vos informations restent
            protégées sur cet appareil.
          </p>
        </form>
        <ReleaseFooter />
      </section>
    </main>
  );
}

type RecordTab = "SUMMARY" | "CONSULTATIONS" | "PRESCRIPTIONS";

const RECORD_TABS: Array<{ key: RecordTab; label: string }> = [
  { key: "SUMMARY", label: "Résumé" },
  { key: "CONSULTATIONS", label: "Consultations" },
  { key: "PRESCRIPTIONS", label: "Ordonnances" },
];

type PatientSummary = NonNullable<LocalPatient["medicalSummary"]>;

function PatientRecord({
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

function ClinicalCard({
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

function ConsultationEditor({
  patient,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  patient: LocalPatient;
  value: ConsultationDraftInput;
  onChange: (value: ConsultationDraftInput) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const field = (key: keyof ConsultationDraftInput, label: string) => (
    <Field label={label}>
      <textarea
        className={textareaClass}
        value={String(value[key] ?? "")}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      />
    </Field>
  );
  return (
    <section className="workspace-stack" aria-label="Consultation hors ligne">
      <PageHeader
        icon={<Stethoscope className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow="Consultation hors ligne"
        title={`${patient.firstName} ${patient.lastName}`}
        actions={<Pill tone="warning">Brouillon local</Pill>}
      />
      <div className="surface-section p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {field("chiefComplaint", "Motif")}
          {field("historyPresentIllness", "Histoire de la maladie")}
          {field("clinicalExamination", "Examen clinique")}
          {field("assessment", "Évaluation")}
          {field("carePlan", "Plan thérapeutique")}
          {field("followUpPlan", "Suivi")}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Fermer</Button>
        <Button variant="secondary" onClick={() => onChange({ ...value, localStatus: "READY_TO_SYNC" })}>
          Marquer prête à synchroniser
        </Button>
        <Button
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave().finally(() => setSaving(false));
          }}
        >
          {saving ? "Enregistrement…" : "Enregistrer localement"}
        </Button>
      </div>
    </section>
  );
}

function PrescriptionList({
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

function PrescriptionEditor({
  patient,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  patient: LocalPatient;
  value: PrescriptionDraftInput;
  onChange: (value: PrescriptionDraftInput) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const updateItem = (index: number, next: PrescriptionItemInput) =>
    onChange({
      ...value,
      items: value.items.map((item, itemIndex) =>
        itemIndex === index ? next : item,
      ),
    });
  const locallyValid = value.items.length > 0 && value.items.every(
    (item) =>
      item.dci.trim() &&
      item.strength.trim() &&
      item.pharmaceuticalForm.trim() &&
      item.route.trim() &&
      item.dosePerIntake.trim() &&
      item.frequency.trim() &&
      item.quantity.trim() &&
      (!item.durationDays || item.durationDays > 0),
  );
  return (
    <section className="workspace-stack" aria-label="Ordonnance hors ligne">
      <PageHeader
        icon={<FileText className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow="Ordonnance hors ligne"
        title={`${patient.firstName} ${patient.lastName}`}
        description="La validation officielle et le numéro d’ordonnance exigent une connexion Internet."
        actions={<Pill tone="warning">Brouillon local</Pill>}
      />
      <div className="surface-section p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <input
              className={inputClass}
              value={value.type}
              onChange={(event) => onChange({ ...value, type: event.target.value })}
              placeholder="STANDARD"
            />
          </Field>
          <Field label="Valable jusqu’au">
            <input
              className={inputClass}
              type="date"
              value={value.validUntil?.slice(0, 10) ?? ""}
              onChange={(event) =>
                onChange({ ...value, validUntil: event.target.value || null })
              }
            />
          </Field>
        </div>
      </div>
      {value.items.map((item, index) => (
        <PrescriptionItemEditor
          key={`${item.medicationId ?? "manual"}-${index}`}
          index={index}
          item={item}
          onChange={(next) => updateItem(index, next)}
          onRemove={
            value.items.length > 1
              ? () =>
                  onChange({
                    ...value,
                    items: value.items.filter((_, itemIndex) => itemIndex !== index),
                  })
              : undefined
          }
        />
      ))}
      <div>
        <Button
          variant="secondary"
          onClick={() => onChange({ ...value, items: [...value.items, emptyPrescriptionItem()] })}
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />Ajouter un médicament
        </Button>
      </div>
      {error && <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Fermer</Button>
        <button type="button" className="clinical-button clinical-button-unavailable" disabled title="Connexion Internet requise pour la validation officielle.">
          Valider l’ordonnance (connexion requise)
        </button>
        <Button
          disabled={saving || !locallyValid}
          onClick={() => {
            setSaving(true);
            setError("");
            void onSave()
              .catch((cause) => setError(String(cause)))
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "Enregistrement…" : "Enregistrer localement"}
        </Button>
      </div>
    </section>
  );
}

function PrescriptionItemEditor({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: PrescriptionItemInput;
  onChange: (item: PrescriptionItemInput) => void;
  onRemove?: () => void;
}) {
  const field = (key: keyof PrescriptionItemInput, label: string, type = "text") => (
    <Field label={label}>
      <input
        className={inputClass}
        type={type}
        value={String(item[key] ?? "")}
        onChange={(event) =>
          onChange({
            ...item,
            [key]: type === "number" ? (event.target.value ? Number(event.target.value) : null) : event.target.value,
          })
        }
      />
    </Field>
  );
  const checkbox = (key: "asNeeded" | "renewalAllowed" | "substitutionAllowed", label: string) => (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--ink-soft)]">
      <input
        className="h-4 w-4 accent-[var(--accent)]"
        type="checkbox"
        checked={item[key]}
        onChange={(event) => onChange({ ...item, [key]: event.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <article className="surface-section p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
            <PillIcon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Médicament {index + 1}</h3>
        </div>
        {onRemove && <Button variant="ghost" size="sm" onClick={onRemove}>Retirer</Button>}
      </div>
      <MedicationPicker
        selected={item}
        onSelect={(medication) =>
          onChange({
            ...item,
            medicationId: medication.id,
            dci: medication.dci,
            brandName: medication.brandName ?? null,
            strength: medication.strength,
            pharmaceuticalForm: medication.pharmaceuticalForm,
            route: medication.route,
            manufacturer: medication.manufacturer ?? null,
            regulatoryCategory: medication.regulatoryCategory,
          })
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {field("dci", "DCI")}
        {field("brandName", "Marque")}
        {field("strength", "Dosage")}
        {field("pharmaceuticalForm", "Forme pharmaceutique")}
        {field("route", "Voie")}
        {field("dosePerIntake", "Dose par prise")}
        {field("frequency", "Fréquence")}
        {field("intakeMoment", "Moment de prise")}
        {field("durationDays", "Durée (jours)", "number")}
        {field("quantity", "Quantité")}
        {field("patientInstructions", "Instructions patient")}
        {field("indication", "Indication")}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-[var(--line)] pt-4">
        {checkbox("asNeeded", "Si besoin")}
        {checkbox("renewalAllowed", "Renouvelable")}
        {checkbox("substitutionAllowed", "Substitution autorisée")}
      </div>
    </article>
  );
}

function MedicationPicker({
  selected,
  onSelect,
}: {
  selected: PrescriptionItemInput;
  onSelect: (medication: LocalMedication) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<LocalMedication[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    void searchLocalMedications(query).then(setMatches).catch(() => setMatches([]));
  }, [query]);
  return (
    <div className="relative mb-4">
      <Field label="Rechercher dans le catalogue local (DCI, marque, dosage)">
        <input
          className={inputClass}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={selected.dci || "ex. para"}
        />
      </Field>
      {matches.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-[var(--shadow-raised)]">
          {matches.map((medication) => (
            <button
              key={medication.id}
              type="button"
              className="w-full rounded-[var(--radius-sm)] px-3 py-2.5 text-start text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              onClick={() => {
                onSelect(medication);
                setQuery("");
                setMatches([]);
              }}
            >
              {medication.dci} — {medication.brandName ?? "Sans marque"} — {medication.strength}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
