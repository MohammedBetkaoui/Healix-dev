import { readFileSync } from "node:fs";
import { join } from "node:path";

// The record page is too heavy to render here (a dozen queries): the wiring of
// the "Évolution IA" tab is checked in its source, so that it cannot be left
// half done (a tab with no content, no label, or the empty-tab fallback).
const source = readFileSync(join(__dirname, "PatientRecordPage.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("the « Évolution IA » tab of the patient record", () => {
  it("is a tab, between the imaging and the reports", () => {
    expect(source).toMatch(/"imaging", "aiEvolution", "reports"/);
    expect(source).toMatch(/\| "labs" \| "imaging" \| "aiEvolution" \| "documents"/);
  });

  it("has a label in French and in Arabic", () => {
    expect(source).toContain('aiEvolution: "Évolution IA"');
    expect(source).toContain('aiEvolution: "تطور الذكاء الاصطناعي"');
  });

  it("shows the evolution of the patient when it is the active tab", () => {
    expect(source).toContain('import { AiEvolutionSection } from "@/components/ai-analyses/evolution/AiEvolutionSection"');
    expect(source).toMatch(/\{activeTab === "aiEvolution" \? \(\s*<AiEvolutionSection locale=\{locale\} patientId=\{patientId\} t=\{t\} \/>\s*\) : null\}/);
  });

  it("is not caught by the empty-tab fallback", () => {
    expect(source).toContain('activeTab !== "aiEvolution"');
  });

  it("can be opened by ?tab=aiEvolution, like the other tabs", () => {
    // The initial tab is any tab of the list: nothing else to wire.
    expect(source).toMatch(/tabs\.find\(\(tab\) => tab === initialTab\)/);
  });
});
