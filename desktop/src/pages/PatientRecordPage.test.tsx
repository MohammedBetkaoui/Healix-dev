import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PatientRecordPage } from "./PatientRecordPage";
import * as api from "../desktop-api";
import { consultationSummary, patient, prescriptionSummary } from "../test/fixtures";

vi.mock("../desktop-api", () => ({ listConsultations: vi.fn(), listPrescriptions: vi.fn() }));

beforeEach(() => {
  vi.mocked(api).listConsultations.mockResolvedValue([]);
  vi.mocked(api).listPrescriptions.mockResolvedValue([]);
});

function renderRecord(record = patient("1"), extra: Partial<Parameters<typeof PatientRecordPage>[0]> = {}) {
  const props = {
    patient: record,
    version: 0,
    offline: false,
    onNewConsultation: vi.fn(),
    onNewPrescription: vi.fn(),
    onOpenConsultation: vi.fn(),
    onOpenPrescription: vi.fn(),
    onOpenHealixAi: vi.fn(),
    ...extra,
  };
  render(<PatientRecordPage {...props} />);
  return props;
}

describe("PatientRecordPage", () => {
  it("always shows the allergies as red badges under the header", () => {
    renderRecord(patient("1", { medicalSummary: { allergies: ["Pénicilline", "Arachides"] } }));
    const band = document.querySelector("[data-allergies]") as HTMLElement;
    expect(band.textContent).toContain("Pénicilline");
    expect(band.textContent).toContain("Arachides");
    expect(band.querySelectorAll("li")).toHaveLength(2);
    expect(band.querySelector("li")?.className).toContain("var(--danger-soft)");
    expect(band.textContent).not.toContain("Aucune allergie connue");
  });

  it("says so when no allergy is known", () => {
    renderRecord(patient("1", { medicalSummary: { allergies: [] } }));
    expect((document.querySelector("[data-allergies]") as HTMLElement).textContent).toContain("Aucune allergie connue");
  });

  it("shows the header: Arabic name, age, sex, blood group and record number", () => {
    renderRecord(patient("1", {
      firstName: "Amine", lastName: "Benali", firstNameAr: "أمين", lastNameAr: "بن علي",
      gender: "MALE", bloodGroup: "A+", hospitalRecordNumber: "HD-2026-00412",
    }));
    expect(screen.getByRole("heading", { level: 1, name: "Amine Benali" })).toBeTruthy();
    expect(screen.getByText("أمين بن علي").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("Homme")).toBeTruthy();
    expect(screen.getAllByText("A+").length).toBeGreaterThan(0);
    expect(screen.getByText("HD-2026-00412")).toBeTruthy();
    expect(screen.getByText(/\d+ ans/)).toBeTruthy();
  });

  it("fills the Consultations tab from the patient's consultations", async () => {
    vi.mocked(api).listConsultations.mockResolvedValue([
      consultationSummary("c1", "1", { chiefComplaint: "Toux" }),
      consultationSummary("c2", "1", { chiefComplaint: "Suivi", state: "SYNCED", editable: false }),
    ]);
    const props = renderRecord();
    await screen.findByText("2", { selector: ".team-tab-count" });
    expect(api.listConsultations).toHaveBeenCalledWith("1");
    fireEvent.click(screen.getByRole("button", { name: /^Consultations/ }));
    expect(await screen.findByText("Reprendre")).toBeTruthy();
    expect(screen.getByText("Voir")).toBeTruthy();
    fireEvent.click(screen.getByText("Suivi"));
    expect(props.onOpenConsultation).toHaveBeenCalledWith("c2");
  });

  it("shows an empty Consultations tab with an action to create one", async () => {
    const props = renderRecord();
    fireEvent.click(screen.getByRole("button", { name: /^Consultations/ }));
    expect(await screen.findByText("Aucune consultation sur cet appareil")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle consultation" }));
    expect(props.onNewConsultation).toHaveBeenCalled();
  });

  it("lists the prescriptions and opens one", async () => {
    vi.mocked(api).listPrescriptions.mockResolvedValue([prescriptionSummary("r1", "1", { serverStatus: "VALIDATED", number: "ORD-1" })]);
    const props = renderRecord();
    fireEvent.click(screen.getByRole("button", { name: /^Ordonnances/ }));
    expect(await screen.findByText("Validée")).toBeTruthy();
    expect(screen.getByText("Voir")).toBeTruthy();
    fireEvent.click(screen.getByText("ORD-1"));
    expect(props.onOpenPrescription).toHaveBeenCalledWith("r1");
  });

  it("replaces the fixed AI block with a Web card, disabled offline", () => {
    const { onOpenHealixAi } = renderRecord(patient("1"), { offline: true });
    expect(screen.queryByText("Analyse IA indisponible hors connexion")).toBeNull();
    expect(screen.getAllByText("Analyses IA sur HealixDz Web").length).toBeGreaterThan(0);
    const button = screen.getByRole("button", { name: "Ouvrir le dossier sur HealixDz Web" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Nécessite une connexion Internet");
    fireEvent.click(button);
    expect(onOpenHealixAi).not.toHaveBeenCalled();
  });

  it("opens the patient's Web page online", () => {
    const { onOpenHealixAi } = renderRecord();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le dossier sur HealixDz Web" }));
    expect(onOpenHealixAi).toHaveBeenCalled();
  });
});
