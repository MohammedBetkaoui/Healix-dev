import { renderToStaticMarkup } from "react-dom/server";

import { type AiPriority, type AiRunListItem } from "@/features/ai-analyses/ai-analyses.types";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { AiPriorityCard, PRIORITY_CARD_PARAMS } from "./AiPriorityCard";

jest.mock("@/features/ai-analyses/hooks/use-ai-runs-overview", () => ({ useAiRunsOverview: jest.fn() }));

const fr = (key: string, params?: Record<string, number | string>) => translate(dictionaries.fr, key, params);
const ar = (key: string, params?: Record<string, number | string>) => translate(dictionaries.ar, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const urgent: AiPriority = { level: "URGENT", reasons: [{ code: "ECG_MI", params: { probability: 0.97 } }], score: 99 };
const high: AiPriority = { level: "HIGH", reasons: [{ code: "CARDIO_STRUCTURE_ABSENT", params: { structure: "RV" } }], score: 55 };
const routine: AiPriority = { level: "ROUTINE", reasons: [], score: 1 };

const run = (id: string, priority: AiPriority, surname: string, hoursAgo = 5): AiRunListItem =>
  ({
    createdAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    id,
    patient: { firstName: "Karim", firstNameAr: "كريم", id: `patient-${id}`, lastName: surname, lastNameAr: "حداد" },
    patientId: `patient-${id}`,
    pipeline: priority === urgent ? "cardio-ecg" : "cardio-seg-mri",
    priority,
  }) as unknown as AiRunListItem;

const state = (query: Record<string, unknown>) => (useAiRunsOverview as jest.Mock).mockReturnValue({ data: undefined, error: null, isError: false, isPending: false, ...query });
const render = (urgentPending: number, t = fr) =>
  renderToStaticMarkup(<AiPriorityCard formatNumber={(value) => String(value)} locale={t === fr ? "fr" : "ar"} roleBase="/doctor" t={t} urgentPending={urgentPending} />);
const page = (items: AiRunListItem[]) => ({ items, limit: 5, page: 1, total: items.length, totalPages: 1 });

describe("the « À revoir en priorité » card", () => {
  it("asks for the first five runs waiting for a decision, in priority order", () => {
    state({ data: page([]) });
    render(0);

    expect(useAiRunsOverview).toHaveBeenLastCalledWith(PRIORITY_CARD_PARAMS);
    expect(PRIORITY_CARD_PARAMS).toEqual({ decision: "pending", limit: 5, page: 1, sort: "priority" });
  });

  it("counts the urgent runs not reviewed yet", () => {
    state({ data: page([run("a", urgent, "Haddad")]) });

    expect(render(3)).toContain("3 urgente(s) non revue(s)");
    expect(render(3)).toContain('data-urgent="3"');
  });

  it("says when none is urgent", () => {
    state({ data: page([run("a", high, "Benali")]) });

    const html = render(0);

    expect(html).toContain(fr("aiAnalyses.priority.card.urgentNone"));
    expect(html).not.toContain("urgente(s) non revue(s)");
  });

  it("lists the suspicious runs, each with its badge, its patient, its chain and how long it has waited", () => {
    state({ data: page([run("urgent-ecg", urgent, "Haddad", 5), run("high-heart", high, "Benali", 75)]) });

    const html = render(1);

    expect(html).toContain('data-priority="URGENT"');
    expect(html).toContain('data-priority="HIGH"');
    expect(html).toContain("Karim Haddad");
    expect(html).toContain("Karim Benali");
    expect(html).toContain(fr("aiAnalyses.pipelines.cardio-ecg.name"));
    expect(html).toContain("En attente depuis 5 h");
    expect(html).toContain("En attente depuis 3 j");
  });

  it("keeps the order of the API", () => {
    state({ data: page([run("first", urgent, "Haddad"), run("second", high, "Benali"), run("third", high, "Cherif")]) });

    const order = [...render(1).matchAll(/runs\/(\w+)\?patient/g)].map((match) => match[1]);

    expect(order).toEqual(["first", "second", "third"]);
  });

  it("opens each run on its own result page", () => {
    state({ data: page([run("urgent-ecg", urgent, "Haddad")]) });

    expect(render(1)).toContain('href="/doctor/ai-analyses/runs/urgent-ecg?patient=patient-urgent-ecg"');
  });

  it("lists the flagged runs only: a run to read in its turn is not « à revoir en priorité »", () => {
    state({ data: page([run("a", urgent, "Haddad"), run("b", routine, "Cherif")]) });

    const html = render(1);

    expect(html).toContain("Karim Haddad");
    expect(html).not.toContain("Karim Cherif");
  });

  it("lists five at most", () => {
    state({ data: page(Array.from({ length: 8 }, (_, index) => run(`r${index}`, high, `Nom${index}`))) });

    expect(render(0).match(/<li /g)).toHaveLength(5);
  });

  it("says nothing is suspicious when nothing is", () => {
    state({ data: page([run("a", routine, "Cherif")]) });

    expect(render(0)).toContain(escaped(fr("aiAnalyses.priority.card.empty")));
    state({ data: page([]) });
    expect(render(0)).toContain(escaped(fr("aiAnalyses.priority.card.empty")));
  });

  it("says it is loading, and when it could not load", () => {
    state({ data: undefined, isPending: true });
    expect(render(0)).toContain(fr("aiAnalyses.priority.card.loading"));

    state({ data: undefined, isError: true, isPending: false });
    const html = render(0);
    expect(html).toContain('role="alert"');
    expect(html).toContain(fr("aiAnalyses.priority.card.error"));
  });

  it("says, whatever it shows, that it is an order of reading and not a diagnosis", () => {
    for (const data of [page([run("a", urgent, "Haddad")]), page([]), undefined]) {
      state({ data, isPending: data === undefined });

      const html = render(0);

      expect(html).toContain('role="note"');
      expect(html).toContain(escaped(fr("aiAnalyses.priority.disclaimer")));
    }
  });

  it("leads to the whole follow-up", () => {
    state({ data: page([]) });

    expect(render(0)).toContain('href="/doctor/ai-analyses/tracking"');
  });

  it("speaks Arabic as well", () => {
    state({ data: page([run("a", urgent, "Haddad")]) });

    const html = render(2, ar);

    expect(html).toContain(dictionaries.ar.aiAnalyses.priority.card.title);
    expect(html).toContain(dictionaries.ar.aiAnalyses.priority.disclaimer);
    expect(html).not.toContain("aiAnalyses.priority");
  });
});
