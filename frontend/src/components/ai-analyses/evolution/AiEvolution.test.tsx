import { renderToStaticMarkup } from "react-dom/server";

import { useAiAnalysisRuns } from "@/features/ai-analyses/hooks/use-ai-analysis-runs";
import { useAiTimeline } from "@/features/ai-analyses/hooks/use-ai-timeline";
import {
  buildMeasureChart,
  type AiTimeline,
  type MeasureInfo,
  type TimelineItem,
} from "@/features/ai-analyses/ai-timeline";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { AiComparison } from "./AiComparison";
import { AiEvolutionSection } from "./AiEvolutionSection";
import { AiMeasureChart } from "./AiMeasureChart";

jest.mock("@/features/ai-analyses/hooks/use-ai-analysis-runs", () => ({ useAiAnalysisRuns: jest.fn() }));
jest.mock("@/features/ai-analyses/hooks/use-ai-timeline", () => ({ useAiTimeline: jest.fn() }));
// The viewer needs a browser (object URLs, pointer events): the panes are checked through their props.
jest.mock("./RunImagePane", () => ({
  RunImagePane: ({ item, pipeline }: { item: { runId: string }; pipeline: string }) => (
    <div data-image-pane={item.runId} data-pane-pipeline={pipeline} />
  ),
}));

const fr = (key: string, params?: Record<string, number | string>) => translate(dictionaries.fr, key, params);
const ar = (key: string, params?: Record<string, number | string>) => translate(dictionaries.ar, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const brainMeasures: MeasureInfo[] = [
  { area: false, key: "topProbability", unit: "probability" },
  { area: true, key: "maskAreaPx", unit: "px" },
  { area: false, key: "maskAreaRatio", unit: "ratio" },
];

function item(id: string, day: number, maskAreaPx: number | null, overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    comparison: null,
    createdAt: new Date(Date.UTC(2026, 8, day, 10)).toISOString(),
    decisionLabel: null,
    decisionStatus: null,
    hasMask: maskAreaPx !== null,
    hasOverlay: false,
    hasSlice: false,
    hasTrace: false,
    label: "meningioma",
    labels: null,
    measures: { maskAreaPx, maskAreaRatio: maskAreaPx === null ? null : maskAreaPx / 65_536, topProbability: 0.9 },
    model: { id: "brain-model", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: SHA_A },
    pixelSpacingMm: null,
    runId: id,
    slice: null,
    source: "image",
    sourceDocumentId: `doc-${id}`,
    ...overrides,
  };
}

const unreliable = { caveats: ["NO_PIXEL_SPACING" as const], deltas: { maskAreaPx: { percent: 20, value: 200 } }, labelChanged: false, previousRunId: "r1", reliable: false };

const brainTimeline = (items: TimelineItem[], primaryMeasure = "maskAreaPx"): AiTimeline => ({
  items,
  measures: brainMeasures,
  patientId: "patient-1",
  pipeline: "brain",
  primaryMeasure,
});

const threeRuns = [
  item("r1", 1, 1000),
  item("r2", 15, 1200, { comparison: unreliable }),
  item("r3", 29, 900, { comparison: { ...unreliable, caveats: ["MODEL_CHANGED", "NO_PIXEL_SPACING"], previousRunId: "r2" }, model: { id: "brain-model", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: SHA_B } }),
];

function show(timeline: AiTimeline | undefined, options: { error?: boolean; runs?: unknown[]; t?: typeof fr } = {}) {
  const t = options.t ?? fr;
  (useAiAnalysisRuns as jest.Mock).mockReturnValue({ data: options.runs ?? [], isPending: false });
  (useAiTimeline as jest.Mock).mockReturnValue({ data: timeline, isError: options.error ?? false });
  return renderToStaticMarkup(<AiEvolutionSection locale={t === fr ? "fr" : "ar"} patientId="patient-1" t={t} />);
}

describe("AiEvolutionSection", () => {
  it("opens on the chain the patient has most runs of, with its count in the selector", () => {
    const runs = [
      { pipeline: "cardio-ecg", status: "SUCCEEDED" },
      { pipeline: "brain", status: "SUCCEEDED" },
      { pipeline: "cardio-ecg", status: "SUCCEEDED" },
      { pipeline: "cardio-ecg", status: "FAILED" },
    ];

    const html = show(undefined, { runs });

    expect(useAiTimeline).toHaveBeenLastCalledWith("patient-1", "cardio-ecg", { enabled: true });
    expect(html).toContain('data-pipeline="cardio-ecg"');
    expect(html).toMatch(/<option value="cardio-ecg" selected="">[^<]*\(2\)<\/option>/);
    expect(html).toMatch(/<option value="brain">[^<]*\(1\)<\/option>/);
  });

  it("offers the five chains", () => {
    const html = show(brainTimeline(threeRuns));

    for (const pipeline of ["brain", "pathology-breast", "pathology-nuclei", "cardio-ecg", "cardio-seg-mri"]) {
      expect(html).toContain(`<option value="${pipeline}"`);
    }
  });

  it("draws the main measure, the tumour area, and names it", () => {
    const html = show(brainTimeline(threeRuns));

    expect(html).toContain('role="img"');
    expect(html).toMatch(/<option value="maskAreaPx" selected="">Surface du masque \(px\)<\/option>/);
    expect(html.match(/data-point="/g)).toHaveLength(3);
  });

  it("offers the measures that have a value, and not the others", () => {
    const html = show(brainTimeline([item("r1", 1, null), item("r2", 15, null)], "topProbability"));

    expect(html).toContain('<option value="topProbability" selected="">');
    expect(html).not.toContain('<option value="maskAreaPx"');
  });

  it("warns that a 2D surface is not a volume, for the chains whose measures are areas", () => {
    expect(show(brainTimeline(threeRuns))).toContain(escaped("Une surface 2D ne remplace pas une mesure volumétrique ; les coupes doivent être comparables."));
  });

  it("does not warn about a surface for a chain with no area", () => {
    (useAiAnalysisRuns as jest.Mock).mockReturnValue({ data: [], isPending: false });
    (useAiTimeline as jest.Mock).mockReturnValue({
      data: { items: [], measures: [{ area: false, key: "malignancyScore", unit: "score" }], patientId: "patient-1", pipeline: "pathology-breast", primaryMeasure: "malignancyScore" },
      isError: false,
    });
    // Breast is not the busiest chain with no runs (brain is the fallback): the warning follows the chain asked.
    const html = renderToStaticMarkup(<AiEvolutionSection locale="fr" patientId="patient-1" t={fr} />);

    expect(useAiTimeline).toHaveBeenLastCalledWith("patient-1", "brain", { enabled: true });
    expect(html).toContain("Une surface 2D");
  });

  it("lists the analyses in a table: date, result, value, change, decision, source", () => {
    const html = show(brainTimeline(threeRuns));

    for (const column of ["date", "result", "value", "change", "decision", "source"]) {
      expect(html).toContain(`>${escaped(fr(`aiAnalyses.evolution.table.${column}`))}</th>`);
    }
    expect(html.match(/<tr data-run="r\d"/g)).toEqual(['<tr data-run="r1"', '<tr data-run="r2"', '<tr data-run="r3"']);
    expect(html).toContain(fr("aiAnalyses.evolution.table.first"));
  });

  it("names the series and the slice of a run made on a slice of a DICOM study, in the table and in the comparison", () => {
    const sliced = (id: string, day: number, number: number) =>
      item(id, day, 1000, { slice: { instanceNumber: number, seriesNumber: 3 }, source: "dicom" });
    const html = show(brainTimeline([sliced("r1", 1, 12), sliced("r2", 15, 14)]));

    expect(html).toContain('data-slice="true"');
    expect(html.match(/data-slice="true">[^<]*</g)).toEqual([
      `data-slice="true">${fr("dicom.analysis.slice", { instance: 12, series: 3 })}<`,
      `data-slice="true">${fr("dicom.analysis.slice", { instance: 14, series: 3 })}<`,
    ]);
    // The side-by-side header of each run says it too.
    expect(html).toContain(`DICOM · ${fr("dicom.analysis.slice", { instance: 12, series: 3 })}`);
    expect(html).toContain(`DICOM · ${fr("dicom.analysis.slice", { instance: 14, series: 3 })}`);
  });

  it("says a missing number rather than guessing one, and names no slice for an ordinary image", () => {
    const html = show(
      brainTimeline([
        item("r1", 1, 1000, { slice: { instanceNumber: null, seriesNumber: 3 }, source: "dicom" }),
        item("r2", 15, 1000),
      ]),
    );

    expect(html).toContain(fr("dicom.analysis.slice", { instance: fr("dicom.analysis.noNumber"), series: 3 }));
    expect(html.match(/data-slice="true"/g)).toHaveLength(1);
  });

  it("shows the change with the previous analysis in value and in %, and flags the one that cannot be trusted", () => {
    const html = show(brainTimeline(threeRuns));

    expect(html).toMatch(/\+200 px/);
    expect(html).toMatch(/\+20 %/);
    // Two rows of the table, and the note of the comparison below it.
    expect(html.match(/<span data-reliability="unreliable"/g)).toHaveLength(2);
    expect(html.match(/<div data-reliability="unreliable"/g)).toHaveLength(1);
    expect(html).toContain(escaped(fr("aiAnalyses.evolution.caveats.NO_PIXEL_SPACING")));
    expect(html).toContain(escaped(fr("aiAnalyses.evolution.caveats.MODEL_CHANGED")));
  });

  it("marks a trusted comparison as reliable", () => {
    const reliable = { caveats: [], deltas: { maskAreaPx: { percent: 10, value: 100 } }, labelChanged: false, previousRunId: "r1", reliable: true };

    expect(show(brainTimeline([item("r1", 1, 1000), item("r2", 15, 1100, { comparison: reliable })]))).toContain('data-reliability="reliable"');
  });

  it("compares the last two analyses at first, side by side", () => {
    const html = show(brainTimeline(threeRuns));

    expect(html).toContain(fr("aiAnalyses.evolution.compare.title"));
    expect(html).toMatch(/<option value="r2" selected="">/);
    expect(html).toMatch(/<option value="r3" selected="">/);
    expect(html.match(/data-image-pane="r\d"/g)).toEqual(['data-image-pane="r2"', 'data-image-pane="r3"']);
  });

  it("says a single analysis shows no evolution yet, and does not offer a comparison", () => {
    const html = show(brainTimeline([item("r1", 1, 1000)]));

    expect(html).toContain(escaped(fr("aiAnalyses.evolution.single")));
    expect(html).not.toContain(fr("aiAnalyses.evolution.compare.title"));
    expect(html).toContain('role="img"');
  });

  it("says there is nothing to follow when the chain has no successful run", () => {
    expect(show(brainTimeline([]))).toContain(escaped(fr("aiAnalyses.evolution.empty")));
  });

  it("says it is loading, and when it could not load", () => {
    expect(show(undefined)).toContain(escaped(fr("aiAnalyses.evolution.loading")));

    const html = show(undefined, { error: true });
    expect(html).toContain('role="alert"');
    expect(html).toContain(escaped(fr("aiAnalyses.evolution.error")));
  });

  it("speaks Arabic as well", () => {
    const html = show(brainTimeline(threeRuns), { t: ar });

    expect(html).toContain(dictionaries.ar.aiAnalyses.evolution.title);
    expect(html).toContain(dictionaries.ar.aiAnalyses.evolution.warning2d);
    expect(html).not.toContain("aiAnalyses.evolution");
  });
});

describe("AiMeasureChart", () => {
  const render = (items: TimelineItem[], locale: "ar" | "fr" = "fr") => {
    const measure = brainMeasures[1];
    return renderToStaticMarkup(
      <AiMeasureChart chart={buildMeasureChart(items, measure)!} locale={locale} measure={measure} measureName="Surface du masque (px)" t={locale === "fr" ? fr : ar} />,
    );
  };

  it("is an image with a title and a text summary", () => {
    const html = render(threeRuns);

    expect(html).toContain('role="img"');
    expect(html).toContain("Évolution de la mesure dans le temps");
    expect(html).toMatch(/Courbe de « Surface du masque \(px\) » sur 3 analyses, du 1 septembre 2026 au 29 septembre 2026\./);
  });

  it("draws a dashed line and a hollow point where the comparison cannot be trusted", () => {
    const html = render(threeRuns);

    expect(html.match(/data-segment="unreliable"/g)).toHaveLength(2);
    expect(html.match(/data-point="unreliable"/g)).toHaveLength(2);
    expect(html.match(/data-point="reliable"/g)).toHaveLength(1);
    expect(html).toContain(escaped(fr("aiAnalyses.evolution.chart.dashedLegend")));
  });

  it("draws a plain line and no legend when every comparison can be trusted", () => {
    const reliable = { caveats: [], deltas: {}, labelChanged: false, previousRunId: "r1", reliable: true };
    const html = render([item("r1", 1, 1000), item("r2", 15, 1100, { comparison: reliable })]);

    expect(html).toContain('data-segment="reliable"');
    expect(html).not.toContain('data-segment="unreliable"');
    expect(html).not.toContain("aiAnalyses.evolution.chart.dashedLegend");
    expect(html).not.toContain(escaped(fr("aiAnalyses.evolution.chart.dashedLegend")));
  });

  it("names each point in a tooltip, with its value, and says when it cannot be trusted", () => {
    const html = render(threeRuns);

    expect(html).toMatch(/<title>1 septembre 2026 : 1\s?000 px<\/title>/);
    expect(html).toMatch(/<title>15 septembre 2026 : 1\s?200 px \(comparaison non fiable avec l’analyse précédente\)<\/title>/);
  });

  it("keeps the time axis left to right, in Arabic too", () => {
    expect(render(threeRuns, "ar")).toContain('dir="ltr"');
  });
});

describe("AiComparison", () => {
  const timeline = brainTimeline(threeRuns);
  const render = (earlierId: string, laterId: string, t = fr, source: AiTimeline = timeline) =>
    renderToStaticMarkup(
      <AiComparison earlierId={earlierId} laterId={laterId} locale={t === fr ? "fr" : "ar"} onChange={jest.fn()} patientId="patient-1" t={t} timeline={source} />,
    );

  it("shows the two analyses side by side, the earlier one first", () => {
    const html = render("r1", "r3");

    expect(html.match(/data-image-pane="r\d"/g)).toEqual(['data-image-pane="r1"', 'data-image-pane="r3"']);
    expect(html).toContain(fr("aiAnalyses.evolution.compare.earlier"));
    expect(html).toContain(fr("aiAnalyses.evolution.compare.later"));
  });

  it("puts them in the order of their dates, whichever way they were picked", () => {
    expect(render("r3", "r1").match(/data-image-pane="r\d"/g)).toEqual(['data-image-pane="r1"', 'data-image-pane="r3"']);
  });

  it("compares any two analyses, not only neighbours: the table has their values and the gap", () => {
    const html = render("r1", "r3");

    expect(html).toContain('data-measure="maskAreaPx"');
    expect(html).toMatch(/1\s?000 px/);
    expect(html).toMatch(/900 px/);
    expect(html).toMatch(/[-−]100 px/);
    expect(html).toMatch(/[-−]10 %/);
  });

  it("lists the measures that have a value only", () => {
    const html = render("r1", "r2");

    expect(html).toContain('data-measure="topProbability"');
    expect(html).toContain('data-measure="maskAreaPx"');
    expect(html).toContain('data-measure="maskAreaRatio"');
    expect(render("r1", "r2", fr, brainTimeline([item("r1", 1, null), item("r2", 2, null)], "topProbability"))).not.toContain('data-measure="maskAreaPx"');
  });

  it("says why the comparison cannot be trusted, cause by cause", () => {
    const html = render("r1", "r3");

    expect(html).toContain('data-reliability="unreliable"');
    expect(html).toContain('data-caveat="MODEL_CHANGED"');
    expect(html).toContain('data-caveat="NO_PIXEL_SPACING"');
    expect(html).not.toContain('data-caveat="SOURCE_CHANGED"');
    expect(html).toContain(escaped(fr("aiAnalyses.evolution.caveats.MODEL_CHANGED")));
  });

  it("says the comparison is reliable when it is", () => {
    const reliable = brainTimeline([item("r1", 1, null), item("r2", 15, null)], "topProbability");

    const html = render("r1", "r2", fr, reliable);

    expect(html).toContain('data-reliability="reliable"');
    expect(html).toContain(escaped(fr("aiAnalyses.evolution.compare.reliable")));
  });

  it("warns that a 2D surface is not a volume, and that the slices must be comparable", () => {
    expect(render("r1", "r2")).toContain(escaped("Une surface 2D ne remplace pas une mesure volumétrique ; les coupes doivent être comparables."));
  });

  it("says when the result changed, and the days between the analyses", () => {
    const changed = brainTimeline([item("r1", 1, null), item("r2", 11, null, { label: "notumor" })], "topProbability");

    const html = render("r1", "r2", fr, changed);

    expect(html).toContain("Le résultat a changé : Méningiome → Pas de tumeur.");
    expect(html).toContain("10 jour(s) entre les deux analyses");
  });

  it("asks for two different analyses when the same one is picked twice", () => {
    const html = render("r1", "r1");

    expect(html).toContain('role="status"');
    expect(html).toContain(fr("aiAnalyses.evolution.compare.same"));
    expect(html).not.toContain("data-image-pane");
  });

  it("lets the user pick each analysis among all of them, by date and result", () => {
    const html = render("r1", "r3");

    expect(html.match(/<option value="r\d"/g)).toHaveLength(6);
    expect(html).toMatch(/<option value="r1" selected="">1 septembre 2026 · Méningiome<\/option>/);
  });

  it("speaks Arabic as well", () => {
    const html = render("r1", "r3", ar);

    expect(html).toContain(dictionaries.ar.aiAnalyses.evolution.compare.title);
    expect(html).toContain(dictionaries.ar.aiAnalyses.evolution.caveats.MODEL_CHANGED);
    expect(html).not.toContain("aiAnalyses.evolution");
  });
});
