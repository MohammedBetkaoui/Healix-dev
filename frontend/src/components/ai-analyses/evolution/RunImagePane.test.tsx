import { renderToStaticMarkup } from "react-dom/server";

import { type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";
import { type TimelineItem } from "@/features/ai-analyses/ai-timeline";
import {
  useAiAnalysisRun,
  useAiAnalysisRunMask,
  useAiAnalysisRunOverlay,
  useAiAnalysisRunSlice,
  useAiAnalysisVolumeImage,
} from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { middleSlice } from "@/features/ai-analyses/volumetry";
import { cineRunFixture, volumetryFixture } from "@/features/ai-analyses/volumetry.fixtures";
import { usePatientDocumentView } from "@/features/patients/hooks/use-patient-document-view";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { RunImagePane } from "./RunImagePane";

jest.mock("@/features/ai-analyses/hooks/use-ai-analysis-run", () => ({
  useAiAnalysisRun: jest.fn(),
  useAiAnalysisRunMask: jest.fn(),
  useAiAnalysisRunOverlay: jest.fn(),
  useAiAnalysisRunSlice: jest.fn(),
  useAiAnalysisVolumeImage: jest.fn(),
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
    slice: null,
    source: "image",
    sourceDocumentId: "doc-1",
    ...overrides,
  };
}

type Queries = {
  cineOverlay?: object;
  cineSlice?: object;
  document?: object;
  mask?: object;
  overlay?: object;
  run?: object;
  slice?: object;
};

function render(pipeline: AiPipelineId, run: TimelineItem, queries: Queries = {}) {
  viewerProps = null;
  (usePatientDocumentView as jest.Mock).mockReturnValue(queries.document ?? { data: source, isError: false });
  (useAiAnalysisRunMask as jest.Mock).mockReturnValue(queries.mask ?? none);
  (useAiAnalysisRunOverlay as jest.Mock).mockReturnValue(queries.overlay ?? none);
  (useAiAnalysisRunSlice as jest.Mock).mockReturnValue(queries.slice ?? none);
  (useAiAnalysisRun as jest.Mock).mockReturnValue(queries.run ?? none);
  // The same hook serves the slice and its overlay of a cine, told apart by the kind asked.
  (useAiAnalysisVolumeImage as jest.Mock).mockImplementation((_patient: string, _run: string, kind: string) =>
    kind === "overlay" ? (queries.cineOverlay ?? none) : (queries.cineSlice ?? none),
  );
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

  describe("a cardiac cine", () => {
    const cine = (overrides: Partial<TimelineItem> = {}) => item({ hasMask: true, source: "dicom", ...overrides });

    it("shows the middle slice of its end-diastole, as the model segmented it, with its overlay", () => {
      const volumetry = volumetryFixture();
      render("cardio-volume-mri", cine(), {
        cineOverlay: { data: overlay, isError: false },
        cineSlice: { data: slice, isError: false },
        run: { data: cineRunFixture({ volumetry }), isError: false },
      });

      expect(viewerProps).toMatchObject({ blob: slice, module: "cardiology", overlay: { kind: "image", opacity: 0.6, src: overlay } });
      const middle = middleSlice(volumetry);
      expect(useAiAnalysisRun).toHaveBeenLastCalledWith("patient-1", "run-1");
      expect(useAiAnalysisVolumeImage).toHaveBeenCalledWith("patient-1", "run-1", "slice", "ed", middle, { enabled: true });
      expect(useAiAnalysisVolumeImage).toHaveBeenCalledWith("patient-1", "run-1", "overlay", "ed", middle, { enabled: true });
      // A series of DICOM files cannot be shown as a document, and each download is an audited view.
      expect(usePatientDocumentView).toHaveBeenLastCalledWith("patient-1", "doc-1", { enabled: false });
      // The brain's mask and the nuclei overlay are not the cine's.
      expect(enabledOf(useAiAnalysisRunMask)).toEqual({ enabled: false });
      expect(enabledOf(useAiAnalysisRunSlice)).toEqual({ enabled: false });
    });

    it("fetches no image before it knows how many slices the run holds", () => {
      render("cardio-volume-mri", cine(), { run: { data: undefined, isError: false } });

      expect(useAiAnalysisVolumeImage).toHaveBeenCalledWith("patient-1", "run-1", "slice", "ed", 0, { enabled: false });
      expect(viewerProps).toMatchObject({ blob: null, placeholder: fr("aiAnalyses.evolution.compare.imageLoading") });
    });
  });

  it("does not load the run of an analysis that is not a cine", () => {
    render("brain", item());
    expect(useAiAnalysisRun).toHaveBeenLastCalledWith("", "run-1");
    expect(enabledOf(useAiAnalysisVolumeImage)).toEqual({ enabled: false });
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
