// Pure rules of the ECG result page: the standard paper (mm per second and
// per mV), the 3 x 4 layout with its lead II rhythm strip, and the classes of
// the model against their own thresholds. Decision support only: no class is
// ranked by urgency, none has a colour of its own.

import { ecgClasses, type AiEcgPredictions, type EcgClass, type EcgLead } from "./ai-analyses.types";

/** Paper speeds offered: 25 mm/s (standard) and 50 mm/s (horizontal zoom). */
export const ecgPaperSpeeds = [25, 50] as const;
export type EcgPaperSpeed = (typeof ecgPaperSpeeds)[number];

/** Standard gain: 10 mm for 1 mV. */
export const ECG_GAIN_MM_PER_MV = 10;
/** Each of the 3 x 4 cells shows 2.5 s of its lead. */
export const ECG_CELL_SECONDS = 2.5;
/** The trace drawn: the first 10 s. */
export const ECG_TRACE_SECONDS = 10;
/** Height of a row: 3 mV of paper. */
export const ECG_ROW_MM = 30;

/** Rows of the standard layout, then the lead II rhythm strip. */
export const ecgLayout: readonly (readonly EcgLead[])[] = [
  ["I", "aVR", "V1", "V4"],
  ["II", "aVL", "V2", "V5"],
  ["III", "aVF", "V3", "V6"],
];
export const ECG_RHYTHM_LEAD: EcgLead = "II";

export type EcgGeometry = {
  speed: EcgPaperSpeed;
  /** Room for the 1 mV pulse, left of each row (0.4 s of paper). */
  calibration: number;
  width: number;
  height: number;
  rowHeight: number;
  rows: number;
};

export function ecgGeometry(speed: EcgPaperSpeed): EcgGeometry {
  const calibration = 0.4 * speed;
  const rows = ecgLayout.length + 1;
  return {
    calibration,
    height: rows * ECG_ROW_MM,
    rowHeight: ECG_ROW_MM,
    rows,
    speed,
    width: calibration + ECG_TRACE_SECONDS * speed,
  };
}

const mm = (value: number) => Number(value.toFixed(2));

/**
 * The samples of [start, end) seconds as SVG points, in mm: time from `x0`
 * at the paper speed, millivolts up from `baseline`.
 */
export function tracePoints(
  samples: readonly number[],
  samplingRate: number,
  start: number,
  end: number,
  x0: number,
  baseline: number,
  speed: number,
): string {
  const first = Math.max(0, Math.round(start * samplingRate));
  const last = Math.min(samples.length, Math.round(end * samplingRate));
  const points: string[] = [];
  for (let index = first; index < last; index += 1) {
    const x = x0 + ((index - first) / samplingRate) * speed;
    points.push(`${mm(x)},${mm(baseline - samples[index] * ECG_GAIN_MM_PER_MV)}`);
  }
  return points.join(" ");
}

/** The 1 mV calibration pulse (0.2 s wide), drawn from the baseline. */
export function calibrationPath(baseline: number, speed: number): string {
  const top = baseline - ECG_GAIN_MM_PER_MV;
  const left = 0.05 * speed;
  const right = left + 0.2 * speed;
  return `M0,${mm(baseline)} H${mm(left)} V${mm(top)} H${mm(right)} V${mm(baseline)} H${mm(0.4 * speed)}`;
}

/** Grid lines every mm, a major one every 5 mm. */
export function gridLines(length: number): { at: number; major: boolean }[] {
  const lines: { at: number; major: boolean }[] = [];
  for (let at = 0; at <= length; at += 1) lines.push({ at, major: at % 5 === 0 });
  return lines;
}

export type EcgClassResult = {
  label: EcgClass;
  probability: number;
  threshold: number;
  /** At or above its own threshold. */
  positive: boolean;
};

/** The 5 classes in the model's order, each against its own threshold. */
export function getEcgClassResults(predictions: AiEcgPredictions): EcgClassResult[] {
  return ecgClasses.map((label) => ({
    label,
    positive: predictions.probabilities[label] >= predictions.thresholds[label],
    probability: predictions.probabilities[label],
    threshold: predictions.thresholds[label],
  }));
}

/** A position on a 0-100 % bar, clamped. */
export function barPosition(value: number): number {
  return Math.min(100, Math.max(0, value * 100));
}
