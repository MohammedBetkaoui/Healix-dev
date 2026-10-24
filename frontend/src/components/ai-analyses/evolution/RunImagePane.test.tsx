import { renderToStaticMarkup } from "react-dom/server";

import { type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";
import { type TimelineItem } from "@/features/ai-analyses/ai-timeline";
import {
  useAiAnalysisRunMask,
  useAiAnalysisRunOverlay,
  useAiAnalysisRunSlice,
} from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { usePatientDocumentView } from "@/features/patients/hooks/use-patient-document-view";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { RunImagePane } from "./RunImagePane";

jest.mock("@/features/ai-analyses/hooks/use-ai-analysis-run", () => ({
  useAiAnalysisRunMask: jest.fn(),
  useAiAnalysisRunOverlay: jest.fn(),
  useAiAnalysisRunSlice: jest.fn(),
}));
jest.mock("@/features/patients/hooks/use-patient-document-view", () => ({ usePatientDocumentView: jest.fn() }));
// The viewer needs a browser: what it is given is what is checked.
let viewerProps: Record<string, unknown> | null = null;
jest.mock("../viewer/ImageViewer", () => ({
  ImageViewer: (props: Record<string, unknown>) => {
    viewerProps = props;
    return <div data-viewer="true" />;
  },
}));

const fr = (key: string, params?: Record<string, number | string>) => translate(dictionaries.fr, key, params);
const source = new Blob(["source"]);
const slice = new Blob(["slice"]);
const mask = new Blob(["mask"]);
const overlay = new Blob(["overlay"]);
const none = { data: undefined, isError: false };

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    comparison: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    decisionLabel: null,
    decisionStatus: null,
    hasMask: false,
    hasOverlay: false,
    hasSlice: false,
    hasTrace: false,
    label: null,
    labels: null,
    measures: {},
    model: { id: "m", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: "a".repeat(64) },
    pixelSpacingMm: null,
    runId: "run-1",
    source: "image",
    sourceDocumentId: "doc-1",
    ...overrides,
  };
}

function render(pipeline: AiPipelineId, run: TimelineItem, queries: { document?: object; mask?: object; overlay?: object; slice?: object } = {}) {
  viewerProps = null;
  (usePatientDocumentView as jest.Mock).mockReturnValue(queries.document ?? { data: source, isError: false });
  (useAiAnalysisRunMask as jest.Mock).mockReturnValue(queries.mask ?? none);
  (useAiAnalysisRunOverlay as jest.Mock).mockReturnValue(queries.overlay ?? none);
  (useAiAnalysisRunSlice as jest.Mock).mockReturnValue(queries.slice ?? none);
  return renderToStaticMarkup(<RunImagePane item={run} patientId="patient-1" pipeline={pipeline} t={fr} />);
}

const enabledOf = (hook: unknown) => (hook as jest.Mock).mock.calls.at(-1)?.at(-1) as { enabled: boolean };

describe("RunImagePane", () => {
  it("shows a brain run on its source image, with its mask over it", () => {
    render("brain", item({ hasMask: true }), { mask: { data: mask, isError: false } });

    expect(viewerProps).toMatchObject({
      blob: source,
      module: "brain",
      overlay: { color: "var(--ai-module-color)", kind: "mask", opacity: 0.4, src: mask },
    });
    expect(usePatientDocumentView).toHaveBeenLastCalledWith("patient-1", "doc-1", { enabled: true });
    expect(useAiAnalysisRunMask).toHaveBeenLastCalledWith("patient-1", "run-1", { enabled: true });
  });

  it("fetches no mask for a brain run that outlined nothing", () => {
    render("brain", item({ hasMask: false }));

    expect(enabledOf(useAiAnalysisRunMask)).toEqual({ enabled: false });
    expect(viewerProps?.overlay).toBeUndefined();
  });

  it("shows a nuclei map on its source image, with its colour overlay", () => {
    render("pathology-nuclei", item({ hasOverlay: true }), { overlay: { data: overlay, isError: false } });

    expect(viewerProps).toMatchObject({ blob: source, module: "pathology", overlay: { kind: "image", opacity: 0.6, src: overlay } });
    expect(enabledOf(useAiAnalysisRunOverlay)).toEqual({ enabled: true });
    // The mask is the brain's: not fetched here.
    expect(enabledOf(useAiAnalysisRunMask)).toEqual({ enabled: false });
  });

  it("shows a cardiac MRI on the slice as analysed, not on its source (a DICOM cannot be shown), with its overlay", () => {
    render("cardio-seg-mri", item({ hasOverlay: true, hasSlice: true, source: "dicom" }), {
      overlay: { data: overlay, isError: false },
      slice: { data: slice, isError: false },
    });

    expect(viewerProps).toMatchObject({ blob: slice, module: "cardiology", overlay: { kind: "image", src: overlay } });
    expect(enabledOf(useAiAnalysisRunSlice)).toEqual({ enabled: true });
    // The source document is not downloaded (each download is an audited view).
    expect(usePatientDocumentView).toHaveBeenLastCalledWith("patient-1", "doc-1", { enabled: false });
  });

  it("shows a breast slide alone: it has no mask", () => {
    render("pathology-breast", item());

    expect(viewerProps).toMatchObject({ blob: source, module: "pathology" });
    expect(viewerProps?.overlay).toBeUndefined();
    expect(enabledOf(useAiAnalysisRunOverlay)).toEqual({ enabled: false });
  });

  it("shows no image for an ECG, whose source is a signal, and fetches nothing", () => {
    const html = render("cardio-ecg", item({ source: "signal" }));

    expect(html).toContain(fr("aiAnalyses.evolution.compare.noImage"));
    expect(html).not.toContain("data-viewer");
    expect(usePatientDocumentView).toHaveBeenLastCalledWith("patient-1", "doc-1", { enabled: false });
  });

  it("says the image is loading, then that it could not be shown", () => {
    render("brain", item(), { document: { data: undefined, isError: false } });
    expect(viewerProps).toMatchObject({ blob: null, placeholder: fr("aiAnalyses.evolution.compare.imageLoading") });

    render("brain", item(), { document: { data: undefined, isError: true } });
    expect(viewerProps).toMatchObject({ blob: null, placeholder: fr("aiAnalyses.evolution.compare.imageError") });
  });
});
