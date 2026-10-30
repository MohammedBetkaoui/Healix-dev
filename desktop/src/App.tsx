import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ClipboardList, Pill as PillIcon } from "lucide-react";
import { DashboardShell } from "./DashboardShell";
import { emptyDraft, emptyPrescriptionDraft } from "./drafts";
import { fr } from "./i18n/fr";
import { pushRecentPatient, type Route } from "./layout/navigation";
import { ConsultationEditorPage } from "./pages/ConsultationEditorPage";
import { LoginPage } from "./pages/LoginPage";
import { PagePlaceholder } from "./pages/PagePlaceholder";
import { PatientRecordPage } from "./pages/PatientRecordPage";
import { PrescriptionEditorPage } from "./pages/PrescriptionEditorPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SyncPage } from "./pages/SyncPage";
import { TodayPage } from "./pages/TodayPage";
import { PatientDirectory } from "./PatientDirectory";
import { openHealixAi } from "./web-app";
import {
  getSyncStatus,
  listPatientPrescriptions,
  listLocalPatients,
  loginAndBootstrap,
  logoutLocal,
  saveConsultationDraft,
  savePrescriptionDraft,
  sessionStatus,
  syncNow,
} from "./desktop-api";
import type {
  ConsultationDraftInput,
  LocalPatient,
  LocalPrescription,
  PrescriptionDraftInput,
  SessionStatus,
  SyncStatus,
} from "./types";

function App() {
  const [session, setSession] = useState<SessionStatus>({ authorized: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<LocalPatient[]>([]);
  const [selected, setSelected] = useState<LocalPatient | null>(null);
  const [route, setRoute] = useState<Route>({ name: "today" });
  const [recentPatients, setRecentPatients] = useState<LocalPatient[]>([]);
  const [patientCount, setPatientCount] = useState(0);
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
      // The menu badge counts the device, not the current search.
      if (!search.trim()) setPatientCount(rows.length);
      const fresh = (patient: LocalPatient) => rows.find((row) => row.id === patient.id) ?? patient;
      setRecentPatients((current) => current.map(fresh));
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
      <LoginPage
        error={error}
        onSubmit={async (input) => {
          setError("");
          setLoading(true);
          try {
            const next = await loginAndBootstrap(input);
            setSession(next);
            setRoute({ name: "today" });
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
    setRoute({ name: "patient", id: patient.id });
    setRecentPatients((current) => pushRecentPatient(current, patient));
  };

  const navigate = (next: Route) => {
    if (next.name === "patient") {
      const patient = patients.find((row) => row.id === next.id) ?? recentPatients.find((row) => row.id === next.id);
      if (patient) openPatient(patient);
      return;
    }
    setSelected(null);
    setDraft(null);
    setPrescriptionDraft(null);
    setRoute(next);
  };

  return (
    <DashboardShell
      session={session}
      route={route}
      patient={selected}
      patientCount={patientCount}
      recentPatients={recentPatients}
      query={query}
      sync={sync}
      onQuery={(value) => {
        setQuery(value);
        void refreshPatients(value);
        // Typing a name leads to the patient list.
        if (route.name !== "patients") navigate({ name: "patients" });
      }}
      onNavigate={navigate}
      onOpenPatient={openPatient}
      onOpenHealixAi={() => void openHealixAi(selected?.id).catch(() => undefined)}
      onLogout={() =>
        void logoutLocal().then(() => {
          setSession({ authorized: false });
          setSelected(null);
          setRecentPatients([]);
          setRoute({ name: "today" });
        })
      }
    >
      {route.name === "today" ? (
        <TodayPage
          name={session.user?.fullName ?? "Docteur"}
          patientCount={patientCount}
          sync={sync}
          recentPatients={recentPatients}
          onOpenPatient={openPatient}
        />
      ) : route.name === "patients" || (route.name === "patient" && !selected) ? (
        <PatientDirectory patients={patients} query={query} onSelect={openPatient} />
      ) : route.name === "appointments" ? (
        <PagePlaceholder icon={Calendar} title={fr.nav.items.appointments} />
      ) : route.name === "consultations" ? (
        <PagePlaceholder icon={ClipboardList} title={fr.nav.items.consultations} />
      ) : route.name === "prescriptions" ? (
        <PagePlaceholder icon={PillIcon} title={fr.nav.items.prescriptions} />
      ) : route.name === "sync" ? (
        <SyncPage status={sync} onSync={() => void performSync()} />
      ) : route.name === "settings" ? (
        <SettingsPage session={session} sync={sync} />
      ) : !selected ? null : prescriptionDraft ? (
        <PrescriptionEditorPage
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
        <ConsultationEditorPage
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
        <PatientRecordPage
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

export default App;
