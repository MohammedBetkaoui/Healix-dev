import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AiReportCard, AiReportsPanel } from "./AiReportCard";
import { aiReport } from "../test/fixtures";
import type { AiReport } from "../types";

const volumetry = (lvef: number) =>
  aiReport("v1", "p1", {
    pipeline: "cardio-volume-mri",
    moduleLabel: "IRM cardiaque (volumes et FEVG)",
    decisionLabel: null,
    modelDecision: null,
    topPredictions: [],
    classificationModelId: "cardio-seg-acdc",
    clinicianImpression: "Fonction systolique conservée.",
    measures: { lvef, rvef: 53.3, lvedv: 140, lvesv: 67.2, lvMass: 118, lvedvIndexed: 73.7 },
  });

function renderCard(report: AiReport, extra: { offline?: boolean } = {}) {
  const onOpenRun = vi.fn();
  render(<AiReportCard report={report} offline={extra.offline ?? false} onOpenRun={onOpenRun} />);
  return { onOpenRun, card: screen.getByRole("article") };
}

describe("a brain MRI result", () => {
  it("shows the module, the date, the decision badge and the specialty colour", () => {
    const { card } = renderCard(aiReport("r1", "p1"));
    expect(within(card).getByRole("heading", { name: "IRM cérébrale" })).toBeTruthy();
    expect(within(card).getByText("Validé")).toBeTruthy();
    expect(card.getAttribute("data-specialty")).toBe("brain");
    expect(card.style.getPropertyValue("--ai-module-color")).toBe("var(--specialty-brain)");
    expect(within(card).getByText(/Décidé le/)).toBeTruthy();
  });

  it("puts the physician's conclusion before the model's proposal, and the proposal in a quieter place", () => {
    const { card } = renderCard(aiReport("r1", "p1"));
    const conclusion = card.querySelector("[data-conclusion]") as HTMLElement;
    const proposal = card.querySelector("[data-model-proposal]") as HTMLElement;
    expect(conclusion.textContent).toContain("Gliome");
    expect(conclusion.textContent).toContain("Lésion compatible avec un gliome.");
    expect(proposal.textContent).toContain("Proposition du modèle");
    expect(proposal.textContent).toContain("Gliome");
    expect(proposal.textContent).toContain("90 %");
    expect(proposal.textContent).toContain("Méningiome");
    expect(proposal.textContent).toContain("5 %");
    // Document order: the conclusion comes first.
    expect(conclusion.compareDocumentPosition(proposal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And the proposal is not what the heading of the card says.
    expect(within(conclusion).queryByText("Proposition du modèle")).toBeNull();
  });

  it("shows a correction as such: the doctor's class first, the model's proposal after", () => {
    const { card } = renderCard(aiReport("r2", "p1", { decisionStatus: "CORRECTED", decisionLabel: "meningioma", modelDecision: "glioma" }));
    expect(within(card).getByText("Corrigé")).toBeTruthy();
    expect((card.querySelector("[data-conclusion]") as HTMLElement).textContent).toContain("Méningiome");
    expect((card.querySelector("[data-model-proposal]") as HTMLElement).textContent).toContain("Gliome");
  });

  it("shows where the answer came from: model, weights, physician, report number", () => {
    const { card } = renderCard(aiReport("r1", "p1"));
    const trace = within(card).getByLabelText("Traçabilité");
    expect(trace.textContent).toContain("brain-effnet");
    expect(trace.textContent).toContain("poids abcdef012345");
    expect(trace.textContent).toContain("Dr Démonstration");
    expect(trace.textContent).toContain("CR-IA-2026-000123");
  });
});

describe("a breast pathology result", () => {
  it("shows the score as a score, with threshold and magnification, in the pathology colour", () => {
    const { card } = renderCard(
      aiReport("p1", "p1", {
        pipeline: "pathology-breast", moduleLabel: "Pathologie mammaire", decisionStatus: "CORRECTED", decisionLabel: "benign",
        modelDecision: "malignant", topPredictions: [], clinicianImpression: null,
        measures: { malignancyScore: 0.71, decisionThreshold: 0.5, magnification: 200 },
      }),
    );
    expect(card.getAttribute("data-specialty")).toBe("pathology");
    expect(card.style.getPropertyValue("--ai-module-color")).toBe("var(--specialty-pathology)");
    expect((card.querySelector("[data-conclusion]") as HTMLElement).textContent).toContain("Bénin");
    expect((card.querySelector("[data-model-proposal]") as HTMLElement).textContent).toContain("Malin");
    expect(within(card).getByText("0,71")).toBeTruthy();
    expect(within(card).getByText("0,50")).toBeTruthy();
    expect(within(card).getByText("×200")).toBeTruthy();
    expect(within(card).getByText("pas une probabilité")).toBeTruthy();
  });
});

describe("a cardiac volumetry result", () => {
  it("states the ejection fraction class of the ESC 2021 guidelines, in words", () => {
    const cases: Array<[number, string, string]> = [
      [52, "preserved", "FEVG préservée (≥ 50 %)"],
      [45, "mildlyReduced", "FEVG modérément réduite (41–49 %)"],
      [38, "reduced", "FEVG réduite (≤ 40 %)"],
    ];
    for (const [value, key, text] of cases) {
      const { unmount } = render(<AiReportCard report={volumetry(value)} offline={false} onOpenRun={vi.fn()} />);
      const pill = document.querySelector(`[data-lvef-class="${key}"]`) as HTMLElement;
      expect(pill.textContent).toBe(text);
      unmount();
    }
  });

  it("shows the fractions, volumes and mass, the indexed value and the source of the classes", () => {
    const { card } = renderCard(volumetry(52));
    expect(card.getAttribute("data-specialty")).toBe("cardiology");
    expect(card.style.getPropertyValue("--ai-module-color")).toBe("var(--specialty-cardiology)");
    expect(within(card).getByText("FEVG du ventricule gauche").nextElementSibling?.textContent).toBe("52 %");
    expect(within(card).getByText("Volume télédiastolique du VG").nextElementSibling?.textContent).toContain("140 ml");
    expect(within(card).getByText("Volume télédiastolique du VG").nextElementSibling?.textContent).toContain("73,7 ml/m²");
    expect(within(card).getByText("Masse du myocarde du VG").nextElementSibling?.textContent).toContain("118 g");
    expect(card.textContent).toContain("ESC 2021");
  });
});

describe("an ECG result", () => {
  it("lists the classes the doctor kept, and the model's own positive classes as its proposal", () => {
    const { card } = renderCard(
      aiReport("e1", "p1", {
        pipeline: "cardio-ecg", moduleLabel: "ECG 12 dérivations", decisionLabel: null, decisionLabels: ["MI"],
        modelDecision: null, modelLabels: ["MI", "STTC"], clinicianImpression: null, measures: {},
        topPredictions: [{ label: "MI", probability: 0.8 }, { label: "STTC", probability: 0.6 }, { label: "HYP", probability: 0.2 }],
      }),
    );
    expect(card.getAttribute("data-specialty")).toBe("cardiology");
    expect((card.querySelector("[data-conclusion]") as HTMLElement).textContent).toContain("Infarctus du myocarde");
    const proposal = (card.querySelector("[data-model-proposal]") as HTMLElement).textContent!;
    expect(proposal).toContain("Infarctus du myocarde, trouble ST/T");
    expect(proposal).toContain("80 %");
    expect(proposal).toContain("Hypertrophie");
  });
});

describe("the button to the Web platform", () => {
  it("is disabled offline, with the reason", () => {
    const { onOpenRun } = renderCard(aiReport("r1", "p1"), { offline: true });
    const button = screen.getByRole("button", { name: "Ouvrir sur HealixDz Web" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Nécessite une connexion Internet");
    fireEvent.click(button);
    expect(onOpenRun).not.toHaveBeenCalled();
  });

  it("opens the analysis online", () => {
    const { onOpenRun } = renderCard(aiReport("run-42", "p1"));
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir sur HealixDz Web" }));
    expect(onOpenRun).toHaveBeenCalledWith("run-42");
  });
});

describe("the panel of a record", () => {
  const panel = (reports: AiReport[], extra: { offline?: boolean; loading?: boolean; error?: string | null } = {}) => {
    const onOpenHealixAi = vi.fn();
    render(
      <AiReportsPanel reports={reports} loading={extra.loading ?? false} error={extra.error ?? null} offline={extra.offline ?? false} onOpenRun={vi.fn()} onOpenHealixAi={onOpenHealixAi} />,
    );
    return { onOpenHealixAi };
  };
  const DISCLAIMER = "Outil d’assistance. L’interprétation et la validation restent médicales.";

  it("shows one card per analysis under the permanent mention", () => {
    panel([aiReport("r1", "p1"), aiReport("r2", "p1", { pipeline: "pathology-breast", moduleLabel: "Pathologie mammaire" })]);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it("has an explicit empty state, still under the mention, with the way to Healix AI", () => {
    const { onOpenHealixAi } = panel([]);
    expect(screen.getByText("Aucun résultat IA validé pour ce patient")).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir Healix AI sur HealixDz Web" }));
    expect(onOpenHealixAi).toHaveBeenCalled();
  });

  it("disables the way to Healix AI offline", () => {
    panel([], { offline: true });
    expect((screen.getByRole("button", { name: "Ouvrir Healix AI sur HealixDz Web" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not claim there is nothing while loading, nor when the read failed", () => {
    panel([], { loading: true });
    expect(screen.queryByText("Aucun résultat IA validé pour ce patient")).toBeNull();
  });

  it("says when the read failed", () => {
    panel([], { error: "Résultats illisibles." });
    expect(screen.getByRole("alert").textContent).toContain("Résultats illisibles.");
    expect(screen.queryByText("Aucun résultat IA validé pour ce patient")).toBeNull();
  });
});
