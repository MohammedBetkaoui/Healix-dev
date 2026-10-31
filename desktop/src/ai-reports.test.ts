import { describe, expect, it } from "vitest";
import {
  appendCitation, citationOf, className, conclusionOf, isCited, lvefClass, measureLines, newestFirst, proposalOf,
  specialtyOf,
} from "./ai-reports";
import { aiReport } from "./test/fixtures";
import { aiRunUrl } from "./web-app";

// Noon UTC: the same calendar day in every time zone of the doctor's PC.
const decided = "2026-10-28T12:00:00.000Z";
const brain = () => aiReport("r1", "p1", { decidedAt: decided, createdAt: decided });

const volumetry = (lvef: number | null, extra: Record<string, number | null> = {}) =>
  aiReport("v1", "p1", {
    pipeline: "cardio-volume-mri",
    moduleLabel: "IRM cardiaque (volumes et FEVG)",
    decisionLabel: null,
    modelDecision: null,
    topPredictions: [],
    measures: { lvef, rvef: 53.3, lvedv: 140, lvesv: 67.2, lvMass: 118, ...extra },
  });

describe("the specialty of a result", () => {
  it("is the one of the Web theme: brain, pathology, cardiology", () => {
    expect(specialtyOf("brain")).toBe("brain");
    expect(specialtyOf("pathology-breast")).toBe("pathology");
    expect(specialtyOf("pathology-nuclei")).toBe("pathology");
    expect(specialtyOf("cardio-ecg")).toBe("cardiology");
    expect(specialtyOf("cardio-seg-mri")).toBe("cardiology");
    expect(specialtyOf("cardio-volume-mri")).toBe("cardiology");
  });
});

describe("the ejection fraction class (ESC 2021)", () => {
  it("is reduced up to 40 %, mildly reduced from 41 to 49 %, preserved from 50 %", () => {
    expect(lvefClass(25)).toBe("reduced");
    expect(lvefClass(40)).toBe("reduced");
    expect(lvefClass(41)).toBe("mildlyReduced");
    expect(lvefClass(49)).toBe("mildlyReduced");
    expect(lvefClass(50)).toBe("preserved");
    expect(lvefClass(52)).toBe("preserved");
  });

  it("reads the fraction rounded to the unit, as the report prints it", () => {
    expect(lvefClass(40.4)).toBe("reduced");
    expect(lvefClass(40.5)).toBe("mildlyReduced");
    expect(lvefClass(49.4)).toBe("mildlyReduced");
    expect(lvefClass(49.5)).toBe("preserved");
  });

  it("has no class without a fraction", () => {
    expect(lvefClass(null)).toBeNull();
    expect(lvefClass(undefined)).toBeNull();
    expect(lvefClass(Number.NaN)).toBeNull();
  });
});

describe("the conclusion of the physician", () => {
  it("is the class they kept, in French", () => {
    expect(conclusionOf(brain())).toBe("gliome");
    expect(className("notumor")).toBe("pas de tumeur");
    expect(className("an-unknown-class")).toBe("an-unknown-class");
  });

  it("lists the classes kept on an ECG", () => {
    const ecg = aiReport("e1", "p1", { pipeline: "cardio-ecg", decisionLabel: null, decisionLabels: ["MI", "STTC"] });
    expect(conclusionOf(ecg)).toBe("infarctus du myocarde, trouble ST/T");
  });

  it("gives the ejection fraction and its class for a volumetry", () => {
    expect(conclusionOf(volumetry(52))).toBe("FEVG 52 % (préservée)");
    expect(conclusionOf(volumetry(45))).toBe("FEVG 45 % (modérément réduite)");
    expect(conclusionOf(volumetry(35.5))).toBe("FEVG 35,5 % (réduite)");
  });

  it("says what a validated map means when no class is kept", () => {
    expect(conclusionOf(aiReport("n1", "p1", { pipeline: "pathology-nuclei", decisionLabel: null }))).toBe("carte des noyaux validée");
  });

  it("is distinct from the proposal of the model", () => {
    const corrected = aiReport("r2", "p1", { decisionStatus: "CORRECTED", decisionLabel: "meningioma", modelDecision: "glioma" });
    expect(conclusionOf(corrected)).toBe("méningiome");
    expect(proposalOf(corrected)).toBe("gliome");
  });
});

describe("the citation for the assessment", () => {
  it("is dated, sourced and short", () => {
    expect(citationOf(brain())).toBe(
      "Analyse IA (IRM cérébrale, 28/10/2026, validée par Dr Démonstration, rapport CR-IA-2026-000123) : gliome.",
    );
  });

  it("says corrected for a correction, and leaves out what is not known", () => {
    expect(citationOf(aiReport("r2", "p1", { decidedAt: decided, decisionStatus: "CORRECTED", decisionLabel: "meningioma" }))).toContain(
      "corrigée par Dr Démonstration",
    );
    const bare = citationOf(aiReport("r3", "p1", { decidedAt: decided, decidedByName: null, reportNumber: null }));
    expect(bare).toBe("Analyse IA (IRM cérébrale, 28/10/2026, validée) : gliome.");
  });

  it("goes at the end of the text, on its own line, and never replaces it", () => {
    const citation = citationOf(brain());
    expect(appendCitation("", citation)).toBe(citation);
    expect(appendCitation("Toux productive, fièvre.", citation)).toBe(`Toux productive, fièvre.\n${citation}`);
    // Trailing blanks and lines do not pile up.
    expect(appendCitation("Toux productive.\n\n  ", citation)).toBe(`Toux productive.\n${citation}`);
  });

  it("is not added twice, and says so", () => {
    const report = brain();
    const once = appendCitation("Bronchite probable.", citationOf(report));
    expect(appendCitation(once, citationOf(report))).toBe(once);
    expect(isCited(once, report)).toBe(true);
    expect(isCited("Bronchite probable.", report)).toBe(false);
  });
});

describe("the key figures of a module", () => {
  const labels = (report: ReturnType<typeof aiReport>) => measureLines(report).map((line) => `${line.label} : ${line.value}`);

  it("brain: the share of the image the mask covers", () => {
    expect(labels(brain())).toEqual(["Part de l’image couverte par le masque : 4,2 %"]);
  });

  it("breast pathology: score, threshold, magnification (and that the score is not a probability)", () => {
    const report = aiReport("p1", "p1", { pipeline: "pathology-breast", measures: { malignancyScore: 0.71, decisionThreshold: 0.5, magnification: 200 } });
    expect(labels(report)).toEqual(["Score de malignité : 0,71", "Seuil de décision : 0,50", "Grossissement : ×200"]);
    expect(measureLines(report)[0].note).toBe("pas une probabilité");
  });

  it("volumetry: fractions, volumes, mass and the indexed values when they exist", () => {
    const lines = measureLines(volumetry(52, { lvedvIndexed: 73.7, lvMassIndexed: 62.1 }));
    expect(lines.map((line) => line.label)).toEqual([
      "FEVG du ventricule gauche", "FEVG du ventricule droit", "Volume télédiastolique du VG", "Volume télésystolique du VG", "Masse du myocarde du VG",
    ]);
    expect(lines[0].value).toBe("52 %");
    expect(lines[2]).toMatchObject({ value: "140 ml", note: "73,7 ml/m²" });
    expect(lines[3].note).toBeUndefined();
    expect(lines[4]).toMatchObject({ value: "118 g", note: "62,1 g/m²" });
  });

  it("leaves out a figure the run does not have", () => {
    expect(measureLines(volumetry(null, { rvef: null, lvedv: null, lvesv: null, lvMass: null }))).toEqual([]);
    expect(measureLines(aiReport("e1", "p1", { pipeline: "cardio-ecg", measures: {} }))).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts the most recent decision first", () => {
    const old = aiReport("old", "p1", {}, 10);
    const recent = aiReport("recent", "p1", {}, 1);
    expect(newestFirst([old, recent]).map((report) => report.runId)).toEqual(["recent", "old"]);
  });
});

describe("the link to the analysis on the Web platform", () => {
  it("points at the run page of the doctor space, the id encoded", () => {
    expect(aiRunUrl("https://web.example.test", "run-1")).toBe("https://web.example.test/doctor/ai-analyses/runs/run-1");
    expect(aiRunUrl("https://web.example.test", "a/b c")).toBe("https://web.example.test/doctor/ai-analyses/runs/a%2Fb%20c");
  });
});
