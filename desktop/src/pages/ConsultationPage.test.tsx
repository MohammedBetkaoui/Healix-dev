import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsultationPage } from "./ConsultationPage";
import * as api from "../desktop-api";
import { consultationDetail } from "../test/fixtures";

vi.mock("../desktop-api", () => ({ getConsultation: vi.fn(), saveConsultationDraft: vi.fn() }));

const noop = async () => undefined;

beforeEach(() => {
  vi.mocked(api).getConsultation.mockReset();
});

describe("ConsultationPage", () => {
  it("starts a new consultation with the patient and the appointment's reason already filled in", () => {
    render(
      <ConsultationPage id="new" isNew patientId="7" patientName="Amine Benali" reason="Toux persistante" onSaved={noop} onClose={vi.fn()} onWritePrescription={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "Amine Benali" })).toBeTruthy();
    expect((screen.getByLabelText("Motif") as HTMLTextAreaElement).value).toBe("Toux persistante");
    expect(screen.getByRole("button", { name: "Enregistrer localement" })).toBeTruthy();
    expect(api.getConsultation).not.toHaveBeenCalled();
  });

  it("reopens a local draft for editing", async () => {
    vi.mocked(api).getConsultation.mockResolvedValue(consultationDetail({ assessment: "Bronchite probable" }));
    render(<ConsultationPage id="c1" isNew={false} onSaved={noop} onClose={vi.fn()} onWritePrescription={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Enregistrer localement" })).toBeTruthy();
    expect((screen.getByLabelText("Évaluation") as HTMLTextAreaElement).value).toBe("Bronchite probable");
  });

  it("shows a synchronized consultation read-only, with vitals and diagnoses", async () => {
    vi.mocked(api).getConsultation.mockResolvedValue(
      consultationDetail({
        editable: false,
        state: "SYNCED",
        localStatus: "SYNCED",
        vitalSigns: { heartRate: 72, temperature: 37.2 },
        diagnoses: [{ label: "Bronchite aiguë", isPrimary: true }],
      }),
    );
    render(<ConsultationPage id="c1" isNew={false} onSaved={noop} onClose={vi.fn()} onWritePrescription={vi.fn()} />);

    expect(await screen.findByText("Lecture seule : cette consultation est enregistrée sur le serveur.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer localement" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getAllByText("Toux persistante").length).toBeGreaterThan(0);
    expect(screen.getByText("Bronchite aiguë")).toBeTruthy();
    expect(screen.getByText("Principal")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText("Synchronisée")).toBeTruthy();
  });

  it("explains a conflict instead of offering an edit", async () => {
    vi.mocked(api).getConsultation.mockResolvedValue(consultationDetail({ editable: false, state: "CONFLICT", localStatus: "CONFLICT" }));
    render(<ConsultationPage id="c1" isNew={false} onSaved={noop} onClose={vi.fn()} onWritePrescription={vi.fn()} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Conflit à résoudre");
    expect(screen.queryByRole("button", { name: "Enregistrer localement" })).toBeNull();
  });

  it("shows a French message when the consultation cannot be read", async () => {
    vi.mocked(api).getConsultation.mockRejectedValue("Consultation locale introuvable.");
    render(<ConsultationPage id="gone" isNew={false} onSaved={noop} onClose={vi.fn()} onWritePrescription={vi.fn()} />);
    expect(await screen.findByText("Consultation locale introuvable.")).toBeTruthy();
  });
});

describe("ConsultationView: vital signs, BMI and diagnoses", () => {
  it("shows the units, the BMI and the values to watch", async () => {
    vi.mocked(api).getConsultation.mockResolvedValue(
      consultationDetail({
        editable: false,
        state: "SYNCED",
        localStatus: "SYNCED",
        vitalSigns: { systolicBp: 150, diastolicBp: 95, temperature: 38.4, weightKg: 70, heightCm: 175 },
        diagnoses: [{ label: "Hypertension artérielle", code: "I10", isPrimary: true }, { label: "Surpoids" }],
      }),
    );
    render(<ConsultationPage id="c1" isNew={false} onSaved={noop} onClose={vi.fn()} onWritePrescription={vi.fn()} />);

    expect(await screen.findByText("Lecture seule : cette consultation est enregistrée sur le serveur.")).toBeTruthy();
    expect(document.querySelector("[data-bmi]")?.textContent).toBe("22,9 kg/m²");
    expect(screen.getByText("38,4")).toBeTruthy();
    expect(screen.getAllByText("°C").length).toBeGreaterThan(0);
    const watch = screen.getByRole("list", { name: "Valeurs à surveiller" });
    expect(watch.textContent).toContain("Tension élevée");
    expect(watch.textContent).toContain("Fièvre");
    expect(screen.getByText("I10")).toBeTruthy();
    expect(screen.getByText("Principal")).toBeTruthy();
  });
});
