// The measured performance of the cardiac MRI segmentation model, for the
// weights of an analysis only: the service's own evaluation
// (ai-service/scripts/evaluate_cardio_seg.py, evaluation/cardio-seg-latest.json,
// the service's pipeline replayed on the ACDC test volumes), else the training
// notebook's test figures from the model card, marked as such.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CARDIO_SEG_MODEL_ID,
  CARDIO_SEG_STRUCTURES,
  type CardioSegStructure,
} from '../ai-service.client';
import {
  type EvaluationIdentity,
  evaluationPaths,
  isNumber,
  isRecord,
  isSha256,
  ModelEvaluationFinder,
  numberOrNull,
} from './model-evaluation';

/** 3D Dice per volume (patient x phase): mean and standard deviation. */
export type DiceFigures = { mean: number; std: number | null };

export type CardioSegEvaluation = EvaluationIdentity & {
  /** ACDC test volumes (patient x phase). */
  nVolumes: number;
  /** ACDC test patients, never seen in training. */
  testPatients: number;
  meanDice: number;
  perClass: Record<CardioSegStructure, DiceFigures>;
};

/** cardio-seg-*.json of evaluate_cardio_seg.py; null unless complete. */
export function parseServiceEvaluation(
  json: unknown,
): CardioSegEvaluation | null {
  if (!isRecord(json) || !isRecord(json.metrics) || !isRecord(json.dataset))
    return null;
  const weights = isRecord(json.weights)
    ? json.weights[CARDIO_SEG_MODEL_ID]
    : undefined;
  const perClassJson = json.metrics.perClass;
  if (
    json.pipeline !== 'cardio-seg-mri' ||
    typeof json.file !== 'string' ||
    typeof json.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(json.generatedAt)) ||
    !isRecord(weights) ||
    !isSha256(weights.sha256) ||
    !isNumber(json.metrics.mean) ||
    !Number.isInteger(json.dataset.nVolumes) ||
    !Array.isArray(json.dataset.testPatients) ||
    !isRecord(perClassJson)
  ) {
    return null;
  }
  const perClass = {} as Record<CardioSegStructure, DiceFigures>;
  for (const name of CARDIO_SEG_STRUCTURES) {
    const entry = perClassJson[name];
    if (!isRecord(entry) || !isNumber(entry.mean)) return null;
    perClass[name] = { mean: entry.mean, std: numberOrNull(entry.std) };
  }
  return {
    file: json.file,
    generatedAt: json.generatedAt,
    meanDice: json.metrics.mean,
    nVolumes: json.dataset.nVolumes as number,
    perClass,
    source: 'service',
    testPatients: json.dataset.testPatients.length,
    weightsSha256: weights.sha256,
  };
}

/** The `test` part of the model card; null unless complete. */
export function parseModelCardEvaluation(
  json: unknown,
  file: string,
): CardioSegEvaluation | null {
  if (
    !isRecord(json) ||
    json.id !== CARDIO_SEG_MODEL_ID ||
    !isSha256(json.sha256) ||
    !isRecord(json.test) ||
    !isRecord(json.training)
  ) {
    return null;
  }
  const { test, training } = json;
  const perClass = {} as Record<CardioSegStructure, DiceFigures>;
  for (const name of CARDIO_SEG_STRUCTURES) {
    if (!isNumber(test[name])) return null;
    perClass[name] = {
      mean: test[name],
      std: numberOrNull(test[`${name}_std`]),
    };
  }
  if (
    !isNumber(test.mean) ||
    !isNumber(test.n_volumes) ||
    !Array.isArray(training.test_patients)
  ) {
    return null;
  }
  return {
    file,
    generatedAt: null,
    meanDice: test.mean,
    nVolumes: test.n_volumes,
    perClass,
    source: 'notebook',
    testPatients: training.test_patients.length,
    weightsSha256: json.sha256,
  };
}

@Injectable()
export class CardioSegEvaluationService extends ModelEvaluationFinder<CardioSegEvaluation> {
  constructor(configService: ConfigService) {
    super(
      CardioSegEvaluationService.name,
      evaluationPaths(
        configService,
        [
          'AI_CARDIO_SEG_EVALUATION_PATH',
          '../ai-service/evaluation/cardio-seg-latest.json',
        ],
        [
          'AI_CARDIO_SEG_MODEL_CARD_PATH',
          '../models/cardio-seg-acdc-unet-effb4.json',
        ],
      ),
      parseServiceEvaluation,
      parseModelCardEvaluation,
    );
  }
}
