import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import * as api from "./desktop-api";
import { appointment, consultationDetail, consultationSummary, inHours, online, patient } from "./test/fixtures";

vi.mock("./desktop-api", () => ({
  API_BASE: "https://api.example.test/api",
  sessionStatus: vi.fn(),
  listLocalPatients: vi.fn(),
  getSyncStatus: vi.fn(),
  listAppointments: vi.fn(),
  listConsultations: vi.fn(),
  listPrescriptions: vi.fn(),
  getConsultation: vi.fn(),
  saveConsultationDraft: vi.fn(),
  syncNow: vi.fn(),
  logoutLocal: vi.fn(),
  loginAndBootstrap: vi.fn(),
}));

const mocked = vi.mocked(api);

beforeEach(() => {
  mocked.sessionStatus.mockResolvedValue({
    authorized: true,
    workspace: { id: "w", name: "Cabinet" },
    user: { id: "u", fullName: "Dr Démonstration", email: "d@x.dz" },
  });
  mocked.listLocalPatients.mockResolvedValue([patient("7", { firstName: "Amine", lastName: "Benali" })]);
  mocked.getSyncStatus.mockResolvedValue(online);
  mocked.listAppointments.mockResolvedValue([
    appointment("a1", "7", { patientName: "Amine Benali", reason: "Toux persistante", scheduledAt: inHours(1) }),
  ]);
  mocked.listConsultations.mockResolvedValue([]);
  mocked.listPrescriptions.mockResolvedValue([]);
  mocked.syncNow.mockResolvedValue(online);
});

describe("App routing", () => {
  it("opens on Aujourd'hui and lands in the editor, patient and reason filled in, from 'Démarrer la consultation'", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Démarrer la consultation" }));

    expect(await screen.findByRole("button", { name: "Enregistrer localement" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Amine Benali" })).toBeTruthy();
    expect((screen.getByLabelText("Motif") as HTMLTextAreaElement).value).toBe("Toux persistante");
    // The sidebar follows the page, and the detail view has a way back.
    expect(screen.getByRole("button", { name: "Consultations" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Retour" })).toBeTruthy();
  });

  it("'Retour' leads back to where the consultation was opened from", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Démarrer la consultation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retour" }));
    expect(await screen.findByText("Rendez-vous du jour")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retour" })).toBeNull();
  });

  it("opens a local draft from the Consultations page for editing, and a synchronized one read-only", async () => {
    mocked.listConsultations.mockResolvedValue([
      consultationSummary("draft", "7", { chiefComplaint: "Brouillon en cours" }),
      consultationSummary("synced", "7", { chiefComplaint: "Déjà synchronisée", state: "SYNCED", editable: false }),
    ]);
    mocked.getConsultation.mockImplementation(async (id) =>
      id === "draft"
        ? consultationDetail({ localId: "draft", chiefComplaint: "Brouillon en cours", patientId: "7", patientName: "Amine Benali" })
        : consultationDetail({ localId: "synced", editable: false, state: "SYNCED", localStatus: "SYNCED", chiefComplaint: "Déjà synchronisée", patientId: "7", patientName: "Amine Benali" }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultations" }));

    fireEvent.click(await screen.findByText("Brouillon en cours"));
    expect(await screen.findByRole("button", { name: "Enregistrer localement" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));

    fireEvent.click(await screen.findByText("Déjà synchronisée"));
    expect(await screen.findByText(/Lecture seule : cette consultation/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer localement" })).toBeNull();
  });

  it("shows the sidebar's Patients entry with the device count, and the patient list", async () => {
    render(<App />);
    const entry = await screen.findByRole("button", { name: /^Patients, 1 patient/ });
    fireEvent.click(entry);
    expect(await screen.findByRole("heading", { level: 1, name: "Dossiers patients" })).toBeTruthy();
    expect(screen.getAllByText("Amine Benali").length).toBeGreaterThan(0);
    expect(within(document.querySelector("#clinical-sidebar") as HTMLElement).getByRole("button", { name: /^Patients/ }).getAttribute("aria-current")).toBe("page");
  });
});
