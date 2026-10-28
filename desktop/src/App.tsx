import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  getSyncStatus,
  listLocalPatients,
  loginAndBootstrap,
  logoutLocal,
  saveConsultationDraft,
  sessionStatus,
  syncNow,
} from "./desktop-api";
import type {
  ConsultationDraftInput,
  LocalPatient,
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

  const performSync = useCallback(async () => {
    if (!navigator.onLine) {
      setSync((current) => ({ ...current, state: "OFFLINE" }));
      return;
    }
    setSync((current) => ({ ...current, state: "SYNCING" }));
    try {
      const next = await syncNow();
      setSync(next);
      await refreshPatients();
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
  }, [refreshPatients]);

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
                }}
              >
                <strong>
                  {patient.firstName} {patient.lastName}
                </strong>
                <span>{patient.hospitalRecordNumber ?? "Sans N° dossier"}</span>
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
                if (navigator.onLine) void performSync();
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
                  <p className="available">
                    Disponible hors ligne · Dernière synchronisation :{" "}
                    {formatDate(selected.lastSyncedAt)}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => setDraft(emptyDraft(selected.id))}
                >
                  Nouvelle consultation
                </button>
              </div>
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
  return (
    <main className="login-shell">
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
        <p className="eyebrow">Continuité clinique sécurisée</p>
        <h1>HealixDz Desktop</h1>
        <p>
          La première connexion et l’enregistrement de cet appareil nécessitent
          Internet.
        </p>
        <input type="hidden" name="accountType" value="INDEPENDENT_DOCTOR" />
        <p className="scope-note">
          Accès médecin indépendant ou médecin affilié
        </p>
        <label>
          E-mail
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          Nom de l’appareil
          <input name="deviceName" defaultValue="Poste clinique" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Enregistrement…" : "Connexion sécurisée"}
        </button>
      </form>
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

export default App;
