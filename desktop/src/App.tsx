import { useCallback, useEffect, useState } from "react";
import { BackButton } from "./dashboard-ui";
import { DashboardShell } from "./DashboardShell";
import {
  getSyncStatus,
  listLocalPatients,
  loginAndBootstrap,
  logoutLocal,
  sessionStatus,
  syncNow,
} from "./desktop-api";
import { describeError } from "./errors";
import { isDetailRoute, NEW_ID, pushRecentPatient, type Route } from "./layout/navigation";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { ConsultationPage, type SaveKind } from "./pages/ConsultationPage";
import { ConsultationsPage } from "./pages/ConsultationsPage";
import { LoginPage } from "./pages/LoginPage";
import { PatientRecordPage } from "./pages/PatientRecordPage";
import { PrescriptionPage } from "./pages/PrescriptionPage";
import { PrescriptionsPage } from "./pages/PrescriptionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SyncPage } from "./pages/SyncPage";
import { TodayPage } from "./pages/TodayPage";
import { PatientDirectory } from "./PatientDirectory";
import type { LocalAppointment, LocalPatient, SessionStatus, SyncStatus } from "./types";
import { openAiRun, openHealixAi } from "./web-app";

// Where "Retour" leads when the page was not opened from another one.
const parentOf = (route: Route): Route =>
  route.name === "consultation"
    ? { name: "consultations" }
    : route.name === "prescription"
      ? { name: "prescriptions" }
      : { name: "patients" };

// The session, the current route and the synchronization. The pages own
// everything else.
function App() {
  const [session, setSession] = useState<SessionStatus>({ authorized: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<LocalPatient[]>([]);
  const [selected, setSelected] = useState<LocalPatient | null>(null);
  const [route, setRoute] = useState<Route>({ name: "today" });
  const [backStack, setBackStack] = useState<Route[]>([]);
  const [recentPatients, setRecentPatients] = useState<LocalPatient[]>([]);
  const [patientCount, setPatientCount] = useState(0);
  // Bumped after a synchronization or a save: the pages reload their lists.
  const [version, setVersion] = useState(0);
  const [sync, setSync] = useState<SyncStatus>({
    state: navigator.onLine ? "ONLINE" : "OFFLINE",
    pendingCount: 0,
    conflictCount: 0,
  });
  const bump = useCallback(() => setVersion((current) => current + 1), []);

  const refreshPatients = useCallback(
    async (search = query) => {
      const rows = await listLocalPatients(search);
      setPatients(rows);
      // The menu badge counts the device, not the current search.
      if (!search.trim()) setPatientCount(rows.length);
      const fresh = (patient: LocalPatient) => rows.find((row) => row.id === patient.id) ?? patient;
      setRecentPatients((current) => current.map(fresh));
      setSelected((current) => (current ? fresh(current) : null));
    },
    [query],
  );

  const performSync = useCallback(async () => {
    // navigator.onLine is an indication only: the real availability is the
    // success of the signed API call. A DNS, TLS or 5xx failure leaves the
    // desktop fully usable offline.
    setSync((current) => ({ ...current, state: "SYNCING" }));
    try {
      const next = await syncNow();
      setSync(next);
      await refreshPatients();
      bump();
    } catch {
      const currentSession = await sessionStatus();
      if (!currentSession.authorized) {
        setSession({ authorized: false });
        setPatients([]);
        setSelected(null);
        setRoute({ name: "today" });
      } else {
        setSync((current) => ({ ...current, state: "OFFLINE" }));
      }
    }
  }, [refreshPatients, bump]);

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
        setError(describeError(cause));
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
            setBackStack([]);
            await refreshPatients("");
            setSync(await getSyncStatus());
            bump();
          } catch (cause) {
            setError(describeError(cause));
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  // A detail page remembers where it was opened from, for "Retour".
  const go = (next: Route) => {
    setBackStack((current) => (isDetailRoute(next) ? [...current, route].slice(-20) : []));
    setRoute(next);
  };

  const openPatient = (patient: LocalPatient) => {
    setSelected(patient);
    setRecentPatients((current) => pushRecentPatient(current, patient));
    go({ name: "patient", id: patient.id });
  };

  // The record may not be in the (searched) list: the whole device is asked.
  const findPatient = async (id: string) =>
    patients.find((row) => row.id === id) ??
    recentPatients.find((row) => row.id === id) ??
    (await listLocalPatients("")).find((row) => row.id === id);

  const openPatientById = async (id: string, tab?: "AI") => {
    const patient = await findPatient(id);
    if (!patient) return;
    setSelected(patient);
    setRecentPatients((current) => pushRecentPatient(current, patient));
    go({ name: "patient", id: patient.id, tab });
  };

  const navigate = (next: Route) => {
    if (next.name === "patient") void openPatientById(next.id);
    else go(next);
  };

  const goBack = async () => {
    const previous = backStack[backStack.length - 1];
    setBackStack((current) => current.slice(0, -1));
    const target = previous ?? parentOf(route);
    if (target.name === "patient") {
      const patient = await findPatient(target.id);
      if (patient) {
        setSelected(patient);
        setRoute(target);
        return;
      }
      setRoute({ name: "patients" });
      return;
    }
    setRoute(target);
  };

  // Starting from an appointment links the consultation to it.
  const startConsultation = (appointment: LocalAppointment) =>
    go({
      name: "consultation",
      id: NEW_ID,
      patientId: appointment.patientId,
      patientName: appointment.patientName,
      reason: appointment.reason ?? "",
      appointmentId: appointment.id,
    });

  // After a draft is saved: the lists reload and the outbox is pushed.
  // An automatic save (timer, leaving a field) only refreshes the counters;
  // saving or finishing on purpose also starts a synchronization.
  const afterSave = async (kind: SaveKind = "manual") => {
    bump();
    setSync(await getSyncStatus());
    if (kind !== "auto") void performSync();
  };

  const offline = sync.state === "OFFLINE";
  const openConsultation = (id: string) => go({ name: "consultation", id });
  const openPrescription = (id: string) => go({ name: "prescription", id });

  const page =
    route.name === "today" ? (
      <TodayPage
        name={session.user?.fullName ?? "Docteur"}
        sync={sync}
        version={version}
        recentPatients={recentPatients}
        onOpenPatient={(id) => void openPatientById(id)}
        onOpenPatientAi={(id) => void openPatientById(id, "AI")}
        onStartConsultation={startConsultation}
        onOpenConsultation={openConsultation}
        onOpenPrescription={openPrescription}
      />
    ) : route.name === "patients" || (route.name === "patient" && selected?.id !== route.id) ? (
      <PatientDirectory patients={patients} query={query} onSelect={openPatient} />
    ) : route.name === "patient" && selected ? (
      <PatientRecordPage
        key={selected.id}
        patient={selected}
        version={version}
        offline={offline}
        initialTab={route.tab}
        onNewConsultation={() =>
          go({ name: "consultation", id: NEW_ID, patientId: selected.id, patientName: `${selected.firstName} ${selected.lastName}` })
        }
        onNewPrescription={() =>
          go({ name: "prescription", id: NEW_ID, patientId: selected.id, patientName: `${selected.firstName} ${selected.lastName}` })
        }
        onOpenConsultation={openConsultation}
        onOpenPrescription={openPrescription}
        onOpenHealixAi={() => void openHealixAi(selected.id).catch(() => undefined)}
        onOpenAiRun={(runId) => void openAiRun(runId).catch(() => undefined)}
      />
    ) : route.name === "appointments" ? (
      <AppointmentsPage
        sync={sync}
        version={version}
        onOpenPatient={(id) => void openPatientById(id)}
        onStartConsultation={startConsultation}
        onOpenConsultation={openConsultation}
      />
    ) : route.name === "consultations" ? (
      <ConsultationsPage version={version} onOpen={openConsultation} />
    ) : route.name === "consultation" ? (
      <ConsultationPage
        key={route.id === NEW_ID ? `new-${route.patientId}` : route.id}
        id={route.id}
        isNew={route.id === NEW_ID}
        patientId={route.patientId}
        patientName={route.patientName}
        reason={route.reason}
        appointmentId={route.appointmentId}
        onSaved={afterSave}
        onClose={() => void goBack()}
        onWritePrescription={(patientId, patientName) =>
          go({ name: "prescription", id: NEW_ID, patientId, patientName })
        }
      />
    ) : route.name === "prescriptions" ? (
      <PrescriptionsPage version={version} onOpen={openPrescription} />
    ) : route.name === "prescription" ? (
      <PrescriptionPage
        key={route.id === NEW_ID ? `new-${route.patientId}` : route.id}
        id={route.id}
        isNew={route.id === NEW_ID}
        patientId={route.patientId}
        patientName={route.patientName}
        session={session}
        onSaved={afterSave}
        onClose={() => void goBack()}
      />
    ) : route.name === "sync" ? (
      <SyncPage status={sync} onSync={() => void performSync()} />
    ) : (
      <SettingsPage session={session} sync={sync} />
    );

  return (
    <DashboardShell
      session={session}
      route={route}
      patient={route.name === "patient" ? selected : null}
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
      onOpenHealixAi={() =>
        void openHealixAi(route.name === "patient" ? route.id : undefined).catch(() => undefined)
      }
      onLogout={() =>
        void logoutLocal().then(() => {
          setSession({ authorized: false });
          setSelected(null);
          setRecentPatients([]);
          setBackStack([]);
          setRoute({ name: "today" });
        })
      }
    >
      <div className="space-y-4">
        {isDetailRoute(route) ? <BackButton onClick={() => void goBack()} /> : null}
        {page}
      </div>
    </DashboardShell>
  );
}

export default App;
