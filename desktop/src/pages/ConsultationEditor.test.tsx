import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AUTOSAVE_DELAY_MS, ConsultationPage } from "./ConsultationPage";
import * as api from "../desktop-api";
import { consultationDetail } from "../test/fixtures";

vi.mock("../desktop-api", () => ({ getConsultation: vi.fn(), saveConsultationDraft: vi.fn() }));

const mocked = vi.mocked(api);

function renderNew(extra: Partial<Parameters<typeof ConsultationPage>[0]> = {}) {
  const props = {
    id: "new",
    isNew: true,
    patientId: "7",
    patientName: "Amine Benali",
    reason: "Toux persistante",
    appointmentId: "a1",
    onSaved: vi.fn(async () => undefined),
    onClose: vi.fn(),
    onWritePrescription: vi.fn(),
    ...extra,
  };
  render(<ConsultationPage {...props} />);
  return props;
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
// Time moves, and the promises of the mocked native calls settle.
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const sentInput = (call = 0) => mocked.saveConsultationDraft.mock.calls[call][0];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 30, 10, 42, 0));
  mocked.saveConsultationDraft.mockReset();
  mocked.saveConsultationDraft.mockResolvedValue({ localId: "L1", operationId: "op-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the vital signs section", () => {
  it("shows the units in the fields and computes the BMI", () => {
    renderNew();
    const heading = screen.getByRole("heading", { name: "Constantes" });
    const section = heading.closest("section")!;
    expect(within(section).getAllByText("mmHg")).toHaveLength(2);
    for (const unit of ["bpm", "/min", "%", "°C", "kg", "cm"]) expect(within(section).getAllByText(unit).length).toBeGreaterThan(0);
    expect(section.querySelector("[data-bmi]")?.textContent).toBe("—");

    type(/^Poids/, "70");
    type(/^Taille/, "175");
    expect(section.querySelector("[data-bmi]")?.textContent).toBe("22,9 kg/m²");
  });

  it("points out abnormal values in words, not only in colour", () => {
    renderNew();
    type(/Tension systolique/, "150");
    type(/Tension diastolique/, "95");
    type(/Saturation en oxygène/, "92");
    type(/Température/, "38,4");
    const flags = within(screen.getByRole("list", { name: "Valeurs à surveiller" }));
    expect(flags.getByText("Tension élevée")).toBeTruthy();
    expect(flags.getByText("150/95 mmHg")).toBeTruthy();
    expect(flags.getByText("Saturation basse")).toBeTruthy();
    expect(flags.getByText("Fièvre")).toBeTruthy();
  });

  it("points out nothing for normal values", () => {
    renderNew();
    type(/Tension systolique/, "120");
    type(/Tension diastolique/, "80");
    type(/Saturation en oxygène/, "98");
    expect(screen.queryByRole("list", { name: "Valeurs à surveiller" })).toBeNull();
  });

  it("refuses an out-of-bounds value on the field itself, and saving on purpose is refused", async () => {
    renderNew();
    type(/Tension systolique/, "500");
    expect(screen.getByRole("alert").textContent).toBe("Tension systolique hors limites (40 à 300 mmHg).");
    expect(screen.getByLabelText(/Tension systolique/).getAttribute("aria-invalid")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer localement" }));
    await advance(0);
    expect(mocked.saveConsultationDraft).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("hors limites"))).toBe(true);
  });
});

describe("the diagnoses section", () => {
  it("lets the doctor add, remove and designate the main diagnosis: only one is main", () => {
    renderNew();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un diagnostic" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un diagnostic" }));
    type("Diagnostic 1", "Hypertension artérielle");
    type("Diagnostic 2", "Surpoids");
    type("Code CIM-10 1 (facultatif)", "I10");

    const radios = () => screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios().map((radio) => radio.checked)).toEqual([true, false]);
    fireEvent.click(radios()[1]);
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
    expect(screen.getByText("Principal")).toBeTruthy();
    expect(screen.getAllByText("Secondaire")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Supprimer le diagnostic 2" }));
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect((screen.getByRole("radio") as HTMLInputElement).checked).toBe(true);
  });
});

describe("saving on this device", () => {
  it("saves at most 10 s after the first unsaved change, once, and says when", async () => {
    renderNew();
    expect(screen.getByRole("status", { name: "" }).getAttribute("data-save-state")).toBe("clean");

    type("Motif", "Toux persistante depuis 3 jours");
    expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
    await advance(AUTOSAVE_DELAY_MS - 1_000);
    expect(mocked.saveConsultationDraft).not.toHaveBeenCalled();

    // More typing does not push the save back.
    type("Évaluation", "Bronchite probable");
    await advance(1_000);
    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(1);
    expect(sentInput().chiefComplaint).toBe("Toux persistante depuis 3 jours");
    expect(sentInput().assessment).toBe("Bronchite probable");
    expect(screen.getByText("Enregistré sur cet appareil à 10:42")).toBeTruthy();

    // Nothing changes, nothing is saved again.
    await advance(60_000);
    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(1);
  });

  it("saves when the doctor leaves a field", async () => {
    renderNew();
    type("Motif", "Fièvre");
    fireEvent.blur(screen.getByLabelText("Motif"));
    await advance(0);
    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Enregistré sur cet appareil à 10:42")).toBeTruthy();
  });

  it("sends only what the doctor touched, and the appointment it was started from", async () => {
    renderNew();
    type("Motif", "Fièvre");
    fireEvent.blur(screen.getByLabelText("Motif"));
    await advance(0);
    const first = sentInput();
    expect(first.appointmentId).toBe("a1");
    expect(first.patientId).toBe("7");
    expect("vitalSigns" in first).toBe(false);
    expect("diagnoses" in first).toBe(false);

    type(/Tension systolique/, "135");
    fireEvent.blur(screen.getByLabelText(/Tension systolique/));
    await advance(0);
    const second = sentInput(1);
    // The first save created the consultation: the second one updates it.
    expect(second.localId).toBe("L1");
    expect(second.vitalSigns).toEqual({ systolicBp: 135 });
    expect("diagnoses" in second).toBe(false);
  });

  it("saves the rest while a vital sign is still being typed invalid", async () => {
    renderNew();
    type("Motif", "Fièvre");
    type(/Tension systolique/, "5");
    fireEvent.blur(screen.getByLabelText("Motif"));
    await advance(0);
    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(1);
    expect(sentInput().chiefComplaint).toBe("Fièvre");
    expect("vitalSigns" in sentInput()).toBe(false);
  });

  it("an automatic save does not start a synchronization, saving on purpose does", async () => {
    const props = renderNew();
    type("Motif", "Fièvre");
    fireEvent.blur(screen.getByLabelText("Motif"));
    await advance(0);
    expect(props.onSaved).toHaveBeenLastCalledWith("auto");

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer localement" }));
    await advance(0);
    expect(props.onSaved).toHaveBeenLastCalledWith("manual");
  });

  it("saves what was typed before leaving the page", async () => {
    const props = renderNew();
    type("Motif", "Douleur lombaire");
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await advance(0);
    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(1);
    expect(sentInput().chiefComplaint).toBe("Douleur lombaire");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a French message when the save fails, and keeps what was typed", async () => {
    mocked.saveConsultationDraft.mockRejectedValueOnce("Outbox locale illisible.");
    renderNew();
    type("Motif", "Fièvre");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer localement" }));
    await advance(0);
    expect(screen.getByText("Enregistrement impossible")).toBeTruthy();
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("L’enregistrement sur cet appareil a échoué"))).toBe(true);
    expect((screen.getByLabelText("Motif") as HTMLTextAreaElement).value).toBe("Fièvre");
  });
});

describe("finishing the consultation", () => {
  it("needs clinical content", () => {
    renderNew({ reason: "" });
    expect((screen.getByRole("button", { name: "Terminer la consultation" }) as HTMLButtonElement).disabled).toBe(true);
    type("Motif", "Toux");
    expect((screen.getByRole("button", { name: "Terminer la consultation" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves it as ready to synchronize, then offers to write the prescription for the same patient", async () => {
    const props = renderNew();
    type("Motif", "Toux persistante");
    type(/Température/, "37,8");
    fireEvent.click(screen.getByRole("button", { name: "Terminer la consultation" }));
    await advance(0);

    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(1);
    expect(sentInput().localStatus).toBe("READY_TO_SYNC");
    expect(sentInput().vitalSigns).toEqual({ temperature: 37.8 });
    expect(props.onSaved).toHaveBeenLastCalledWith("finished");
    expect(screen.getByText("Prête à synchroniser")).toBeTruthy();

    const prompt = document.querySelector("[data-finished]") as HTMLElement;
    expect(prompt.textContent).toContain("Consultation terminée");
    fireEvent.click(within(prompt).getByRole("button", { name: "Rédiger l’ordonnance" }));
    expect(props.onWritePrescription).toHaveBeenCalledWith("7", "Amine Benali");
  });

  it("waits for a save in progress instead of losing the click (blur, then click on Terminer)", async () => {
    let release: (value: { localId: string; operationId: string }) => void = () => undefined;
    mocked.saveConsultationDraft.mockReset();
    mocked.saveConsultationDraft
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValue({ localId: "L1", operationId: "op-2" });
    const props = renderNew();
    type("Motif", "Toux");
    // The click on the button first makes the field lose the focus.
    fireEvent.blur(screen.getByLabelText("Motif"));
    fireEvent.click(screen.getByRole("button", { name: "Terminer la consultation" }));
    await advance(0);
    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(1);

    await act(async () => { release({ localId: "L1", operationId: "op-1" }); });
    await advance(0);
    expect(mocked.saveConsultationDraft).toHaveBeenCalledTimes(2);
    expect(sentInput(1).localStatus).toBe("READY_TO_SYNC");
    expect(sentInput(1).localId).toBe("L1");
    expect(props.onSaved).toHaveBeenLastCalledWith("finished");
    expect(document.querySelector("[data-finished]")).not.toBeNull();
  });
});

describe("reopening a consultation from the device", () => {
  it("shows the stored vital signs and diagnoses, and saving other fields does not resend them", async () => {
    mocked.getConsultation.mockResolvedValue(
      consultationDetail({
        appointmentId: "a1",
        vitalSigns: { systolicBp: 135, diastolicBp: 85, weightKg: 70.5, heightCm: 175 },
        diagnoses: [{ label: "Lombalgie", code: "M54.5", isPrimary: true }],
      }),
    );
    const props = renderNew({ id: "c1", isNew: false, reason: undefined, appointmentId: undefined, patientId: undefined, patientName: undefined });
    await advance(0);
    expect((screen.getByLabelText(/Tension systolique/) as HTMLInputElement).value).toBe("135");
    expect((screen.getByLabelText("Diagnostic 1") as HTMLInputElement).value).toBe("Lombalgie");
    expect(document.querySelector("[data-bmi]")?.textContent).toBe("23,0 kg/m²");

    type("Motif", "Douleur lombaire irradiant");
    fireEvent.blur(screen.getByLabelText("Motif"));
    await advance(0);
    const sent = sentInput();
    expect(sent.chiefComplaint).toBe("Douleur lombaire irradiant");
    expect(sent.localId).toBe("c1");
    expect(sent.appointmentId).toBe("a1");
    expect("vitalSigns" in sent).toBe(false);
    expect("diagnoses" in sent).toBe(false);
    expect(props.onSaved).toHaveBeenCalled();
  });
});
