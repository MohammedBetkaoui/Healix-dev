import { renderToStaticMarkup } from "react-dom/server";

import { type AiPriority } from "@/features/ai-analyses/ai-analyses.types";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { PriorityBadge } from "./PriorityBadge";

const fr = (key: string, params?: Record<string, number | string>) => translate(dictionaries.fr, key, params);
const ar = (key: string, params?: Record<string, number | string>) => translate(dictionaries.ar, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;").replaceAll("\n", "&#10;");

const urgent: AiPriority = {
  level: "URGENT",
  reasons: [{ code: "ECG_MI", params: { probability: 0.97 } }],
  score: 99,
};
const high: AiPriority = {
  level: "HIGH",
  reasons: [{ code: "BRAIN_TUMOR_PREDICTED", params: { label: "meningioma", probability: 0.95 } }],
  score: 60,
};
const routine: AiPriority = { level: "ROUTINE", reasons: [], score: 3 };

const render = (priority: AiPriority, locale: "ar" | "fr" = "fr") =>
  renderToStaticMarkup(<PriorityBadge locale={locale} priority={priority} t={locale === "fr" ? fr : ar} />);

describe("PriorityBadge", () => {
  it("writes URGENT in words, in red", () => {
    const html = render(urgent);

    expect(html).toContain('data-priority="URGENT"');
    // The level, as text next to its colour.
    expect(html).toMatch(/<\/svg>Urgent<span class="sr-only">/);
    expect(html).toContain("--danger-ink");
  });

  it("writes HIGH in words, in orange", () => {
    const html = render(high);

    expect(html).toContain('data-priority="HIGH"');
    expect(html).toContain("Élevée");
    expect(html).toContain("--warning-ink");
  });

  it("shows nothing for a run to read in its turn", () => {
    expect(render(routine)).toBe("");
  });

  it("gives the reasons on hover, with the reminder that it is an order of reading", () => {
    const html = render(urgent);

    expect(html).toContain(`title="${escaped("Priorité de lecture : Urgent")}`);
    expect(html).toMatch(/Infarctus du myocarde proposé par le modèle \(97\s?%\)/);
    expect(html).toContain("Ordre de lecture, pas un diagnostic.");
  });

  it("is reachable by keyboard and read by a screen reader: the reasons are text, not only a tooltip", () => {
    const html = render(high);

    expect(html).toContain('tabindex="0"');
    expect(html).toMatch(/<span class="sr-only">[^<]*Méningiome proposé par le modèle[^<]*Ordre de lecture, pas un diagnostic\.<\/span>/);
  });

  it("speaks Arabic as well", () => {
    const html = render(urgent, "ar");

    expect(html).toContain(dictionaries.ar.aiAnalyses.priority.levels.URGENT);
    expect(html).toContain(dictionaries.ar.aiAnalyses.priority.disclaimerShort);
    expect(html).not.toContain("aiAnalyses.");
  });
});
