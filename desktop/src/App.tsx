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
