import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TodayPage } from "./TodayPage";
import * as api from "../desktop-api";
import { appointment, consultationSummary, inHours, online, patient, prescriptionSummary } from "../test/fixtures";

vi.mock("../desktop-api", () => ({
  listAppointments: vi.fn(),
  listConsultations: vi.fn(),
  listPrescriptions: vi.fn(),
}));

const mocked = vi.mocked(api);

function renderToday(overrides: Partial<Parameters<typeof TodayPage>[0]> = {}) {
  const props = {
    name: "Dr Démonstration",
    sync: online,
    version: 0,
    recentPatients: [patient("9")],
    onOpenPatient: vi.fn(),
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
});

describe("TodayPage", () => {
  it("lists the day's appointments with the next one highlighted, and starts a consultation from it", async () => {
    const past = appointment("a1", "1", { scheduledAt: inHours(-3), reason: "Suivi" });
    const next = appointment("a2", "2", { scheduledAt: inHours(2), reason: "Fièvre", status: "CONFIRMED", durationMinutes: 45 });
    mocked.listAppointments.mockResolvedValue([past, next]);
    // The first patient was already seen that day.
    mocked.listConsultations.mockResolvedValue([consultationSummary("c1", "1", { date: past.scheduledAt })]);
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

  it("shows no banner online", async () => {
    renderToday();
    await screen.findByText("Rien à terminer");
    expect(document.querySelector("[data-offline-banner]")).toBeNull();
  });

  it("shows a French message when a list cannot be read", async () => {
    mocked.listAppointments.mockRejectedValue("Autorisation offline expirée ou invalide.");
    renderToday();
    expect(await screen.findByText("Autorisation offline expirée ou invalide.")).toBeTruthy();
  });
});
