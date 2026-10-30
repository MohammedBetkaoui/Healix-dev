import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PrescriptionPage } from "./PrescriptionPage";
import { PrescriptionView } from "./PrescriptionView";
import * as api from "../desktop-api";
import * as printer from "../print/print-html";
import { patient as fixturePatient } from "../test/fixtures";
import type { LocalPrescription, SessionStatus } from "../types";

vi.mock("../desktop-api", () => ({
  getLocalPatient: vi.fn(),
  getLocalPrescription: vi.fn(),
  listPrescriptions: vi.fn(),
  savePrescriptionDraft: vi.fn(),
  recordPrescriptionPrint: vi.fn(),
  searchLocalMedications: vi.fn(),
}));
vi.mock("../print/print-html", () => ({ printHtml: vi.fn(), downloadHtml: vi.fn() }));

const mocked = vi.mocked(api);
const print = vi.mocked(printer);

const session: SessionStatus = {
  authorized: true,
  user: {
    id: "u", fullName: "Dr Démonstration", email: "demo@healixdz.dz",
    prescriber: {
      fullName: "Dr Démonstration", speciality: "Médecine générale", registrationNumber: "34/1234",
      regionalCouncil: "Conseil régional de Sétif", professionalAddress: "12 rue des Frères Bouadou",
    },
  },
  workspace: {
    id: "w", name: "Cabinet",
    organization: { name: "Cabinet du Dr Démonstration", address: "12 rue des Frères Bouadou", wilaya: "Bordj Bou Arréridj", phone: "0550 12 34 56" },
  },
};
const withoutIdentity: SessionStatus = { authorized: true, user: { id: "u", fullName: "Dr X", email: "x@y.dz" }, workspace: { id: "w", name: "Cabinet" } };

const patientWith = (summary: Record<string, unknown> | null) =>
  fixturePatient("7", { firstName: "Amine", lastName: "Benali", birthDate: "1988-04-12T00:00:00.000Z", hospitalRecordNumber: "HD-1", medicalSummary: summary as never });

function renderNew(options: { summary?: Record<string, unknown> | null; session?: SessionStatus } = {}) {
  mocked.getLocalPatient.mockResolvedValue(patientWith(options.summary === undefined ? { allergies: [] } : options.summary));
  const onSaved = vi.fn(async () => undefined);
  render(<PrescriptionPage id="new" isNew patientId="7" patientName="Amine Benali" session={options.session ?? session} onSaved={onSaved} onClose={vi.fn()} />);
  return { onSaved };
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

// A complete first line, with the given medication.
function fillMedication(dci: string, strength = "500 mg") {
  type("DCI", dci);
  type("Dosage", strength);
  type("Forme pharmaceutique", "TABLET");
  type("Voie", "ORAL");
  type("Dose par prise", "1 comprimé");
  type("Fréquence", "2 fois par jour");
  type("Quantité", "1 boîte");
}

const saveButton = () => screen.getByRole("button", { name: /Enregistrer localement|Enregistrement…/ }) as HTMLButtonElement;
const printButton = () => screen.getByRole("button", { name: /Imprimer|Ouverture de l’impression…/ }) as HTMLButtonElement;

beforeEach(() => {
  for (const fn of Object.values(mocked)) (fn as ReturnType<typeof vi.fn>).mockReset();
  print.printHtml.mockReset();
  print.printHtml.mockResolvedValue(undefined);
  print.downloadHtml.mockReset();
  mocked.searchLocalMedications.mockResolvedValue([]);
  mocked.savePrescriptionDraft.mockResolvedValue({ localId: "L9", operationId: "op" });
  mocked.recordPrescriptionPrint.mockResolvedValue(undefined);
});

describe("safety checks in the editor", () => {
  it("shows an allergy under the medication and in the summary, and does not judge a line before it has a medication", async () => {
    renderNew({ summary: { allergies: ["Paracétamol"] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    // Nothing is said about an empty line.
    expect(document.querySelector("[data-item-alerts]")).toBeNull();

    fillMedication("paracetamol");
    const summary = within(document.querySelector("[data-safety-summary]") as HTMLElement);
    expect(summary.getByText(/Correspondance exacte avec une allergie structurée connue/)).toBeTruthy();
    expect(summary.getByText("1 alerte à lire", { exact: false })).toBeTruthy();
    expect(summary.getByText(/Ligne 1/)).toBeTruthy();
    const underItem = within(document.querySelector("[data-item-alerts]") as HTMLElement);
    expect(underItem.getByText("Critique")).toBeTruthy();
    expect(underItem.getByText("Correspondance exacte avec une allergie structurée connue.")).toBeTruthy();
  });

  it("shows duplication, regulation and dosing alerts on the right line", async () => {
    renderNew({ summary: { allergies: [] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un médicament" }));
    const dcis = screen.getAllByLabelText("DCI");
    fireEvent.change(dcis[1], { target: { value: "Paracétamol" } });
    fireEvent.change(screen.getAllByLabelText("Dosage")[1], { target: { value: "500 mg" } });
    fireEvent.change(screen.getAllByLabelText("Forme pharmaceutique")[1], { target: { value: "TABLET" } });

    const lists = Array.from(document.querySelectorAll("[data-item-alerts]"));
    expect(lists).toHaveLength(1);
    expect(lists[0].textContent).toContain("Médicament dupliqué dans cette ordonnance.");
    expect(lists[0].textContent).toContain("Posologie, fréquence ou quantité manquante.");
    expect(document.querySelector("[data-safety-summary]")?.textContent).toContain("Ligne 2");
  });

  it("points out a medication already in the patient's current treatments", async () => {
    renderNew({ summary: { allergies: [], currentMedications: ["Paracétamol 1 g, le soir"] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    const alert = document.querySelector("[data-alert-kind='CURRENT_MEDICATION']") as HTMLElement;
    expect(alert.textContent).toContain("Ce médicament figure déjà dans les traitements actuels du patient.");
    expect(alert.textContent).toContain("Paracétamol 1 g, le soir");
    // Attention, not a block.
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(document.querySelector("[data-allergy-confirmation]")).toBeNull();
  });

  it("says when the medical summary is missing", async () => {
    renderNew({ summary: null });
    const summary = await screen.findByRole("region", { name: "Contrôles de sécurité" });
    expect(summary.textContent).toContain("Résumé médical non renseigné.");
  });

  it("lists what is not evaluated", async () => {
    renderNew();
    const summary = await screen.findByRole("region", { name: "Contrôles de sécurité" });
    expect(summary.textContent).toContain("interactions");
    expect(summary.textContent).toContain("grossesse");
  });
});

describe("a known allergy blocks saving until the doctor confirms", () => {
  it("needs the box ticked and a reason, then records the confirmation with the save", async () => {
    renderNew({ summary: { allergies: ["Paracétamol"] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");

    expect(saveButton().disabled).toBe(true);
    const confirmation = within(document.querySelector("[data-allergy-confirmation]") as HTMLElement);
    expect(confirmation.getByText(/Allergie connue : Paracétamol/)).toBeTruthy();

    fireEvent.click(confirmation.getByRole("checkbox", { name: "Je confirme cette prescription malgré l’allergie connue" }));
    expect(saveButton().disabled).toBe(true); // a reason is required
    fireEvent.change(confirmation.getByLabelText("Motif de la confirmation (obligatoire)"), { target: { value: "  Tolérance démontrée depuis 10 ans  " } });
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());
    await waitFor(() => expect(mocked.savePrescriptionDraft).toHaveBeenCalledTimes(1));
    expect(mocked.savePrescriptionDraft.mock.calls[0][0].allergyOverride).toEqual({
      reason: "Tolérance démontrée depuis 10 ans",
      medications: ["Paracétamol"],
    });
  });

  it("a reason of two characters is not a reason", async () => {
    renderNew({ summary: { allergies: ["Paracétamol"] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    fireEvent.click(screen.getByRole("checkbox", { name: /Je confirme cette prescription/ }));
    fireEvent.change(screen.getByLabelText("Motif de la confirmation (obligatoire)"), { target: { value: "ok" } });
    expect(saveButton().disabled).toBe(true);
  });

  it("asks again when another allergic medication takes its place", async () => {
    renderNew({ summary: { allergies: ["Paracétamol", "Amoxicilline"] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    fireEvent.click(screen.getByRole("checkbox", { name: /Je confirme cette prescription/ }));
    fireEvent.change(screen.getByLabelText("Motif de la confirmation (obligatoire)"), { target: { value: "Tolérance démontrée" } });
    expect(saveButton().disabled).toBe(false);

    type("DCI", "Amoxicilline");
    expect((screen.getByRole("checkbox", { name: /Je confirme cette prescription/ }) as HTMLInputElement).checked).toBe(false);
    expect(saveButton().disabled).toBe(true);
  });

  it("does not ask, and sends no confirmation, without a known allergy", async () => {
    renderNew({ summary: { allergies: ["Pénicilline"] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    expect(document.querySelector("[data-allergy-confirmation]")).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocked.savePrescriptionDraft).toHaveBeenCalledTimes(1));
    expect("allergyOverride" in mocked.savePrescriptionDraft.mock.calls[0][0]).toBe(false);
  });
});

describe("printing a draft from the editor", () => {
  it("saves it first, notes the print, then opens the print dialog with the page of a draft", async () => {
    renderNew();
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");

    await waitFor(() => expect(printButton().disabled).toBe(false));
    fireEvent.click(printButton());
    await waitFor(() => expect(print.printHtml).toHaveBeenCalledTimes(1));

    expect(mocked.savePrescriptionDraft).toHaveBeenCalledTimes(1);
    expect(mocked.recordPrescriptionPrint).toHaveBeenCalledWith("L9");
    const html = print.printHtml.mock.calls[0][0];
    expect(html).toContain("<b>Établie hors ligne le");
    expect(html).toContain("numéro attribué lors de la synchronisation");
    expect(html).toContain("Benali");
    expect(html).toContain("34/1234");
    expect(html).toContain("1. Paracétamol");
    expect(html).not.toContain("Empreinte du contenu");
  });

  it("does not save again to print what is already saved", async () => {
    renderNew();
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocked.savePrescriptionDraft).toHaveBeenCalledTimes(1));

    fireEvent.click(printButton());
    await waitFor(() => expect(print.printHtml).toHaveBeenCalledTimes(1));
    expect(mocked.savePrescriptionDraft).toHaveBeenCalledTimes(1);
    expect(mocked.recordPrescriptionPrint).toHaveBeenCalledWith("L9");
  });

  it("cannot print while an allergy is unconfirmed, nor without the printed identity", async () => {
    renderNew({ summary: { allergies: ["Paracétamol"] } });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    expect(printButton().disabled).toBe(true);
    expect(printButton().title).toContain("confirmée malgré l’allergie connue");
  });

  it("explains that the prescriber's lines are missing, and prints nothing", async () => {
    renderNew({ session: withoutIdentity });
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    expect(printButton().disabled).toBe(true);
    expect(screen.getByText(/Les coordonnées du prescripteur ne sont pas disponibles sur cet appareil/)).toBeTruthy();
  });

  it("offers the same page as a file when the print dialog cannot be opened", async () => {
    print.printHtml.mockRejectedValue(new Error("blocked"));
    renderNew();
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    await waitFor(() => expect(printButton().disabled).toBe(false));
    fireEvent.click(printButton());

    expect(await screen.findByText(/L’impression n’a pas pu s’ouvrir sur cet ordinateur/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la version imprimable" }));
    expect(print.downloadHtml).toHaveBeenCalledTimes(1);
    expect(print.downloadHtml.mock.calls[0][0]).toContain("<h1>ORDONNANCE</h1>");
    expect(print.downloadHtml.mock.calls[0][1]).toBe("ordonnance-brouillon.html");
  });

  it("still prints, and says so, when the print could not be noted in the local journal", async () => {
    mocked.recordPrescriptionPrint.mockRejectedValue("Audit ordonnance non enregistré.");
    renderNew();
    await screen.findByRole("region", { name: "Contrôles de sécurité" });
    fillMedication("Paracétamol");
    await waitFor(() => expect(printButton().disabled).toBe(false));
    fireEvent.click(printButton());
    await waitFor(() => expect(print.printHtml).toHaveBeenCalled());
    expect(await screen.findByText(/n’a pas pu être notée dans le journal de cet appareil/)).toBeTruthy();
  });
});

const validated: LocalPrescription = {
  localId: "rx-1",
  serverId: "server-rx",
  patientId: "7",
  serverStatus: "VALIDATED",
  localStatus: "READ_ONLY",
  type: "STANDARD",
  number: "ORD-2026-000184",
  updatedAt: "2026-10-29T10:00:00.000Z",
  prescribedAt: "2026-10-29T09:55:00.000Z",
  contentFingerprint: "a".repeat(64),
  items: [{
    medicationId: "m", dci: "Amlodipine", brandName: "Amlor", strength: "5 mg", pharmaceuticalForm: "TABLET", route: "ORAL",
    regulatoryCategory: "STANDARD", dosePerIntake: "1 comprimé", frequency: "1 fois par jour", durationDays: 30, quantity: "1 boîte",
    asNeeded: false, renewalAllowed: false, substitutionAllowed: true,
  }],
};
const identity = { prescriber: session.user!.prescriber!, organization: session.workspace!.organization! };

describe("printing a validated prescription", () => {
  it("prints its official number and its fingerprint, and notes the print", async () => {
    render(<PrescriptionView prescription={validated} patientName="Amine Benali" patientLocked={false} patient={patientWith({ allergies: [] })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    await waitFor(() => expect(print.printHtml).toHaveBeenCalledTimes(1));
    const html = print.printHtml.mock.calls[0][0];
    expect(html).toContain("<b>N° ORD-2026-000184</b> · 29 octobre 2026");
    expect(html).toContain(`Empreinte du contenu : ${"a".repeat(64)}`);
    expect(html).not.toContain("Établie hors ligne");
    expect(mocked.recordPrescriptionPrint).toHaveBeenCalledWith("rx-1");
    expect(mocked.savePrescriptionDraft).not.toHaveBeenCalled();
  });

  it("has no Imprimer button for a canceled prescription, and a draft in conflict prints as a draft", () => {
    const { unmount } = render(
      <PrescriptionView prescription={{ ...validated, serverStatus: "CANCELED" }} patientName="Amine Benali" patientLocked={false} patient={patientWith(null)} identity={identity} />,
    );
    expect(screen.queryByRole("button", { name: "Imprimer" })).toBeNull();
    unmount();
    render(
      <PrescriptionView
        prescription={{ ...validated, serverStatus: "DRAFT", number: null, contentFingerprint: null, localStatus: "CONFLICT" }}
        patientName="Amine Benali" patientLocked={false} patient={patientWith(null)} identity={identity}
      />,
    );
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeTruthy();
  });

  it("is disabled, with the reason, while the patient is being read or the identity is missing", () => {
    render(<PrescriptionView prescription={validated} patientName="Amine Benali" patientLocked={false} patient={null} identity={{ prescriber: null, organization: null }} />);
    const button = screen.getByRole("button", { name: "Imprimer" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("coordonnées du prescripteur");
  });
});
