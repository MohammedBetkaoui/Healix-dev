// The measured performance of the cardiology ECG model, for the weights of an
// analysis only. First the service's own evaluation
// (ai-service/scripts/evaluate_cardio.py, evaluation/cardio-latest.json):
// the service's preprocessing and inference replayed on PTB-XL fold 10. Else
// the training notebook's test figures, from the model card next to the
// weights, marked as such. Neither describes other weights: then no figure.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CARDIO_ECG_MODEL_ID,
  ECG_CLASSES,
  type EcgClass,
} from '../ai-service.client';
import {
  type EvaluationIdentity,
  type EvaluationPaths,
  evaluationPaths,
  findEvaluation,
  isNumber,
  isRecord,
  isSha256,
  ModelEvaluationFinder,
  numberOrNull,
} from './model-evaluation';

export type CardioClassMetrics = {
  auc: number;
  threshold: number;
  sensitivity: number | null;
  specificity: number | null;
  ppv: number | null;
  f1: number | null;
};

export type CardioEvaluation = EvaluationIdentity & {
  /** PTB-XL fold 10: ECG of the test set. */
  nEcg: number;
  aucMacro: number;
  perClass: Record<EcgClass, CardioClassMetrics>;
};

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

/**
 * The service's evaluation of these weights, else the notebook's; null when
 * neither describes them.
 */
export function findCardioEvaluation(
  paths: EvaluationPaths,
  weightsSha256: string | null,
): Promise<CardioEvaluation | null> {
  return findEvaluation(
    paths,
    weightsSha256,
    parseServiceEvaluation,
    parseModelCardEvaluation,
  );
}

@Injectable()
export class CardioEvaluationService extends ModelEvaluationFinder<CardioEvaluation> {
  constructor(configService: ConfigService) {
    super(
      CardioEvaluationService.name,
      evaluationPaths(
        configService,
        [
          'AI_CARDIO_EVALUATION_PATH',
          '../ai-service/evaluation/cardio-latest.json',
        ],
        [
          'AI_CARDIO_MODEL_CARD_PATH',
          '../models/cardio-ecg-resnet1d-ptbxl.json',
        ],
      ),
      parseServiceEvaluation,
      parseModelCardEvaluation,
    );
  }
}
