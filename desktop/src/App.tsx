import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

function formatDate(value?: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-DZ", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">HealixDz Desktop</p>
          <h1>{session.workspace?.name}</h1>
        </div>
        <SyncIndicator status={sync} onSync={performSync} />
        <div className="user-block">
          <span>{session.user?.fullName}</span>
          <button
            className="text-button"
            onClick={() =>
              void logoutLocal().then(() => setSession({ authorized: false }))
            }
          >
            Verrouiller
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="patient-panel">
          <label htmlFor="patient-search">Rechercher un patient</label>
          <input
            id="patient-search"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              void refreshPatients(value);
            }}
            placeholder="Nom ou numéro de dossier"
          />
          {sync.state === "OFFLINE" && (
            <p className="scope-note">Résultats disponibles sur cet appareil</p>
          )}
          <div className="patient-list">
            {patients.map((patient) => (
              <button
                key={patient.id}
                className={
                  selected?.id === patient.id ? "patient active" : "patient"
                }
                onClick={() => {
                  setSelected(patient);
                  setDraft(null);
                  setPrescriptionDraft(null);
                  setRecordTab("SUMMARY");
                }}
              >
                <strong>
                  {patient.firstName} {patient.lastName}
                </strong>
                <span>
                  {patient.locked
                    ? "Dossier verrouillé"
                    : (patient.hospitalRecordNumber ?? "Sans N° dossier")}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="record-panel">
          {!selected ? (
            <section className="empty-state">
              <h2>Dossiers disponibles hors ligne</h2>
              <p>
                Sélectionnez un patient synchronisé pour consulter son dossier.
              </p>
            </section>
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
            <section>
              <div className="record-heading">
                <div>
                  <p className="eyebrow">Dossier patient</p>
                  <h2>
                    {selected.firstName} {selected.lastName}
                  </h2>
                  {selected.locked ? (
                    <p className="available">
                      Dossier verrouillé ({selected.lockReason ?? "hors périmètre"}) ·
                      lecture seule
                    </p>
                  ) : (
                    <p className="available">
                      Disponible hors ligne · Dernière synchronisation :{" "}
                      {formatDate(selected.lastSyncedAt)}
                    </p>
                  )}
                </div>
                <nav className="record-tabs" aria-label="Dossier patient">
                  <button
                    className={recordTab === "SUMMARY" ? "active" : ""}
                    onClick={() => setRecordTab("SUMMARY")}
                  >
                    Résumé
                  </button>
                  <button
                    className={recordTab === "CONSULTATIONS" ? "active" : ""}
                    onClick={() => setRecordTab("CONSULTATIONS")}
                  >
                    Consultations
                  </button>
                  <button
                    className={recordTab === "PRESCRIPTIONS" ? "active" : ""}
                    onClick={() => setRecordTab("PRESCRIPTIONS")}
                  >
                    Ordonnances
                  </button>
                </nav>
                {!selected.locked && recordTab === "CONSULTATIONS" && (
                  <button
                    className="primary"
                    onClick={() => setDraft(emptyDraft(selected.id))}
                  >
                    Nouvelle consultation
                  </button>
                )}
                {!selected.locked && recordTab === "PRESCRIPTIONS" && (
                  <button
                    className="primary"
                    onClick={() => setPrescriptionDraft(emptyPrescriptionDraft(selected.id))}
                  >
                    + Nouveau brouillon
                  </button>
                )}
              </div>
              {recordTab === "PRESCRIPTIONS" ? (
                <PrescriptionList
                  prescriptions={prescriptions}
                  locked={Boolean(selected.locked)}
                  onEdit={(prescription) =>
                    setPrescriptionDraft({
                      localId: prescription.localId,
                      patientId: prescription.patientId,
                      type: prescription.type,
                      validUntil: prescription.validUntil,
                      items: prescription.items,
                    })
                  }
                />
              ) : recordTab === "CONSULTATIONS" ? (
                <section className="empty-state compact-empty">
                  <h3>Consultations hors ligne</h3>
                  <p>Créez une nouvelle consultation depuis ce dossier.</p>
                </section>
              ) : (
                <>
              <div className="clinical-grid">
                <ClinicalCard
                  title="Groupe sanguin"
                  values={[selected.bloodGroup ?? "Non renseigné"]}
                />
                <ClinicalCard
                  title="Allergies"
                  values={patientSummary.allergies}
                />
                <ClinicalCard
                  title="Maladies chroniques"
                  values={patientSummary.chronicDiseases}
                />
                <ClinicalCard
                  title="Médicaments actuels"
                  values={patientSummary.currentMedications}
                />
                <ClinicalCard
                  title="Antécédents"
                  values={patientSummary.history}
                />
              </div>
              <div className="online-only">
                Analyse IA indisponible hors connexion
              </div>
              <p className="freshness">
                Dernière mise à jour serveur :{" "}
                {formatDate(selected.serverUpdatedAt)}
              </p>
                </>
              )}
            </section>
          )}
        </main>
      </div>
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
      </section>
    </main>
  );
}

function SyncIndicator({
  status,
  onSync,
}: {
  status: SyncStatus;
  onSync: () => Promise<void>;
}) {
  const label =
    status.state === "SYNCING"
      ? `Synchronisation… ${status.processed ?? 0} / ${status.total ?? status.pendingCount}`
      : status.state === "OFFLINE"
        ? "Hors ligne"
        : status.state === "SCOPE_REVOKED" || status.state === "LOCKED"
          ? `${status.lockedCount ?? 0} dossiers verrouillés hors périmètre`
          : status.state === "CONFLICT"
            ? `${status.conflictCount} éléments nécessitent votre attention`
            : "En ligne";
  return (
    <button
      className={`sync-indicator ${status.state.toLowerCase()}`}
      onClick={() => void onSync()}
    >
      <span>●</span>
      <span>
        <strong>{label}</strong>
        <small>
          {status.pendingCount
            ? `${status.pendingCount} modifications en attente`
            : "Toutes les données sont synchronisées"}{" "}
          · Dernière synchronisation : {formatDate(status.lastSyncedAt)}
        </small>
      </span>
    </button>
  );
}

function ClinicalCard({ title, values }: { title: string; values?: string[] }) {
  return (
    <article className="clinical-card">
      <h3>{title}</h3>
      <p>
        {values?.length
          ? values.join(" · ")
          : "Aucune information synchronisée"}
      </p>
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
    <label>
      {label}
      <textarea
        value={String(value[key] ?? "")}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <section>
      <div className="record-heading">
        <div>
          <p className="eyebrow">Consultation hors ligne</p>
          <h2>
            {patient.firstName} {patient.lastName}
          </h2>
        </div>
        <span className="draft-badge">Brouillon local</span>
      </div>
      <div className="editor-grid">
        {field("chiefComplaint", "Motif")}
        {field("historyPresentIllness", "Histoire de la maladie")}
        {field("clinicalExamination", "Examen clinique")}
        {field("assessment", "Évaluation")}
        {field("carePlan", "Plan thérapeutique")}
        {field("followUpPlan", "Suivi")}
      </div>
      <div className="editor-actions">
        <button onClick={onCancel}>Fermer</button>
        <button
          className="secondary"
          onClick={() => onChange({ ...value, localStatus: "READY_TO_SYNC" })}
        >
          Marquer prête à synchroniser
        </button>
        <button
          className="primary"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave().finally(() => setSaving(false));
          }}
        >
          {saving ? "Enregistrement…" : "Enregistrer localement"}
        </button>
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
      <section className="empty-state compact-empty">
        <h3>Aucune ordonnance locale</h3>
        <p>Créez un brouillon pour préparer une ordonnance hors ligne.</p>
      </section>
    );
  }
  return (
    <div className="prescription-list">
      {prescriptions.map((prescription) => {
        const editable =
          !locked &&
          prescription.localStatus !== "CONFLICT" &&
          prescription.localStatus !== "READ_ONLY" &&
          (!prescription.serverStatus || prescription.serverStatus === "DRAFT");
        const label =
          prescription.localStatus === "CONFLICT"
            ? "Conflit — attention requise"
            : prescription.serverStatus === "VALIDATED"
              ? `Validée ${prescription.number ?? ""} · lecture seule`
              : prescription.serverStatus === "CANCELED"
                ? "Annulée · lecture seule"
                : prescription.localStatus === "PENDING_SYNC"
                  ? "En attente de synchronisation"
                  : prescription.serverStatus === "DRAFT"
                    ? "Brouillon synchronisé"
                    : "Brouillon local";
        return (
          <article key={prescription.localId} className="prescription-card">
            <div>
              <strong>{prescription.number ?? "Ordonnance sans numéro"}</strong>
              <p>{label}</p>
              <small>
                {prescription.items.map((item) => item.dci).join(" · ") || "Sans médicament"}
              </small>
            </div>
            {editable && (
              <button className="secondary" onClick={() => onEdit(prescription)}>
                Modifier
              </button>
            )}
          </article>
        );
      })}
    </div>
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
    <section>
      <div className="record-heading">
        <div>
          <p className="eyebrow">Ordonnance hors ligne</p>
          <h2>
            {patient.firstName} {patient.lastName}
          </h2>
          <p className="scope-note">
            La validation officielle et le numéro d’ordonnance exigent une connexion Internet.
          </p>
        </div>
        <span className="draft-badge">Brouillon local</span>
      </div>
      <div className="editor-grid prescription-meta">
        <label>
          Type
          <input
            value={value.type}
            onChange={(event) => onChange({ ...value, type: event.target.value })}
            placeholder="STANDARD"
          />
        </label>
        <label>
          Valable jusqu’au
          <input
            type="date"
            value={value.validUntil?.slice(0, 10) ?? ""}
            onChange={(event) =>
              onChange({ ...value, validUntil: event.target.value || null })
            }
          />
        </label>
      </div>
      <div className="prescription-items">
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
      </div>
      <button
        className="secondary"
        onClick={() => onChange({ ...value, items: [...value.items, emptyPrescriptionItem()] })}
      >
        + Ajouter un médicament
      </button>
      {error && <p className="error">{error}</p>}
      <div className="editor-actions">
        <button onClick={onCancel}>Fermer</button>
        <button className="secondary" disabled title="Connexion Internet requise pour la validation officielle.">
          Valider l’ordonnance (connexion requise)
        </button>
        <button
          className="primary"
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
        </button>
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
    <label>
      {label}
      <input
        type={type}
        value={String(item[key] ?? "")}
        onChange={(event) =>
          onChange({
            ...item,
            [key]: type === "number" ? (event.target.value ? Number(event.target.value) : null) : event.target.value,
          })
        }
      />
    </label>
  );
  return (
    <article className="prescription-item">
      <div className="item-heading">
        <h3>Médicament {index + 1}</h3>
        {onRemove && <button className="text-button" onClick={onRemove}>Retirer</button>}
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
      <div className="editor-grid">
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
      <div className="checkbox-row">
        <label><input type="checkbox" checked={item.asNeeded} onChange={(event) => onChange({ ...item, asNeeded: event.target.checked })} /> Si besoin</label>
        <label><input type="checkbox" checked={item.renewalAllowed} onChange={(event) => onChange({ ...item, renewalAllowed: event.target.checked })} /> Renouvelable</label>
        <label><input type="checkbox" checked={item.substitutionAllowed} onChange={(event) => onChange({ ...item, substitutionAllowed: event.target.checked })} /> Substitution autorisée</label>
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
    <label className="medication-picker">
      Rechercher dans le catalogue local (DCI, marque, dosage)
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={selected.dci || "ex. para"}
      />
      {matches.length > 0 && (
        <div className="medication-results">
          {matches.map((medication) => (
            <button
              key={medication.id}
              type="button"
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
    </label>
  );
}

export default App;
