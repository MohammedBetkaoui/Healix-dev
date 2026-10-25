// Pure rules of the cardiac cine volumetry page: the ejection fraction class, the
// numbering shown to the physician, the correction form, the curve geometry.
// Mirrors backend/src/ai-analysis-runs/volumetry (the measures themselves are
// calculated there, from the stored areas: nothing here recomputes a volume).
//
// Phases and slices are stored from 0 and shown from 1; slice 1 is the base.

import { isAxiosError } from "axios";

import {
  type AiVolumetry,
  type AiVolumetryMeasures,
  type AiVolumetryWarning,
  type LvefClass,
} from "./ai-analyses.types";

// ---------------------------------------------------------------- LVEF class

/** 2021 ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure. */
export const LVEF_REDUCED_MAX = 40;
export const LVEF_MILDLY_REDUCED_MAX = 49;
export const LVEF_CLASS_SOURCE = {
  authors: "McDonagh TA et al.",
  doi: "10.1093/eurheartj/ehab368",
  reference: "Eur Heart J 2021;42:3599-3726",
  title: "2021 ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
} as const;

/** The class of a left ventricular ejection fraction (%), read on the value rounded to the unit, as it is reported. */
export function lvefClassOf(efPercent: number | null): LvefClass | null {
  if (efPercent === null || !Number.isFinite(efPercent)) return null;
  const reported = Math.floor(efPercent + 0.5);
  if (reported <= LVEF_REDUCED_MAX) return "reduced";
  return reported <= LVEF_MILDLY_REDUCED_MAX ? "mildlyReduced" : "preserved";
}

// ----------------------------------------------------------------- numbering

export const phaseNumber = (phase: number) => phase + 1;
export const sliceNumber = (slice: number) => slice + 1;

// ------------------------------------------------------------ the measures

export type VolumeRowKey =
  | "lvEdv"
  | "lvEsv"
  | "lvSv"
  | "lvEf"
  | "lvMass"
  | "cardiacOutput"
  | "rvEdv"
  | "rvEsv"
  | "rvEf";

export type VolumeRow = {
  key: VolumeRowKey;
  group: "lv" | "rv";
  /** Digits shown. */
  digits: number;
  unit: "ml" | "percent" | "g" | "lMin";
  of: (measures: AiVolumetryMeasures) => number | null;
  /** The value per m² of body surface area, and its unit and digits. */
  indexed?: {
    digits: number;
    of: (measures: AiVolumetryMeasures) => number | null | undefined;
    unit: "mlM2" | "gM2" | "lMinM2";
  };
  /** No line at all without a value (the cardiac output needs a heart rate). */
  optional?: boolean;
};

/** The measures in the order they are read. */
export const volumeRows: readonly VolumeRow[] = [
  { digits: 0, group: "lv", indexed: { digits: 0, of: (m) => m.indexed?.lvEdvMlM2, unit: "mlM2" }, key: "lvEdv", of: (m) => m.lv.edvMl, unit: "ml" },
  { digits: 0, group: "lv", indexed: { digits: 0, of: (m) => m.indexed?.lvEsvMlM2, unit: "mlM2" }, key: "lvEsv", of: (m) => m.lv.esvMl, unit: "ml" },
  { digits: 0, group: "lv", indexed: { digits: 0, of: (m) => m.indexed?.lvSvMlM2, unit: "mlM2" }, key: "lvSv", of: (m) => m.lv.svMl, unit: "ml" },
  { digits: 0, group: "lv", key: "lvEf", of: (m) => m.lv.efPercent, unit: "percent" },
  { digits: 0, group: "lv", indexed: { digits: 0, of: (m) => m.indexed?.lvMassGM2, unit: "gM2" }, key: "lvMass", of: (m) => m.lvMassG, unit: "g" },
  {
    digits: 1,
    group: "lv",
    indexed: { digits: 1, of: (m) => m.indexed?.cardiacIndexLMinM2, unit: "lMinM2" },
    key: "cardiacOutput",
    of: (m) => m.cardiacOutputLMin,
    optional: true,
    unit: "lMin",
  },
  { digits: 0, group: "rv", indexed: { digits: 0, of: (m) => m.indexed?.rvEdvMlM2, unit: "mlM2" }, key: "rvEdv", of: (m) => m.rv.edvMl, unit: "ml" },
  { digits: 0, group: "rv", indexed: { digits: 0, of: (m) => m.indexed?.rvEsvMlM2, unit: "mlM2" }, key: "rvEsv", of: (m) => m.rv.esvMl, unit: "ml" },
  { digits: 0, group: "rv", key: "rvEf", of: (m) => m.rv.efPercent, unit: "percent" },
];

/** The rows to print: the cardiac output only when there is one. */
export function visibleVolumeRows(measures: AiVolumetryMeasures): readonly VolumeRow[] {
  return volumeRows.filter((row) => !row.optional || row.of(measures) !== null);
}

/** ES above ED: the fraction is negative, the phases are to be checked first. */
export const ES_EXCEEDS_ED = "es_volume_exceeds_ed";

/** What to check before trusting the figures, as translation keys with their parameters. */
export function volumetryNotices(volumetry: AiVolumetry): { key: string; params: Record<string, number | string> }[] {
  const notices: { key: string; params: Record<string, number | string> }[] = [];
  if (volumetry.sliceOrderInferred) notices.push({ key: "sliceOrderInferred", params: {} });
  for (const warning of volumetry.warnings) notices.push(noticeOfWarning(warning));
  if (volumetry.effective.measures.warnings.includes(ES_EXCEEDS_ED)) notices.push({ key: ES_EXCEEDS_ED, params: {} });
  return notices;
}

const KNOWN_WARNINGS = new Set(["duplicate_images_ignored", "irregular_slice_spacing", "phase_timing_differs", "slice_order_uncertain"]);

function noticeOfWarning(warning: AiVolumetryWarning): { key: string; params: Record<string, number | string> } {
  if (!KNOWN_WARNINGS.has(warning.code)) return { key: "unknown", params: { code: warning.code } };
  const { code, ...details } = warning;
  return { key: code, params: details };
}

// -------------------------------------------------------- the correction form

export const HEIGHT_RANGE_CM = { max: 250, min: 30 } as const;
export const WEIGHT_RANGE_KG = { max: 400, min: 2 } as const;

/** What the form holds; the height and the weight stay text until they are sent. */
export type VolumetryDraft = {
  edPhase: number;
  esPhase: number;
  excludedSlices: number[];
  heightCm: string;
  weightKg: string;
};

/** The form as it opens: what is in force. */
export function draftFromVolumetry(volumetry: AiVolumetry): VolumetryDraft {
  const { effective } = volumetry;
  return {
    edPhase: effective.edPhase,
    esPhase: effective.esPhase,
    excludedSlices: [...effective.excludedSlices],
    heightCm: "",
    weightKg: "",
  };
}

/** A slice ticked in or out of the volumes; the list stays in slice order. */
export function toggleExcludedSlice(draft: VolumetryDraft, slice: number): VolumetryDraft {
  const excluded = draft.excludedSlices.includes(slice)
    ? draft.excludedSlices.filter((value) => value !== slice)
    : [...draft.excludedSlices, slice].sort((a, b) => a - b);
  return { ...draft, excludedSlices: excluded };
}

/** A typed number: a comma is a decimal point; null for nothing or for something that is not a number. */
export function parseTypedNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export type VolumetryDraftErrors = {
  /** Every slice left out. */
  slices?: "none";
  /** One of the two typed, or a value outside the range the backend takes. */
  body?: "both" | "invalidHeight" | "invalidWeight";
};

/** Same rules as the backend; an empty object means the form can be sent. */
export function validateVolumetryDraft(draft: VolumetryDraft, volumetry: AiVolumetry): VolumetryDraftErrors {
  const errors: VolumetryDraftErrors = {};
  if (draft.excludedSlices.length >= volumetry.slices.length) errors.slices = "none";

  const typedHeight = draft.heightCm.trim() !== "";
  const typedWeight = draft.weightKg.trim() !== "";
  if (typedHeight !== typedWeight) {
    errors.body = "both";
  } else if (typedHeight) {
    const height = parseTypedNumber(draft.heightCm);
    const weight = parseTypedNumber(draft.weightKg);
    if (height === null || height < HEIGHT_RANGE_CM.min || height > HEIGHT_RANGE_CM.max) errors.body = "invalidHeight";
    else if (weight === null || weight < WEIGHT_RANGE_KG.min || weight > WEIGHT_RANGE_KG.max) errors.body = "invalidWeight";
  }
  return errors;
}

/** The body of PATCH .../volumetry: only what differs from what is in force. */
export type CorrectVolumetryPayload = {
  edPhase?: number;
  esPhase?: number;
  excludedSlices?: number[];
  automatic?: boolean;
  heightCm?: number;
  weightKg?: number;
};

const sameSlices = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((slice, index) => slice === b[index]);

/** What the form changes, to light the save button and to say what will be recalculated. */
export function draftChanges(draft: VolumetryDraft, volumetry: AiVolumetry): { phases: boolean; slices: boolean; body: boolean } {
  const { effective } = volumetry;
  return {
    body: draft.heightCm.trim() !== "" || draft.weightKg.trim() !== "",
    phases: draft.edPhase !== effective.edPhase || draft.esPhase !== effective.esPhase,
    slices: !sameSlices([...draft.excludedSlices].sort((a, b) => a - b), effective.excludedSlices),
  };
}

/** null when the form changes nothing or cannot be sent. */
export function toCorrectionPayload(draft: VolumetryDraft, volumetry: AiVolumetry): CorrectVolumetryPayload | null {
  if (Object.keys(validateVolumetryDraft(draft, volumetry)).length > 0) return null;
  const changes = draftChanges(draft, volumetry);
  if (!changes.phases && !changes.slices && !changes.body) return null;

  const payload: CorrectVolumetryPayload = {};
  if (draft.edPhase !== volumetry.effective.edPhase) payload.edPhase = draft.edPhase;
  if (draft.esPhase !== volumetry.effective.esPhase) payload.esPhase = draft.esPhase;
  if (changes.slices) payload.excludedSlices = [...draft.excludedSlices].sort((a, b) => a - b);
  if (changes.body) {
    payload.heightCm = parseTypedNumber(draft.heightCm) as number;
    payload.weightKg = parseTypedNumber(draft.weightKg) as number;
  }
  return payload;
}

/** "Choose ED and ES again" from the curve of the slices kept in the form. */
export function toAutomaticPayload(draft: VolumetryDraft): CorrectVolumetryPayload {
  return { automatic: true, excludedSlices: [...draft.excludedSlices].sort((a, b) => a - b) };
}

/** Error codes of PATCH .../volumetry the form explains (aiAnalyses.run.volumetry.errors.<code>). */
export const knownCorrectionErrorCodes = [
  "AI_RUN_ALREADY_DECIDED",
  "AI_RUN_NOT_DECIDABLE",
  "AI_VOLUMETRY_CONFLICT",
  "AI_VOLUMETRY_INVALID",
  "AI_VOLUMETRY_NOT_APPLICABLE",
] as const;

const KNOWN_CORRECTION_ERRORS = new Set<string>(knownCorrectionErrorCodes);

/** Key under aiAnalyses.run.volumetry.errors for a failed correction. */
export function getCorrectionErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "unknown";
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && KNOWN_CORRECTION_ERRORS.has(code) ? code : "unknown";
}

// ------------------------------------------------------------ the curve

export type CurveSize = { height: number; width: number };
export type CurveGeometry = {
  size: CurveSize;
  plot: { bottom: number; left: number; right: number; top: number };
  /** One per phase. */
  points: { phase: number; volume: number; x: number; y: number }[];
  xTicks: { phase: number; x: number }[];
  yTicks: { value: number; y: number }[];
  /** The upper bound of the vertical axis, ml. */
  maximum: number;
};

/** A round upper bound at least as large as the highest volume, so that the ticks fall on round numbers. */
export function niceMaximum(highest: number): number {
  const top = Math.max(highest, 1);
  const step = 10 ** Math.floor(Math.log10(top));
  return Math.ceil(top / (step / 2)) * (step / 2);
}

/** Where the volumes fall on a chart of the given size; phases left to right, volumes from the bottom. */
export function curveGeometry(
  curve: readonly number[],
  size: CurveSize = { height: 190, width: 420 },
  margin: { bottom: number; left: number; right: number; top: number } = { bottom: 30, left: 44, right: 12, top: 14 },
): CurveGeometry {
  const plot = {
    bottom: size.height - margin.bottom,
    left: margin.left,
    right: size.width - margin.right,
    top: margin.top,
  };
  const maximum = niceMaximum(Math.max(0, ...curve));
  const x = (phase: number) => (curve.length > 1 ? plot.left + (phase / (curve.length - 1)) * (plot.right - plot.left) : plot.left);
  const y = (volume: number) => plot.bottom - (volume / maximum) * (plot.bottom - plot.top);

  const every = Math.max(1, Math.ceil(curve.length / 10));
  return {
    maximum,
    plot,
    points: curve.map((volume, phase) => ({ phase, volume, x: x(phase), y: y(volume) })),
    size,
    xTicks: curve.flatMap((_, phase) => (phase % every === 0 || phase === curve.length - 1 ? [{ phase, x: x(phase) }] : [])),
    yTicks: [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({ value: maximum * fraction, y: y(maximum * fraction) })),
  };
}

// ------------------------------------------------------ the slices shown

/** Which of the stored images a slice number reaches: the model's ED and ES only. */
export type VolumetryImagePhase = "ed" | "es";

/** The phase of the model that an image phase stands for (shown "phase 4"). */
export function imagePhaseNumber(volumetry: AiVolumetry, phase: VolumetryImagePhase): number {
  return phaseNumber(phase === "ed" ? volumetry.images.edPhase : volumetry.images.esPhase);
}

/** The middle of the slices kept: the most informative one to open on. */
export function middleSlice(volumetry: AiVolumetry): number {
  const kept = volumetry.slices.map((_, index) => index).filter((index) => !volumetry.effective.excludedSlices.includes(index));
  return kept.length > 0 ? kept[Math.floor((kept.length - 1) / 2)] : Math.floor((volumetry.slices.length - 1) / 2);
}

/**
 * Whether the images show other phases than the ones in force: after the physician moved
 * ED or ES, the stored images stay the model's.
 */
export function imagesDifferFromPhases(volumetry: AiVolumetry): boolean {
  return volumetry.effective.edPhase !== volumetry.images.edPhase || volumetry.effective.esPhase !== volumetry.images.esPhase;
}

/** The time of a phase in the cycle, ms, when the stack gave one. */
export function phaseTimeMs(volumetry: AiVolumetry, phase: number): number | null {
  return volumetry.phaseTimesMs?.[phase] ?? null;
}

/** The longest an analysis of a cine may take, for the request that waits for it (the backend gives the service 180 s). */
export const CINE_REQUEST_TIMEOUT_MS = 200_000;
