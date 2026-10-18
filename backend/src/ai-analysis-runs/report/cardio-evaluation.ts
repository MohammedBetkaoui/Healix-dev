// The measured performance of the cardiology ECG model, for the weights of an
// analysis only. First the service's own evaluation
// (ai-service/scripts/evaluate_cardio.py, evaluation/cardio-latest.json):
// the service's preprocessing and inference replayed on PTB-XL fold 10. Else
// the training notebook's test figures, from the model card next to the
// weights, marked as such. Neither describes other weights: then no figure.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  CARDIO_ECG_MODEL_ID,
  ECG_CLASSES,
  type EcgClass,
} from '../ai-service.client';

export type CardioClassMetrics = {
  auc: number;
  threshold: number;
  sensitivity: number | null;
  specificity: number | null;
  ppv: number | null;
  f1: number | null;
};

export type CardioEvaluation = {
  /** service: measured on the service itself; notebook: the training notebook's test, from the model card. */
  source: 'service' | 'notebook';
  /** The report file (service), or the model card's file. */
  file: string;
  /** When the service's evaluation ran; null for the notebook's figures. */
  generatedAt: string | null;
  weightsSha256: string;
  /** PTB-XL fold 10: ECG of the test set. */
  nEcg: number;
  aucMacro: number;
  perClass: Record<EcgClass, CardioClassMetrics>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const numberOrNull = (value: unknown): number | null =>
  isNumber(value) ? value : null;
const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function perClassOf(
  value: unknown,
): Record<EcgClass, CardioClassMetrics> | null {
  if (!isRecord(value)) return null;
  const perClass = {} as Record<EcgClass, CardioClassMetrics>;
  for (const label of ECG_CLASSES) {
    const entry = value[label];
    if (!isRecord(entry) || !isNumber(entry.auc) || !isNumber(entry.threshold))
      return null;
    perClass[label] = {
      auc: entry.auc,
      f1: numberOrNull(entry.f1),
      ppv: numberOrNull(entry.ppv),
      sensitivity: numberOrNull(entry.sensitivity),
      specificity: numberOrNull(entry.specificity),
      threshold: entry.threshold,
    };
  }
  return perClass;
}

/** cardio-*.json of evaluate_cardio.py; null unless complete. */
export function parseServiceEvaluation(json: unknown): CardioEvaluation | null {
  if (!isRecord(json) || !isRecord(json.metrics) || !isRecord(json.dataset))
    return null;
  const weights = isRecord(json.weights)
    ? json.weights[CARDIO_ECG_MODEL_ID]
    : undefined;
  const perClass = perClassOf(json.metrics.per_class);
  if (
    json.pipeline !== 'cardio-ecg' ||
    typeof json.file !== 'string' ||
    typeof json.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(json.generatedAt)) ||
    !isRecord(weights) ||
    !isSha256(weights.sha256) ||
    !isNumber(json.metrics.auc_macro) ||
    !Number.isInteger(json.dataset.nEcg) ||
    !perClass
  ) {
    return null;
  }
  return {
    aucMacro: json.metrics.auc_macro,
    file: json.file,
    generatedAt: json.generatedAt,
    nEcg: json.dataset.nEcg as number,
    perClass,
    source: 'service',
    weightsSha256: weights.sha256,
  };
}

/** The `test` part of the model card; null unless complete. */
export function parseModelCardEvaluation(
  json: unknown,
  file: string,
): CardioEvaluation | null {
  if (
    !isRecord(json) ||
    json.id !== CARDIO_ECG_MODEL_ID ||
    !isSha256(json.sha256) ||
    !isRecord(json.test)
  ) {
    return null;
  }
  const perClass = perClassOf(json.test.per_class);
  if (
    !isNumber(json.test.auc_macro) ||
    !Number.isInteger(json.test.n_ecg) ||
    !perClass
  ) {
    return null;
  }
  return {
    aucMacro: json.test.auc_macro,
    file,
    generatedAt: null,
    nEcg: json.test.n_ecg as number,
    perClass,
    source: 'notebook',
    weightsSha256: json.sha256,
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null; // Missing or unreadable: describes nothing.
  }
}

/**
 * The service's evaluation of these weights, else the notebook's; null when
 * neither describes them.
 */
export async function findCardioEvaluation(
  paths: { evaluation: string; modelCard: string },
  weightsSha256: string | null,
): Promise<CardioEvaluation | null> {
  if (!weightsSha256) return null;
  const service = parseServiceEvaluation(await readJson(paths.evaluation));
  if (service?.weightsSha256 === weightsSha256) return service;
  const card = parseModelCardEvaluation(
    await readJson(paths.modelCard),
    paths.modelCard.split(/[\\/]/).pop() ?? paths.modelCard,
  );
  return card?.weightsSha256 === weightsSha256 ? card : null;
}

@Injectable()
export class CardioEvaluationService {
  private readonly logger = new Logger(CardioEvaluationService.name);
  private readonly paths: { evaluation: string; modelCard: string };

  constructor(configService: ConfigService) {
    this.paths = {
      evaluation: resolve(
        process.cwd(),
        configService.get<string>('AI_CARDIO_EVALUATION_PATH') ??
          '../ai-service/evaluation/cardio-latest.json',
      ),
      modelCard: resolve(
        process.cwd(),
        configService.get<string>('AI_CARDIO_MODEL_CARD_PATH') ??
          '../models/cardio-ecg-resnet1d-ptbxl.json',
      ),
    };
  }

  async find(weightsSha256: string | null): Promise<CardioEvaluation | null> {
    const evaluation = await findCardioEvaluation(this.paths, weightsSha256);
    if (!evaluation) {
      this.logger.warn(
        `No cardio evaluation of weights ${weightsSha256 ?? '(none)'} (${this.paths.evaluation}, ${this.paths.modelCard}).`,
      );
    }
    return evaluation;
  }
}
