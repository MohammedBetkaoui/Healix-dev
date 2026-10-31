import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import * as api from "./desktop-api";
import * as printer from "./print/print-html";
import { patient as fixturePatient } from "./test/fixtures";
import type {
  ConsultationDetail, ConsultationDraftInput, ConsultationSummary, LocalAppointment, LocalPrescription,
  PrescriptionDraftInput, PrescriptionSummary, SyncStatus,
} from "./types";

// The whole journey of a doctor, offline, on a simulated device that keeps its
// state like the native side does: appointment -> consultation (vital signs,
// diagnosis) -> "Terminer" -> prescription (allergy alert, medication changed)
// -> "Imprimer" -> back to the day, where the appointment is done and the
// outbox grew.
vi.mock("./desktop-api", () => ({
  API_BASE: "https://api.example.test/api",
  sessionStatus: vi.fn(),
  listLocalPatients: vi.fn(),
  getLocalPatient: vi.fn(),
  getSyncStatus: vi.fn(),
  listAppointments: vi.fn(),
  listConsultations: vi.fn(),
  listPrescriptions: vi.fn(),
  listAiReports: vi.fn(),
  getConsultation: vi.fn(),
  getLocalPrescription: vi.fn(),
  saveConsultationDraft: vi.fn(),
  savePrescriptionDraft: vi.fn(),
  recordPrescriptionPrint: vi.fn(),
  searchLocalMedications: vi.fn(),
  syncNow: vi.fn(),
  logoutLocal: vi.fn(),
  loginAndBootstrap: vi.fn(),
}));
vi.mock("./print/print-html", () => ({ printHtml: vi.fn(), downloadHtml: vi.fn() }));

const mocked = vi.mocked(api);
const print = vi.mocked(printer);

// ---- the simulated device --------------------------------------------------

const amine = fixturePatient("7", {
  firstName: "Amine", lastName: "Benali", birthDate: "1988-04-12T00:00:00.000Z", hospitalRecordNumber: "HD-DEMO-0001",
  medicalSummary: { allergies: ["Pénicilline", "Amoxicilline"], currentMedications: ["Amlodipine 5 mg"], chronicDiseases: [], history: [] },
});

// 10:00 today, in the doctor's day.
const tenOClock = new Date();
tenOClock.setHours(10, 0, 0, 0);

type Device = {
  appointments: LocalAppointment[];
  consultations: Array<{ summary: ConsultationSummary; detail: ConsultationDetail }>;
  prescriptions: LocalPrescription[];
  outbox: number;
  sentConsultations: ConsultationDraftInput[];
  sentPrescriptions: PrescriptionDraftInput[];
};

let device: Device;

const status = (): SyncStatus => ({ state: "OFFLINE", pendingCount: device.outbox, conflictCount: 0, lastSyncedAt: null });

function installDevice() {
  device = {
    appointments: [
      {
        id: "a1", patientId: "7", patientName: "Amine Benali", patientLocked: false, scheduledAt: tenOClock.toISOString(),
        durationMinutes: 30, reason: "Toux persistante", status: "CONFIRMED",
      },
    ],
    consultations: [],
    prescriptions: [],
    outbox: 0,
    sentConsultations: [],
    sentPrescriptions: [],
  };

  mocked.sessionStatus.mockResolvedValue({
    authorized: true,
    workspace: {
      id: "w", name: "Cabinet du Dr Démonstration",
      organization: { name: "Cabinet du Dr Démonstration", address: "12 rue des Frères Bouadou", wilaya: "Bordj Bou Arréridj", phone: "035 00 00 01" },
    },
    user: {
      id: "u", fullName: "Dr Démonstration", email: "dr.demonstration@healix.test",
      prescriber: {
        fullName: "Dr Démonstration", speciality: "Médecine générale", registrationNumber: "34/0001",
        regionalCouncil: "Conseil régional de Sétif", professionalAddress: "12 rue des Frères Bouadou",
      },
    },
  });
  mocked.listLocalPatients.mockResolvedValue([amine]);
  mocked.getLocalPatient.mockResolvedValue(amine);
  mocked.getSyncStatus.mockImplementation(async () => status());
  // Offline: a synchronization finds no network and the outbox stays as it is.
  mocked.syncNow.mockImplementation(async () => status());
  mocked.listAppointments.mockImplementation(async () => device.appointments);
  mocked.listConsultations.mockImplementation(async () => device.consultations.map((entry) => entry.summary));
  mocked.listPrescriptions.mockImplementation(async (patientId) =>
    device.prescriptions
      .filter((item) => !patientId || item.patientId === patientId)
      .map((item): PrescriptionSummary => ({
        localId: item.localId, serverId: null, patientId: item.patientId, patientName: "Amine Benali", patientLocked: false,
        serverStatus: null, localStatus: "LOCAL_DRAFT", type: item.type, validUntil: null, number: null, updatedAt: item.updatedAt,
        itemCount: item.items.length, medications: item.items.map((entry) => entry.dci).join(" · "),
      })),
  );
  mocked.searchLocalMedications.mockResolvedValue([]);
  mocked.listAiReports.mockResolvedValue([]);
  mocked.recordPrescriptionPrint.mockResolvedValue(undefined);
  print.printHtml.mockReset();
  print.printHtml.mockResolvedValue(undefined);

  // The native save of a consultation: stores it, queues an operation.
  mocked.saveConsultationDraft.mockImplementation(async (input) => {
    device.sentConsultations.push(input);
    const localId = input.localId ?? "consultation-1";
    const existing = device.consultations.find((entry) => entry.summary.localId === localId);
    if (!existing) device.outbox += 1;
    const finished = input.localStatus === "READY_TO_SYNC";
    const summary: ConsultationSummary = {
      localId, serverId: null, appointmentId: input.appointmentId ?? null, patientId: input.patientId, patientName: "Amine Benali",
      patientLocked: false, date: new Date().toISOString(), chiefComplaint: input.chiefComplaint,
      firstDiagnosis: input.diagnoses?.[0]?.label ?? null, status: null, localStatus: input.localStatus,
      state: finished ? "PENDING_SYNC" : "DRAFT", pendingSync: finished, editable: true,
    };
    const detail = { ...summary, ...input, vitalSigns: input.vitalSigns ?? null, diagnoses: input.diagnoses ?? [] } as unknown as ConsultationDetail;
    device.consultations = [...device.consultations.filter((entry) => entry.summary.localId !== localId), { summary, detail }];
    return { localId, operationId: `op-${device.sentConsultations.length}` };
  });
  mocked.getConsultation.mockImplementation(async (id) => device.consultations.find((entry) => entry.summary.localId === id)!.detail);

  mocked.savePrescriptionDraft.mockImplementation(async (input) => {
    device.sentPrescriptions.push(input);
    const localId = input.localId ?? "prescription-1";
    if (!device.prescriptions.some((item) => item.localId === localId)) device.outbox += 1;
    const stored = {
      localId, patientId: input.patientId, serverStatus: null, localStatus: "LOCAL_DRAFT", type: input.type,
      items: input.items, updatedAt: new Date().toISOString(),
    } as LocalPrescription;
    device.prescriptions = [...device.prescriptions.filter((item) => item.localId !== localId), stored];
    return { localId, operationId: `rx-op-${device.sentPrescriptions.length}` };
  });
}

const typeInto = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  for (const fn of Object.values(mocked)) if (typeof fn === "function") (fn as ReturnType<typeof vi.fn>).mockReset();
  installDevice();
});

describe("the journey: appointment, consultation, prescription, print, back to the day", () => {
  it("runs offline from 'Démarrer la consultation' to a printed prescription, and the day shows it", async () => {
    render(<App />);

    // 1. Aujourd'hui: the 10:00 appointment, to start.
    const row = (await screen.findByText("Toux persistante · 30 min")).closest("li") as HTMLElement;
    expect(within(row).getByText("Confirmé")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Démarrer la consultation" }));

    // 2. The editor opens with the patient and the reason already filled in.
    expect(await screen.findByRole("heading", { level: 1, name: "Amine Benali" })).toBeTruthy();
    expect((screen.getByLabelText("Motif") as HTMLTextAreaElement).value).toBe("Toux persistante");

    // Vital signs: the BMI is computed, the values to watch are named.
    typeInto(/Tension systolique/, "150");
    typeInto(/Tension diastolique/, "95");
    typeInto(/Saturation en oxygène/, "93");
    typeInto(/^Poids/, "70");
    typeInto(/^Taille/, "175");
    expect(document.querySelector("[data-bmi]")?.textContent).toBe("22,9 kg/m²");
    const watch = within(screen.getByRole("list", { name: "Valeurs à surveiller" }));
    expect(watch.getByText("Tension élevée")).toBeTruthy();
    expect(watch.getByText("Saturation basse")).toBeTruthy();

    // A diagnosis, the main one.
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un diagnostic" }));
    typeInto("Diagnostic 1", "Bronchite aiguë");
    typeInto("Code CIM-10 1 (facultatif)", "J20");

    // 3. "Terminer": saved as ready to synchronize, linked to the appointment.
    fireEvent.click(screen.getByRole("button", { name: "Terminer la consultation" }));
    await waitFor(() => expect(device.sentConsultations.at(-1)?.localStatus).toBe("READY_TO_SYNC"));
    const finished = device.sentConsultations.at(-1)!;
    expect(finished.appointmentId).toBe("a1");
    expect(finished.patientId).toBe("7");
    expect(finished.vitalSigns).toEqual({ systolicBp: 150, diastolicBp: 95, oxygenSaturation: 93, weightKg: 70, heightCm: 175 });
    expect(finished.diagnoses).toEqual([{ label: "Bronchite aiguë", code: "J20", codeSystem: "CIM-10", isPrimary: true, note: null }]);
    const prompt = await waitFor(() => {
      const found = document.querySelector("[data-finished]") as HTMLElement | null;
      if (!found) throw new Error("not yet");
      return found;
    });

    // 4. "Rédiger l'ordonnance": the prescription editor, for the same patient.
    fireEvent.click(within(prompt).getByRole("button", { name: "Rédiger l’ordonnance" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Amine Benali" })).toBeTruthy();
    await screen.findByRole("region", { name: "Contrôles de sécurité" });

    //    An allergy: the exact DCI of a known allergy blocks saving.
    typeInto("DCI", "Amoxicilline");
    typeInto("Dosage", "1 g");
    typeInto("Forme pharmaceutique", "TABLET");
    typeInto("Voie", "ORAL");
    typeInto("Dose par prise", "1 comprimé");
    typeInto("Fréquence", "2 fois par jour");
    typeInto("Quantité", "1 boîte");
    const summary = within(document.querySelector("[data-safety-summary]") as HTMLElement);
    expect(summary.getByText(/Correspondance exacte avec une allergie structurée connue/)).toBeTruthy();
    const saveButton = () => screen.getByRole("button", { name: /Enregistrer localement/ }) as HTMLButtonElement;
    expect(saveButton().disabled).toBe(true);

    //    The medication is changed: the alert goes, saving is possible again.
    typeInto("DCI", "Paracétamol");
    typeInto("Dosage", "1 g");
    await waitFor(() => expect(document.querySelector("[data-allergy-confirmation]")).toBeNull());
    expect(saveButton().disabled).toBe(false);

    // 5. "Imprimer": saved first, noted in the audit trail, the print dialog opens.
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    await waitFor(() => expect(print.printHtml).toHaveBeenCalledTimes(1));
    expect(device.sentPrescriptions).toHaveLength(1);
    expect("allergyOverride" in device.sentPrescriptions[0]).toBe(false);
    expect(device.sentPrescriptions[0].items[0].dci).toBe("Paracétamol");
    expect(mocked.recordPrescriptionPrint).toHaveBeenCalledWith("prescription-1");
    const html = print.printHtml.mock.calls[0][0];
    expect(html).toContain("Établie hors ligne le");
    expect(html).toContain("Benali");
    expect(html).toContain("34/0001");
    expect(html).toContain("1. Paracétamol");
    expect(html).not.toContain("Amoxicilline");

    // 6. Back to Aujourd'hui.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aujourd’hui" }));
    });
    const doneRow = (await screen.findByText("Toux persistante · 30 min")).closest("li") as HTMLElement;
    // The appointment is done, and no longer offers to start a consultation.
    await waitFor(() => expect(within(doneRow).getByText("Consultation faite")).toBeTruthy());
    expect(within(doneRow).queryByRole("button", { name: "Démarrer la consultation" })).toBeNull();

    // Two operations are waiting: the consultation and the prescription.
    expect(device.outbox).toBe(2);
    expect(screen.getByRole("img", { name: "2 opérations en attente" })).toBeTruthy();
    const tile = screen.getByText("Opérations en attente").closest("div") as HTMLElement;
    expect(tile.textContent).toContain("2");
  });
});
