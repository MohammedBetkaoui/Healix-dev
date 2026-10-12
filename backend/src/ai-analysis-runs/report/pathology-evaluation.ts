// The measured performance of the pathology models, read from the reports of
// ai-service/scripts/evaluate_pathology.py (evaluation/pathology-*.json). A
// report is used only when its part was evaluated (status "ok") on the very
// weights of the analysis (same SHA-256): otherwise the PDF prints no figure.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type PathologyEvaluationPart = 'breakhis' | 'pannuke';

// The model each part measures (ai-service/app/pathology_models.py).
export const PATHOLOGY_EVALUATION_MODELS: Readonly<
  Record<PathologyEvaluationPart, string>
> = {
  breakhis: 'pathology-breakhis-classification',
  pannuke: 'pathology-unet-pannuke-segmentation',
};

export const NUCLEI_CLASS_NAMES = [
  'background',
  'neoplastic',
  'inflammatory',
  'connective',
  'dead',
  'epithelial',
] as const;
export type NucleiClassName = (typeof NUCLEI_CLASS_NAMES)[number];

/** A value and its 95 % interval (bootstrap over patients; null when undefined). */
export type MeasuredValue = {
  value: number;
  ci95: readonly [number, number] | null;
};

/** [[TN, FP], [FN, TP]]: rows the true class (benign, malignant), columns the result. */
export type BinaryConfusion = readonly [
  readonly [number, number],
  readonly [number, number],
];

export type MagnificationMetrics = {
  n: number;
  accuracy: number;
  sensitivity: number | null;
  specificity: number | null;
  confusionMatrix: BinaryConfusion;
};

type ReportIdentity = {
  /** Name of the source report (pathology-<date>-<HHMMSS>-<sha8>-<sha8>.json). */
  file: string;
  generatedAt: string;
  /** SHA-256 of the weights the figures describe. */
  weightsSha256: string;
};

export type BreakhisEvaluation = ReportIdentity & {
  n: number;
  threshold: number;
  accuracy: MeasuredValue;
  sensitivity: MeasuredValue;
  specificity: MeasuredValue;
  precision: MeasuredValue;
  aucRoc: MeasuredValue;
  confusionMatrix: BinaryConfusion;
  byMagnification: Readonly<Record<string, MagnificationMetrics>>;
  testPatients: number;
  /** Deduced from byPatient. */
  benignPatients: number;
};

export type PannukeEvaluation = ReportIdentity & {
  perClass: Readonly<
    Record<NucleiClassName, { dice: number | null; iou: number | null }>
  >;
  nucleiMeanDice: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const numberOrNull = (value: unknown): number | null =>
  isNumber(value) ? value : null;

function interval(value: unknown): readonly [number, number] | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every((bound) => isNumber(bound))
    ? [value[0], value[1]]
    : null;
}

function confusion(value: unknown): BinaryConfusion | null {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        row.every((cell) => Number.isInteger(cell)),
    )
  ) {
    return null;
  }
  const [[tn, fp], [fn, tp]] = value as number[][];
  return [
    [tn, fp],
    [fn, tp],
  ];
}

function identity(
  json: Record<string, unknown>,
  part: PathologyEvaluationPart,
): ReportIdentity | null {
  const weights = isRecord(json.weights)
    ? json.weights[PATHOLOGY_EVALUATION_MODELS[part]]
    : undefined;
  if (
    typeof json.file !== 'string' ||
    typeof json.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(json.generatedAt)) ||
    !isRecord(weights) ||
    typeof weights.sha256 !== 'string'
  ) {
    return null;
  }
  return {
    file: json.file,
    generatedAt: json.generatedAt,
    weightsSha256: weights.sha256,
  };
}

/** The BreakHis part of a report; null unless evaluated and complete. */
export function parseBreakhisEvaluation(
  json: unknown,
): BreakhisEvaluation | null {
  if (!isRecord(json) || !isRecord(json.breakhis)) return null;
  const part = json.breakhis;
  const id = identity(json, 'breakhis');
  if (!id || part.status !== 'ok') return null;

  const bootstrap = isRecord(part.bootstrap) ? part.bootstrap : {};
  const measured = (key: string): MeasuredValue | null => {
    const value = part[key];
    const draws = bootstrap[key];
    return isNumber(value)
      ? {
          ci95: isRecord(draws) ? interval(draws.ci95) : null,
          value,
        }
      : null;
  };
  const accuracy = measured('accuracy');
  const sensitivity = measured('sensitivity');
  const specificity = measured('specificity');
  const precision = measured('precision');
  const aucRoc = measured('aucRoc');
  const matrix = confusion(part.confusionMatrix);
  const patients = Array.isArray(part.byPatient)
    ? part.byPatient.filter(isRecord)
    : [];

  if (
    !accuracy ||
    !sensitivity ||
    !specificity ||
    !precision ||
    !aucRoc ||
    !matrix ||
    !isNumber(part.n) ||
    !isNumber(part.threshold) ||
    !isRecord(part.byMagnification) ||
    patients.length === 0
  ) {
    return null;
  }

  const byMagnification: Record<string, MagnificationMetrics> = {};
  for (const [magnification, raw] of Object.entries(part.byMagnification)) {
    const rows = isRecord(raw) ? confusion(raw.confusionMatrix) : null;
    if (!isRecord(raw) || !rows || !isNumber(raw.n) || !isNumber(raw.accuracy))
      return null;
    byMagnification[magnification] = {
      accuracy: raw.accuracy,
      confusionMatrix: rows,
      n: raw.n,
      sensitivity: numberOrNull(raw.sensitivity),
      specificity: numberOrNull(raw.specificity),
    };
  }

  return {
    ...id,
    accuracy,
    aucRoc,
    benignPatients: patients.filter((patient) => patient.label === 'benign')
      .length,
    byMagnification,
    confusionMatrix: matrix,
    n: part.n,
    precision,
    sensitivity,
    specificity,
    testPatients: patients.length,
    threshold: part.threshold,
  };
}

/** The PanNuke part of a report; null unless evaluated and complete. */
export function parsePannukeEvaluation(
  json: unknown,
): PannukeEvaluation | null {
  if (!isRecord(json) || !isRecord(json.pannuke)) return null;
  const part = json.pannuke;
  const id = identity(json, 'pannuke');
  if (!id || part.status !== 'ok' || !isRecord(part.perClass)) return null;

  const perClass = {} as Record<
    NucleiClassName,
    { dice: number | null; iou: number | null }
  >;
  for (const name of NUCLEI_CLASS_NAMES) {
    const entry = part.perClass[name];
    if (!isRecord(entry)) return null;
    perClass[name] = {
      dice: numberOrNull(entry.dice),
      iou: numberOrNull(entry.iou),
    };
  }
  return { ...id, nucleiMeanDice: numberOrNull(part.nucleiMeanDice), perClass };
}

/**
 * The most recent report (generatedAt) of `dir` whose `part` was evaluated
 * on these weights; null when there is none (then no figure is printed).
 * pathology-latest.json is a copy of one of them and is not read twice.
 */
export async function findPathologyEvaluation(
  dir: string,
  part: 'breakhis',
  weightsSha256: string | null,
): Promise<BreakhisEvaluation | null>;
export async function findPathologyEvaluation(
  dir: string,
  part: 'pannuke',
  weightsSha256: string | null,
): Promise<PannukeEvaluation | null>;
export async function findPathologyEvaluation(
  dir: string,
  part: PathologyEvaluationPart,
  weightsSha256: string | null,
): Promise<BreakhisEvaluation | PannukeEvaluation | null> {
  if (!weightsSha256) return null;

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }

  const parse =
    part === 'breakhis' ? parseBreakhisEvaluation : parsePannukeEvaluation;
  let best: BreakhisEvaluation | PannukeEvaluation | null = null;
  for (const name of names.sort()) {
    if (!/^pathology-.+\.json$/.test(name) || name === 'pathology-latest.json')
      continue;
    let json: unknown;
    try {
      json = JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch {
      continue; // An unreadable report describes nothing.
    }
    const evaluation = parse(json);
    if (
      evaluation &&
      evaluation.weightsSha256 === weightsSha256 &&
      (!best ||
        Date.parse(evaluation.generatedAt) > Date.parse(best.generatedAt))
    ) {
      best = evaluation;
    }
  }
  return best;
}
