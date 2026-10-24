import { dictionaries, type Locale } from "@/i18n";
import { translate } from "@/lib/i18n";

import {
  aiPriorityLevels,
  type AiPriority,
  type AiPriorityReason,
  type AiPriorityReasonCode,
} from "./ai-analyses.types";
import {
  describeReason,
  FLAGGED_LEVELS,
  isFlagged,
  PRIORITY_CARD_SIZE,
  priorityQueue,
  priorityReasons,
  priorityTitle,
  priorityTones,
  waitingAge,
} from "./ai-priority";

const tFor = (locale: Locale) => (key: string, params?: Record<string, number | string>) => translate(dictionaries[locale], key, params);
const fr = tFor("fr");
const ar = tFor("ar");

const priority = (level: AiPriority["level"], reasons: AiPriorityReason[] = [], score = 80): AiPriority => ({ level, reasons, score });

describe("what is flagged", () => {
  it("flags URGENT and HIGH, never ROUTINE", () => {
    expect(FLAGGED_LEVELS).toEqual(["URGENT", "HIGH"]);
    expect(isFlagged(priority("URGENT"))).toBe(true);
    expect(isFlagged(priority("HIGH"))).toBe(true);
    expect(isFlagged(priority("ROUTINE"))).toBe(false);
  });

  it("has a tone for every level: red, orange, neutral", () => {
    expect(priorityTones).toEqual({ HIGH: "warning", ROUTINE: "neutral", URGENT: "danger" });
    expect(Object.keys(priorityTones).sort()).toEqual([...aiPriorityLevels].sort());
  });
});

describe("describeReason", () => {
  it("quotes a probability as a percentage", () => {
    expect(describeReason({ code: "BRAIN_GLIOMA", params: { probability: 0.824 } }, "fr", fr)).toMatch(/^Gliome proposé par le modèle \(82\s?%\)\.$/);
    expect(describeReason({ code: "ECG_MI", params: { probability: 0.99 } }, "fr", fr)).toMatch(/Infarctus du myocarde proposé par le modèle \(99\s?%\)/);
  });

  it("names the class by its translation, not its code", () => {
    expect(describeReason({ code: "BRAIN_TUMOR_PREDICTED", params: { label: "meningioma", probability: 0.95 } }, "fr", fr)).toMatch(/^Méningiome proposé/);
    expect(describeReason({ code: "BRAIN_TUMOR_PREDICTED", params: { label: "pituitary", probability: 0.6 } }, "fr", fr)).toMatch(/^Tumeur hypophysaire proposé/);
  });

  it("quotes a breast score and its threshold with two decimals at most", () => {
    expect(describeReason({ code: "BREAST_BORDERLINE", params: { score: 0.4567, threshold: 0.5 } }, "fr", fr)).toBe(
      "Score de malignité 0,46, juste sous le seuil 0,5 : résultat limite.",
    );
  });

  it("falls back on the stored answer when the backend had no score to quote", () => {
    expect(describeReason({ code: "BREAST_MALIGNANT" }, "fr", fr)).toBe("Résultat « malin » proposé par le modèle.");
    expect(describeReason({ code: "BREAST_MALIGNANT", params: { score: 0.9, threshold: 0.5 } }, "fr", fr)).toMatch(/Score de malignité 0,9, bien au-dessus du seuil 0,5/);
  });

  it("names a missing structure of the heart", () => {
    expect(describeReason({ code: "CARDIO_STRUCTURE_ABSENT", params: { structure: "RV" } }, "fr", fr)).toBe("Structure absente : ventricule droit.");
    expect(describeReason({ code: "CARDIO_STRUCTURE_ABSENT", params: { structure: "MYO" } }, "ar", ar)).toContain(dictionaries.ar.aiAnalyses.priority.structures.MYO);
  });

  it("counts the abnormal classes of an ECG", () => {
    expect(describeReason({ code: "ECG_MULTIPLE_ABNORMAL", params: { count: 3 } }, "fr", fr)).toBe("3 classes anormales proposées.");
  });

  it("says the model hesitates, with the probability of its top class", () => {
    expect(describeReason({ code: "LOW_CONFIDENCE", params: { probability: 0.62 } }, "fr", fr)).toMatch(/hésite.*62\s?%/);
  });

  it("reads a code the screen does not know as the code, never as a translation key", () => {
    expect(describeReason({ code: "SOMETHING_NEW" as AiPriorityReasonCode }, "fr", fr)).toBe("SOMETHING_NEW");
  });

  const codes: AiPriorityReason[] = [
    { code: "ALREADY_DECIDED" },
    { code: "BRAIN_GLIOMA", params: { probability: 0.8 } },
    { code: "BRAIN_TUMOR_POSSIBLE", params: { probability: 0.4 } },
    { code: "BRAIN_TUMOR_PREDICTED", params: { label: "glioma", probability: 0.4 } },
    { code: "BREAST_ABOVE_THRESHOLD", params: { score: 0.55, threshold: 0.5 } },
    { code: "BREAST_BORDERLINE", params: { score: 0.45, threshold: 0.5 } },
    { code: "BREAST_MALIGNANT", params: { score: 0.9, threshold: 0.5 } },
    { code: "BREAST_MALIGNANT" },
    { code: "CARDIO_NO_STRUCTURE" },
    { code: "CARDIO_STRUCTURE_ABSENT", params: { structure: "LV" } },
    { code: "ECG_MI", params: { probability: 0.9 } },
    { code: "ECG_MULTIPLE_ABNORMAL", params: { count: 2 } },
    { code: "LOW_CONFIDENCE", params: { probability: 0.7 } },
    { code: "NO_RESULT" },
    { code: "NUCLEI_NONE_FOUND" },
  ];

  it.each<Locale>(["fr", "ar"])("words every reason the backend can give (%s): a sentence, filled in, no key left", (locale) => {
    const t = tFor(locale);

    for (const reason of codes) {
      const text = describeReason(reason, locale, t);

      expect(text).not.toBe(reason.code);
      expect(text).not.toMatch(/aiAnalyses\./);
      expect(text).not.toMatch(/[{}]/);
      expect(text.length).toBeGreaterThan(10);
    }
  });
});

describe("what the badge says", () => {
  const urgent = priority("URGENT", [
    { code: "BRAIN_GLIOMA", params: { probability: 0.9 } },
    { code: "LOW_CONFIDENCE", params: { probability: 0.8 } },
  ]);

  it("lists the reasons of a priority, in the order they came", () => {
    expect(priorityReasons(urgent, "fr", fr)).toHaveLength(2);
    expect(priorityReasons(urgent, "fr", fr)[0]).toMatch(/^Gliome proposé/);
  });

  it("titles the level, then each reason, then that this is an order of reading and not a diagnosis", () => {
    const title = priorityTitle(urgent, "fr", fr);
    const lines = title.split("\n");

    expect(lines[0]).toBe("Priorité de lecture : Urgent");
    expect(lines[1]).toMatch(/^• Gliome proposé par le modèle/);
    expect(lines[2]).toMatch(/^• Le modèle hésite/);
    expect(lines[lines.length - 1]).toBe("Ordre de lecture, pas un diagnostic.");
  });

  it("says the same in Arabic", () => {
    const title = priorityTitle(urgent, "ar", ar);

    expect(title).toContain(dictionaries.ar.aiAnalyses.priority.levels.URGENT);
    expect(title).toContain(dictionaries.ar.aiAnalyses.priority.disclaimerShort);
  });

  it("states in both languages that it is not a diagnosis", () => {
    expect(dictionaries.fr.aiAnalyses.priority.disclaimer).toMatch(/pas un diagnostic/);
    expect(dictionaries.fr.aiAnalyses.priority.disclaimer).toMatch(/ordre de lecture/);
    expect(dictionaries.ar.aiAnalyses.priority.disclaimer).toMatch(/ليست تشخيصًا/);
  });
});

describe("priorityQueue: the runs of the dashboard card", () => {
  const run = (id: string, level: AiPriority["level"]) => ({ id, priority: priority(level) });

  it("keeps the flagged runs only, in the order the API gave them", () => {
    const items = [run("a", "URGENT"), run("b", "HIGH"), run("c", "ROUTINE"), run("d", "HIGH")];

    expect(priorityQueue(items).map((item) => item.id)).toEqual(["a", "b", "d"]);
  });

  it(`stops at ${PRIORITY_CARD_SIZE}`, () => {
    const items = Array.from({ length: 9 }, (_, index) => run(`r${index}`, "URGENT"));

    expect(priorityQueue(items)).toHaveLength(5);
    expect(priorityQueue(items).map((item) => item.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
  });

  it("is empty when nothing is suspicious", () => {
    expect(priorityQueue([run("a", "ROUTINE")])).toEqual([]);
    expect(priorityQueue([])).toEqual([]);
  });
});

describe("waitingAge", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");

  it("counts hours up to two days, then days", () => {
    expect(waitingAge("2026-10-24T09:30:00.000Z", now)).toEqual({ unit: "hours", value: 2 });
    expect(waitingAge("2026-10-22T13:00:00.000Z", now)).toEqual({ unit: "hours", value: 47 });
    expect(waitingAge("2026-10-22T12:00:00.000Z", now)).toEqual({ unit: "days", value: 2 });
    expect(waitingAge("2026-10-14T12:00:00.000Z", now)).toEqual({ unit: "days", value: 10 });
  });

  it("never goes negative", () => {
    expect(waitingAge("2026-10-24T13:00:00.000Z", now)).toEqual({ unit: "hours", value: 0 });
  });
});
