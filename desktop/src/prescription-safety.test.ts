import { describe, expect, it } from "vitest";
import { blockingAlerts, bySeverity, evaluatePrescriptionSafety, normalize, type SafetyItem } from "./prescription-safety";
import cases from "./test/safety-cases.json";
import golden from "./test/safety-golden.json";

const base = cases.item as SafetyItem;
const item = (overrides: Partial<SafetyItem> = {}): SafetyItem => ({ ...base, ...overrides });

// What the server answers, to be compared with: the port adds the line an alert
// is about and one check of its own, which the server does not have.
const serverShaped = (items: SafetyItem[], summary: unknown) => {
  const result = evaluatePrescriptionSafety(items, summary);
  return {
    alerts: result.alerts
      .filter((alert) => alert.kind !== "CURRENT_MEDICATION")
      .map(({ itemIndex: _itemIndex, ...alert }) => alert),
    evaluatedChecks: result.evaluatedChecks.filter((check) => check !== "CURRENT_MEDICATION"),
    notEvaluated: result.notEvaluated,
  };
};

describe("the port gives the answers of the server's PrescriptionSafetyService", () => {
  it("covers every shared case, and the golden file has no stale one", () => {
    expect(Object.keys(golden).sort()).toEqual(cases.cases.map((entry) => entry.name).sort());
  });

  it.each(cases.cases.map((entry) => [entry.name, entry] as const))("%s", (_name, entry) => {
    const items = entry.items.map((override) => item(override as Partial<SafetyItem>));
    expect(serverShaped(items, entry.summary)).toEqual((golden as Record<string, unknown>)[entry.name]);
  });
});

// The three cases of the server's own spec (prescription-safety.service.spec.ts).
describe("the cases of the server spec", () => {
  it("detects exact duplicate medication snapshots", () => {
    const result = evaluatePrescriptionSafety([item(), item()], { allergies: [] });
    expect(result.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "DUPLICATION" })]));
  });

  it("only reports a structured allergy on an exact normalized DCI match", () => {
    const exact = evaluatePrescriptionSafety([item()], { allergies: ["paracetamol"] });
    const broad = evaluatePrescriptionSafety([item()], { allergies: ["antalgiques"] });
    expect(exact.alerts.some((alert) => alert.kind === "ALLERGY")).toBe(true);
    expect(broad.alerts.some((alert) => alert.kind === "ALLERGY")).toBe(false);
  });

  it("declares unsupported clinical checks as not evaluated", () => {
    const result = evaluatePrescriptionSafety([item()], null);
    expect(result.notEvaluated).toContain("DRUG_INTERACTIONS");
    expect(result.notEvaluated).toContain("RENAL_FUNCTION");
    expect(result.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "MISSING_CONTEXT" })]));
  });
});

describe("the French messages", () => {
  it("are the server's", () => {
    const result = evaluatePrescriptionSafety(
      [item({ regulatoryCategory: "NARCOTIC", durationDays: 0, quantity: "" }), item({ regulatoryCategory: "NARCOTIC", durationDays: 0, quantity: "" })],
      null,
    );
    const titles = new Set(result.alerts.map((alert) => alert.title));
    expect(titles).toEqual(
      new Set([
        "Médicament dupliqué dans cette ordonnance.",
        "Médicament soumis à une vigilance réglementaire supplémentaire.",
        "Durée de traitement invalide.",
        "Posologie, fréquence ou quantité manquante.",
        "Résumé médical non renseigné.",
      ]),
    );
  });

  it("point at the line they are about", () => {
    const result = evaluatePrescriptionSafety([item({ dci: "Amoxicilline" }), item({ dci: "Pénicilline" })], { allergies: ["penicilline"] });
    const allergy = result.alerts.find((alert) => alert.kind === "ALLERGY");
    expect(allergy).toMatchObject({ id: "allergy-2", itemIndex: 1, level: "critical", detail: "Pénicilline" });
  });
});

describe("normalize", () => {
  it("drops case, accents and surrounding spaces", () => {
    expect(normalize("  Paracétamol ")).toBe("paracetamol");
    expect(normalize("ÉRYTHROMYCINE")).toBe("erythromycine");
  });
});

describe("CURRENT_MEDICATION (desktop only)", () => {
  const summary = (currentMedications: unknown) => ({ allergies: [], currentMedications });

  it("reports a DCI already in the current treatments, however it is written there", () => {
    for (const entry of ["Paracétamol", "paracetamol 1 g", "PARACÉTAMOL (Doliprane) 500 mg", "Amlodipine 5 mg, Paracétamol 1 g"]) {
      const alert = evaluatePrescriptionSafety([item()], summary([entry])).alerts.find((alert) => alert.kind === "CURRENT_MEDICATION");
      expect(alert, entry).toMatchObject({ itemIndex: 0, level: "attention", detail: entry });
    }
  });

  it("does not report another medication or a part of a word", () => {
    for (const entry of ["Amlodipine 5 mg", "Paracétamolum", "antiparacetamol", "Ibuprofène"]) {
      const result = evaluatePrescriptionSafety([item()], summary([entry]));
      expect(result.alerts.some((alert) => alert.kind === "CURRENT_MEDICATION"), entry).toBe(false);
    }
    expect(evaluatePrescriptionSafety([item()], summary(undefined)).alerts.some((alert) => alert.kind === "CURRENT_MEDICATION")).toBe(false);
    expect(evaluatePrescriptionSafety([item({ dci: "" })], summary(["Paracétamol"])).alerts.some((alert) => alert.kind === "CURRENT_MEDICATION")).toBe(false);
  });

  it("is about the line that repeats the treatment", () => {
    const result = evaluatePrescriptionSafety([item({ dci: "Ibuprofène" }), item()], summary(["Paracétamol 1 g"]));
    expect(result.alerts.filter((alert) => alert.kind === "CURRENT_MEDICATION").map((alert) => alert.itemIndex)).toEqual([1]);
  });
});

describe("what the editor does with the alerts", () => {
  it("orders them most serious first and blocks only on an allergy", () => {
    const result = evaluatePrescriptionSafety([item({ regulatoryCategory: "REGULATED" })], { allergies: ["paracetamol"] });
    expect(bySeverity(result.alerts).map((alert) => alert.level)).toEqual(["critical", "attention"]);
    expect(blockingAlerts(result.alerts).map((alert) => alert.kind)).toEqual(["ALLERGY"]);
    expect(blockingAlerts(evaluatePrescriptionSafety([item({ regulatoryCategory: "REGULATED" })], { allergies: [] }).alerts)).toEqual([]);
  });
});
