import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PatientRecordPage } from "./PatientRecordPage";
import { TodayPage } from "./TodayPage";
import { SyncPage } from "./SyncPage";
import { AUTOSAVE_DELAY_MS, ConsultationPage } from "./ConsultationPage";
import * as api from "../desktop-api";
import { aiReport, appointment, online, patient } from "../test/fixtures";
import type { SyncStatus } from "../types";

// The AI results on the three pages that show them: the record's tab, the
// consultation's context panel and the home page. Everything is read from the
// device (listAiReports); nothing here reaches the network.
vi.mock("../desktop-api", () => ({
  listConsultations: vi.fn(),
  listPrescriptions: vi.fn(),
  listAppointments: vi.fn(),
  listAiReports: vi.fn(),
  getConsultation: vi.fn(),
  saveConsultationDraft: vi.fn(),
}));

const mocked = vi.mocked(api);

beforeEach(() => {
  mocked.listAiReports.mockClear();
  mocked.saveConsultationDraft.mockClear();
  mocked.listConsultations.mockResolvedValue([]);
  mocked.listPrescriptions.mockResolvedValue([]);
  mocked.listAppointments.mockResolvedValue([]);
  mocked.listAiReports.mockResolvedValue([]);
  mocked.saveConsultationDraft.mockResolvedValue({ localId: "L1", operationId: "op-1" });
});

describe("the Analyses IA tab of a record", () => {
  function renderRecord(extra: Partial<Parameters<typeof PatientRecordPage>[0]> = {}) {
    const props = {
      patient: patient("1"),
      version: 0,
      offline: false,
      onNewConsultation: vi.fn(),
      onNewPrescription: vi.fn(),
      onOpenConsultation: vi.fn(),
      onOpenPrescription: vi.fn(),
      onOpenHealixAi: vi.fn(),
      onOpenAiRun: vi.fn(),
      ...extra,
    };
    render(<PatientRecordPage {...props} />);
    return props;
  }

  it("counts the results in the tab and lists them, asking only for this patient", async () => {
    mocked.listAiReports.mockResolvedValue([aiReport("r1", "1"), aiReport("r2", "1", { pipeline: "pathology-breast", moduleLabel: "Pathologie mammaire" })]);
    renderRecord();
    const tab = screen.getByRole("button", { name: /^Analyses IA/ });
    await waitFor(() => expect(within(tab).getByText("2")).toBeTruthy());
    expect(mocked.listAiReports).toHaveBeenCalledWith("1");

    fireEvent.click(tab);
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("Outil d’assistance. L’interprétation et la validation restent médicales.")).toBeTruthy();
  });

  it("opens straight on this tab when it is asked for (from the home page)", async () => {
    mocked.listAiReports.mockResolvedValue([aiReport("r1", "1")]);
    renderRecord({ initialTab: "AI" });
    expect(await screen.findByRole("article")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Analyses IA/ }).getAttribute("aria-current")).toBe("page");
  });

  it("says that nothing was validated, with the way to Healix AI", async () => {
    const props = renderRecord();
    fireEvent.click(screen.getByRole("button", { name: /^Analyses IA/ }));
    expect(await screen.findByText("Aucun résultat IA validé pour ce patient")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir Healix AI sur HealixDz Web" }));
    expect(props.onOpenHealixAi).toHaveBeenCalled();
  });

  it("opens an analysis on the Web platform online, and not offline", async () => {
    mocked.listAiReports.mockResolvedValue([aiReport("run-7", "1")]);
    const online = renderRecord({ initialTab: "AI" });
    fireEvent.click(await screen.findByRole("button", { name: "Ouvrir sur HealixDz Web" }));
    expect(online.onOpenAiRun).toHaveBeenCalledWith("run-7");
  });

  it("keeps the results readable while offline, the Web button disabled", async () => {
    mocked.listAiReports.mockResolvedValue([aiReport("run-7", "1")]);
    const props = renderRecord({ initialTab: "AI", offline: true });
    const button = (await screen.findByRole("button", { name: "Ouvrir sur HealixDz Web" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Gliome", { selector: "[data-conclusion] p" })).toBeTruthy();
    fireEvent.click(button);
    expect(props.onOpenAiRun).not.toHaveBeenCalled();
  });
});

describe("the AI context of a consultation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 10, 42, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

  async function renderEditor(reports = [aiReport("r1", "7", { decidedAt: "2026-10-28T12:00:00.000Z" })], reason = "Toux persistante") {
    mocked.listAiReports.mockResolvedValue(reports);
    render(
      <ConsultationPage id="new" isNew patientId="7" patientName="Amine Benali" reason={reason} onSaved={async () => undefined} onClose={vi.fn()} onWritePrescription={vi.fn()} />,
    );
    await settle();
  }

  const assessment = () => (screen.getByLabelText("Évaluation") as HTMLTextAreaElement);
  const toggle = () => screen.getByRole("button", { name: /^Contexte IA/ });

  it("asks for this patient's results, and is folded away until opened", async () => {
    await renderEditor();
    expect(mocked.listAiReports).toHaveBeenCalledWith("7");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /Citer dans l’évaluation/ })).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Gliome")).toBeTruthy();
    expect(screen.getByText("Outil d’assistance. L’interprétation et la validation restent médicales.")).toBeTruthy();
  });

  it("is not there for a patient without validated results", async () => {
    await renderEditor([]);
    expect(screen.queryByRole("button", { name: /^Contexte IA/ })).toBeNull();
  });

  it("shows the 3 latest results, the newest first", async () => {
    await renderEditor([
      aiReport("old", "7", { moduleLabel: "Ancienne" }, 30),
      aiReport("c", "7", { moduleLabel: "Récente C" }, 2),
      aiReport("a", "7", { moduleLabel: "Récente A" }, 1),
      aiReport("b", "7", { moduleLabel: "Récente B" }, 5),
    ]);
    fireEvent.click(toggle());
    const rows = screen.getAllByRole("listitem").filter((row) => row.hasAttribute("data-specialty"));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => /Récente (\w)/.exec(row.textContent!)?.[1])).toEqual(["A", "C", "B"]);
    expect(screen.queryByText(/Ancienne/)).toBeNull();
    expect(within(toggle()).getByText("3")).toBeTruthy();
  });

  it("inserts nothing by itself", async () => {
    await renderEditor();
    fireEvent.click(toggle());
    expect(assessment().value).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2); });
    expect(assessment().value).toBe("");
    expect(mocked.saveConsultationDraft).not.toHaveBeenCalled();
  });

  it("cites the result at the end of the assessment, dated and sourced, without erasing what was typed", async () => {
    await renderEditor();
    fireEvent.change(assessment(), { target: { value: "Bronchite aiguë probable." } });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /Citer dans l’évaluation/ }));
    expect(assessment().value).toBe(
      "Bronchite aiguë probable.\nAnalyse IA (IRM cérébrale, 28/10/2026, validée par Dr Démonstration, rapport CR-IA-2026-000123) : gliome.",
    );
  });

  it("cites into an empty assessment, and the doctor can edit the sentence like any text", async () => {
    await renderEditor();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /Citer dans l’évaluation/ }));
    expect(assessment().value).toMatch(/^Analyse IA \(IRM cérébrale, 28\/10\/2026, validée par Dr Démonstration, rapport CR-IA-2026-000123\) : gliome\.$/);
    fireEvent.change(assessment(), { target: { value: `${assessment().value} À confirmer par IRM de contrôle.` } });
    expect(assessment().value).toContain("gliome. À confirmer par IRM de contrôle.");
  });

  it("does not cite the same result twice", async () => {
    await renderEditor();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /Citer dans l’évaluation/ }));
    const once = assessment().value;
    const done = screen.getByRole("button", { name: /Déjà citée dans l’évaluation/ }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.click(done);
    expect(assessment().value).toBe(once);
  });

  it("the citation is part of what is saved, like any typed text", async () => {
    await renderEditor();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /Citer dans l’évaluation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer localement" }));
    await settle();
    expect(mocked.saveConsultationDraft.mock.calls[0][0].assessment).toContain("Analyse IA (IRM cérébrale");
  });
});

describe("the AI results of the home page", () => {
  function renderToday(extra: Partial<Parameters<typeof TodayPage>[0]> = {}) {
    const props = {
      name: "Dr Démonstration",
      sync: online,
      version: 0,
      recentPatients: [patient("9", { firstName: "Karim", lastName: "Haddad" })],
      onOpenPatient: vi.fn(),
      onOpenPatientAi: vi.fn(),
      onStartConsultation: vi.fn(),
      onOpenConsultation: vi.fn(),
      onOpenPrescription: vi.fn(),
      ...extra,
    };
    render(<TodayPage {...props} />);
    return props;
  }

  it("lists the results of the day's patients and of the recent patients, and nobody else's", async () => {
    mocked.listAppointments.mockResolvedValue([appointment("a1", "1", { patientName: "Amine Benali" })]);
    mocked.listAiReports.mockResolvedValue([
      aiReport("r1", "1"),
      aiReport("r9", "9", { pipeline: "pathology-breast", moduleLabel: "Pathologie mammaire", decisionLabel: "benign" }),
      aiReport("r5", "5", { moduleLabel: "Patient absent de la journée" }),
    ]);
    renderToday();
    const section = (await screen.findByRole("heading", { name: "Résultats IA récents" })).closest("section") as HTMLElement;
    await within(section).findByText("Amine Benali");
    expect(within(section).getByText("Karim Haddad")).toBeTruthy();
    expect(within(section).queryByText(/Patient absent/)).toBeNull();
    expect(section.textContent).toContain("IRM cérébrale · Gliome");
    expect(section.textContent).toContain("Pathologie mammaire · Bénin");
  });

  it("asks for the results decided in the last 7 days only", async () => {
    const before = Date.now();
    renderToday();
    await screen.findByRole("heading", { name: "Résultats IA récents" });
    await waitFor(() => expect(mocked.listAiReports).toHaveBeenCalled());
    const [patientId, since] = mocked.listAiReports.mock.calls[0];
    expect(patientId).toBeNull();
    const sinceMs = new Date(since as string).getTime();
    expect(Math.abs(before - 7 * 86_400_000 - sinceMs)).toBeLessThan(60_000);
  });

  it("leads to the Analyses IA tab of the record", async () => {
    mocked.listAppointments.mockResolvedValue([appointment("a1", "1", { patientName: "Amine Benali" })]);
    mocked.listAiReports.mockResolvedValue([aiReport("r1", "1")]);
    const props = renderToday();
    const section = (await screen.findByRole("heading", { name: "Résultats IA récents" })).closest("section") as HTMLElement;
    fireEvent.click(await within(section).findByRole("button", { name: /Amine Benali/ }));
    expect(props.onOpenPatientAi).toHaveBeenCalledWith("1");
    expect(props.onOpenPatient).not.toHaveBeenCalled();
  });

  it("has an explicit empty state", async () => {
    renderToday();
    expect(await screen.findByText("Aucun résultat IA récent")).toBeTruthy();
  });
});

describe("the Synchronisation page", () => {
  const status = (extra: Partial<SyncStatus>): SyncStatus => ({ ...online, ...extra });

  it("shows when the AI results were last updated", () => {
    render(<SyncPage status={status({ aiReportsSyncedAt: "2026-10-30T09:12:00.000Z" })} onSync={vi.fn()} />);
    const line = screen.getByLabelText("Résultats IA");
    expect(line.textContent).toContain("Dernière mise à jour des résultats IA");
    expect(line.textContent).not.toContain("Pas encore reçus");
    expect(line.getAttribute("data-ai-sync")).toBe("ok");
    expect(screen.queryByText("Résultats IA non mis à jour")).toBeNull();
  });

  it("says so when they have not been received yet", () => {
    render(<SyncPage status={status({ aiReportsSyncedAt: null })} onSync={vi.fn()} />);
    expect(screen.getByLabelText("Résultats IA").textContent).toContain("Pas encore reçus");
  });

  it("warns that the AI results were not updated, without calling the synchronization a failure", () => {
    render(<SyncPage status={status({ aiReportsFailed: true, aiReportsSyncedAt: "2026-10-29T09:12:00.000Z" })} onSync={vi.fn()} />);
    expect(screen.getByText("Résultats IA non mis à jour")).toBeTruthy();
    expect(screen.getByLabelText("Résultats IA").getAttribute("data-ai-sync")).toBe("failed");
    // The synchronization itself is reported as it is: online.
    expect(screen.getAllByText("En ligne").length).toBeGreaterThan(0);
  });
});
