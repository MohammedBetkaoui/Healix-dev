import { renderToStaticMarkup } from "react-dom/server";

import {
  type AiPriority,
  type AiRunListItem,
  type AiRunsPage,
} from "@/features/ai-analyses/ai-analyses.types";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import { DEFAULT_TRACKING_STATE, type TrackingState } from "@/features/ai-analyses/runs-tracking";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { AiRunsWorklist } from "./AiRunsWorklist";

jest.mock("@/features/ai-analyses/hooks/use-ai-runs-overview", () => ({ useAiRunsOverview: jest.fn() }));

const fr = (key: string, params?: Record<string, number | string>) => translate(dictionaries.fr, key, params);
const ar = (key: string, params?: Record<string, number | string>) => translate(dictionaries.ar, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const urgent: AiPriority = { level: "URGENT", reasons: [{ code: "BRAIN_GLIOMA", params: { probability: 0.91 } }], score: 98 };
const high: AiPriority = { level: "HIGH", reasons: [{ code: "BRAIN_TUMOR_PREDICTED", params: { label: "meningioma", probability: 0.95 } }], score: 60 };
const routine: AiPriority = { level: "ROUTINE", reasons: [], score: 2 };

function item(id: string, priority: AiPriority, surname: string): AiRunListItem {
  return {
    classificationModelId: "brain-efficientnetb4-tumor-classification",
    classificationWeightsSha256: null,
    clinicianImpression: null,
    createdAt: "2026-10-23T09:00:00.000Z",
    decidedAt: null,
    decidedById: null,
    decidedByName: null,
    decisionLabel: null,
    decisionLabels: null,
    decisionReason: null,
    decisionStatus: null,
    decisionThreshold: null,
    durationMs: 2000,
    errorCode: null,
    hasMask: false,
    hasOverlay: false,
    hasSlice: false,
    hasTrace: false,
    id,
    magnification: null,
    malignancyScore: null,
    maskAreaPx: null,
    maskAreaRatio: null,
    modelDecision: null,
    modelLabel: "glioma",
    modelLabels: null,
    nucleiFractions: null,
    patient: { firstName: "Amina", firstNameAr: "أمينة", id: `patient-${id}`, lastName: surname, lastNameAr: "بن علي" },
    patientId: `patient-${id}`,
    pipeline: "brain",
    predictions: [
      { label: "glioma", probability: 0.91 },
      { label: "notumor", probability: 0.09 },
    ],
    priority,
    reportNumber: null,
    requestedById: "doctor-1",
    segmentationModelId: null,
    segmentationSkippedReason: null,
    segmentationWeightsSha256: null,
    sourceDocumentId: "doc-1",
    status: "SUCCEEDED",
    tileCount: null,
    ttaScores: null,
    updatedAt: "2026-10-23T09:00:00.000Z",
  };
}

const page = (items: AiRunListItem[]): AiRunsPage => ({ items, limit: 20, page: 1, total: items.length, totalPages: 1 });
const items = [item("run-urgent", urgent, "Haddad"), item("run-high", high, "Benali"), item("run-routine", routine, "Cherif")];

const render = (state: Partial<TrackingState> = {}, data: AiRunsPage = page(items), t = fr) => {
  (useAiRunsOverview as jest.Mock).mockReturnValue({ data, error: null, isError: false, isFetching: false, isLoading: false });
  return renderToStaticMarkup(
    <AiRunsWorklist accountType="DOCTOR" locale={t === fr ? "fr" : "ar"} roleBase="/doctor" state={{ ...DEFAULT_TRACKING_STATE, ...state }} t={t} update={jest.fn()} />,
  );
};

describe("the worklist, by reading priority", () => {
  it("asks the API for the priority order by default", () => {
    render();

    expect(useAiRunsOverview).toHaveBeenLastCalledWith(expect.objectContaining({ decision: "pending", priority: undefined, sort: "priority" }));
  });

  it("asks for the date order when the date is chosen, and for a level when one is filtered", () => {
    render({ sort: "date" });
    expect(useAiRunsOverview).toHaveBeenLastCalledWith(expect.objectContaining({ sort: undefined }));

    render({ priority: "URGENT" });
    expect(useAiRunsOverview).toHaveBeenLastCalledWith(expect.objectContaining({ priority: "URGENT", sort: "priority" }));
  });

  it("opens sorted by priority, with the date as the other choice", () => {
    const html = render();

    expect(html).toContain(fr("aiAnalyses.priority.sort.label"));
    expect(html).toMatch(/<option value="priority" selected="">Priorité de lecture<\/option>/);
    expect(html).toMatch(/<option value="date">Date \(récentes d&#x27;abord\)<\/option>|<option value="date">Date \(récentes d’abord\)<\/option>/);
  });

  it("shows the date as the sort when it is chosen", () => {
    expect(render({ sort: "date" })).toMatch(/<option value="date" selected="">/);
  });

  it("offers every level as a filter, and every priority", () => {
    const html = render();

    expect(html).toContain(fr("aiAnalyses.priority.filter.label"));
    for (const label of [fr("aiAnalyses.priority.filter.all"), "Urgent", "Élevée", "Routine"]) {
      expect(html).toContain(`>${escaped(label)}</option>`);
    }
    expect(html).toMatch(/<option value="all" selected="">Toutes les priorités<\/option>/);
  });

  it("locks the sort under a priority filter: that level is listed in priority order", () => {
    const html = render({ priority: "HIGH", sort: "date" });

    expect(html).toMatch(/<select id="[^"]*-sort"[^>]*\sdisabled=""/);
    expect(html).toContain(`title="${escaped(fr("aiAnalyses.priority.sort.locked"))}"`);
    // It reads as what it really is.
    expect(html).toMatch(/<option value="priority" selected="">/);
  });

  it("leaves the sort free without a priority filter", () => {
    expect(render()).not.toMatch(/<select id="[^"]*-sort"[^>]*\sdisabled=""/);
  });

  it("counts a priority filter among the filters, and offers to reset it", () => {
    const html = render({ priority: "URGENT" });

    expect(html).toContain(fr("aiAnalyses.tracking.filters.reset"));
    // Only a priority is filtered: one active filter.
    expect(html).toMatch(/text-white">1<\/span>/);
  });

  it("says, above the list, that it is an order of reading and not a diagnosis", () => {
    const html = render();

    expect(html).toContain('role="note"');
    expect(html).toContain(escaped(fr("aiAnalyses.priority.disclaimer")));
    expect(fr("aiAnalyses.priority.disclaimer")).toMatch(/ordre de lecture.*pas un diagnostic/);
  });

  it("gives the table a priority column, with a badge on URGENT and HIGH runs only", () => {
    const html = render();

    expect(html).toContain(`>${fr("aiAnalyses.priority.column")}</th>`);
    // Each run is drawn twice (a card, a table row): 2 URGENT, 2 HIGH, no ROUTINE badge.
    expect(html.match(/data-priority="URGENT"/g)).toHaveLength(2);
    expect(html.match(/data-priority="HIGH"/g)).toHaveLength(2);
    expect(html).not.toContain('data-priority="ROUTINE"');
  });

  it("puts the reasons in the badge: on hover, and as text", () => {
    const html = render();

    // One line per reason, a newline in the attribute: what a browser shows as a tooltip.
    expect(html).toMatch(/title="Priorité de lecture : Urgent\n• Gliome proposé par le modèle \(91\s?%\)\.\nOrdre de lecture, pas un diagnostic\."/);
    expect(html).toMatch(/Méningiome proposé par le modèle \(95\s?%\)/);
  });

  it("keeps the order the API gave, run after run", () => {
    const html = render();
    const order = [...html.matchAll(/runs\/(run-[a-z]+)\?patient/g)].map((match) => match[1]);

    // Table rows and cards, each in the API's order.
    expect(order.slice(0, 3)).toEqual(["run-urgent", "run-high", "run-routine"]);
  });

  it("speaks Arabic as well", () => {
    const html = render({}, page(items), ar);

    expect(html).toContain(dictionaries.ar.aiAnalyses.priority.disclaimer);
    expect(html).toContain(dictionaries.ar.aiAnalyses.priority.levels.URGENT);
    expect(html).not.toContain("aiAnalyses.priority");
  });
});
