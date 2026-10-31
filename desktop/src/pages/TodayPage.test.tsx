import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TodayPage } from "./TodayPage";
import * as api from "../desktop-api";
import { appointment, consultationSummary, inHours, online, patient, prescriptionSummary } from "../test/fixtures";

vi.mock("../desktop-api", () => ({
  listAppointments: vi.fn(),
  listConsultations: vi.fn(),
  listPrescriptions: vi.fn(),
  listAiReports: vi.fn(),
}));

const mocked = vi.mocked(api);

function renderToday(overrides: Partial<Parameters<typeof TodayPage>[0]> = {}) {
  const props = {
    name: "Dr Démonstration",
    sync: online,
    version: 0,
    recentPatients: [patient("9")],
    onOpenPatient: vi.fn(),
    onOpenPatientAi: vi.fn(),
    onStartConsultation: vi.fn(),
    onOpenConsultation: vi.fn(),
    onOpenPrescription: vi.fn(),
    ...overrides,
  };
  render(<TodayPage {...props} />);
  return props;
}

beforeEach(() => {
  mocked.listAppointments.mockResolvedValue([]);
  mocked.listConsultations.mockResolvedValue([]);
  mocked.listPrescriptions.mockResolvedValue([]);
  mocked.listAiReports.mockResolvedValue([]);
});

describe("TodayPage", () => {
  it("lists the day's appointments with the next one highlighted, and starts a consultation from it", async () => {
    const past = appointment("a1", "1", { scheduledAt: inHours(-3), reason: "Suivi" });
    const next = appointment("a2", "2", { scheduledAt: inHours(2), reason: "Fièvre", status: "CONFIRMED", durationMinutes: 45 });
    mocked.listAppointments.mockResolvedValue([past, next]);
    // The first patient was already seen that day.
    mocked.listConsultations.mockResolvedValue([consultationSummary("c1", "1", { date: past.scheduledAt, state: "SYNCED", editable: false })]);
    const props = renderToday();

    await screen.findByText("Fièvre · 45 min");
    expect(screen.getByText("Confirmé")).toBeTruthy();
    expect(screen.getByText("Prochain rendez-vous")).toBeTruthy();
    expect(screen.getByText("Consultation faite")).toBeTruthy();
    expect(document.querySelectorAll("[data-highlighted]")).toHaveLength(1);

    const start = screen.getAllByRole("button", { name: "Démarrer la consultation" });
    expect(start).toHaveLength(1);
    fireEvent.click(start[0]);
    expect(props.onStartConsultation).toHaveBeenCalledWith(next);
  });

  it("counts the day's appointments in the first tile", async () => {
    mocked.listAppointments.mockResolvedValue([appointment("a1", "1"), appointment("a2", "2")]);
    renderToday();
    await screen.findByText("Rendez-vous aujourd’hui");
    await waitFor(() => expect(screen.getAllByText("2").length).toBeGreaterThan(0));
    expect(screen.queryByText("Patients sur l’appareil")).toBeNull();
  });

  it("shows an explicit empty state without appointments", async () => {
    renderToday();
    expect(await screen.findByText("Aucun rendez-vous aujourd’hui", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Démarrer la consultation" })).toBeNull();
    expect(screen.getByText("Rien à terminer")).toBeTruthy();
  });

  it("offers to resume the unfinished drafts", async () => {
    mocked.listConsultations.mockResolvedValue([
      consultationSummary("c1", "1"),
      consultationSummary("c2", "2", { state: "SYNCED", editable: false }),
    ]);
    mocked.listPrescriptions.mockResolvedValue([prescriptionSummary("r1", "3")]);
    const props = renderToday();

    const resume = await screen.findAllByText("Reprendre");
    expect(resume).toHaveLength(2);
    fireEvent.click(screen.getByText(/Consultation · Toux/));
    expect(props.onOpenConsultation).toHaveBeenCalledWith("c1");
    fireEvent.click(screen.getByText(/Ordonnance · Paracétamol/));
    expect(props.onOpenPrescription).toHaveBeenCalledWith("r1");
  });

  it("shows the offline banner when offline", async () => {
    renderToday({ sync: { ...online, state: "OFFLINE" } });
    expect(await screen.findByText("Hors ligne — vos modifications seront synchronisées au retour de la connexion.")).toBeTruthy();
  });

  it("shows a loading skeleton, not a blank page, while the lists load", () => {
    mocked.listAppointments.mockReturnValue(new Promise(() => undefined));
    mocked.listConsultations.mockReturnValue(new Promise(() => undefined));
    mocked.listPrescriptions.mockReturnValue(new Promise(() => undefined));
    renderToday();
    expect(document.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("status", { name: "Chargement" }).length).toBeGreaterThan(0);
  });

  it("shows no banner online", async () => {
    renderToday();
    await screen.findByText("Rien à terminer");
    expect(document.querySelector("[data-offline-banner]")).toBeNull();
  });

  it("shows a French message when a list cannot be read", async () => {
    mocked.listAppointments.mockRejectedValue("Autorisation offline expirée ou invalide.");
    renderToday();
    // The engine's message is shown as the plain sentence of fr.errors.
    expect(await screen.findByText("Votre autorisation hors ligne est expirée ou invalide. Reconnectez-vous en ligne.")).toBeTruthy();
  });
});

describe("TodayPage: an appointment whose consultation is only a draft", () => {
  it("offers to resume the draft instead of saying the consultation is done", async () => {
    const slot = appointment("a1", "1", { scheduledAt: inHours(-1), reason: "Toux" });
    mocked.listAppointments.mockResolvedValue([slot]);
    mocked.listConsultations.mockResolvedValue([consultationSummary("draft-1", "1", { date: slot.scheduledAt })]);
    const props = renderToday();

    const resume = await screen.findByRole("button", { name: "Reprendre la consultation" });
    expect(screen.queryByText("Consultation faite")).toBeNull();
    expect(screen.queryByRole("button", { name: "Démarrer la consultation" })).toBeNull();
    fireEvent.click(resume);
    expect(props.onOpenConsultation).toHaveBeenCalledWith("draft-1");
  });
});
