import { dictionaries, type Locale } from "@/i18n";
import { translate } from "@/lib/i18n";

import { type AiPriority } from "./ai-analyses.types";
import { describeReason, priorityTitle } from "./ai-priority";

const tFor = (locale: Locale) => (key: string, params?: Record<string, number | string>) =>
  translate(dictionaries[locale], key, params);

describe("the reading priority of a cardiac cine", () => {
  it("says the fraction to the unit, in French", () => {
    const text = describeReason({ code: "VOLUME_LVEF_REDUCED", params: { efPercent: 24.6 } }, "fr", tFor("fr"));
    expect(text).toBe("Fraction d’éjection du VG à 25 %, réduite (≤ 40 %) selon l’ESC 2021.");
    expect(
      describeReason({ code: "VOLUME_LVEF_MILDLY_REDUCED", params: { efPercent: 45.2 } }, "fr", tFor("fr")),
    ).toContain("45 %");
  });

  it("says it in Arabic", () => {
    const text = describeReason({ code: "VOLUME_LVEF_REDUCED", params: { efPercent: 24.6 } }, "ar", tFor("ar"));
    expect(text).toContain("ESC 2021");
    expect(text).not.toContain("aiAnalyses.");
    expect(text).not.toContain("{efPercent}");
  });

  it("says what is to be checked first, in both languages", () => {
    for (const locale of ["fr", "ar"] as const) {
      for (const code of ["VOLUME_ES_EXCEEDS_ED", "VOLUME_NOT_MEASURABLE"] as const) {
        const text = describeReason({ code }, locale, tFor(locale));
        expect(text).not.toMatch(/^aiAnalyses|VOLUME_/);
        expect(text.length).toBeGreaterThan(10);
      }
    }
    expect(describeReason({ code: "VOLUME_ES_EXCEEDS_ED" }, "fr", tFor("fr"))).toContain("à vérifier");
  });

  it("puts the reason in the title of the badge, next to the order-of-reading mention", () => {
    const priority: AiPriority = {
      level: "URGENT",
      reasons: [{ code: "VOLUME_LVEF_REDUCED", params: { efPercent: 30 } }],
      score: 85,
    };
    const title = priorityTitle(priority, "fr", tFor("fr"));
    expect(title).toContain("• Fraction d’éjection du VG à 30 %");
    expect(title).toContain("Ordre de lecture, pas un diagnostic.");
  });
});
