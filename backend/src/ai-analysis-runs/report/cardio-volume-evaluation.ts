// The measured performance of the cardiac cine volumetry, for the weights of an
// analysis only: the service's own evaluation (ai-service/scripts/
// evaluate_cardio_volume.py, evaluation/cardio-volume-latest.json, the ACDC test
// patients through the service's pipeline). Unlike the segmentation, the model card
// holds no figure for it: with no evaluation file of these weights, no figure is
// printed.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CARDIO_SEG_MODEL_ID } from '../ai-service.client';
import {
  type EvaluationIdentity,
  evaluationPaths,
  isNumber,
  isRecord,
  isSha256,
  ModelEvaluationFinder,
  numberOrNull,
} from './model-evaluation';

/** Predicted against the truth over the test patients (Bland-Altman and correlation). */
export type AgreementFigures = {
  /** Patients for whom both values exist. */
  n: number;
  /** Mean absolute error, in points of ejection fraction. */
  mae: number;
  /** Mean of (predicted - truth). */
  bias: number;
  /** Bias +/- 1.96 SD of the differences; null with a single patient. */
  limitsOfAgreement: [number, number] | null;
  pearsonR: number | null;
};

export type CardioVolumeEvaluation = EvaluationIdentity & {
  /** ACDC test patients evaluated, never seen in training. */
  nPatients: number;
  lvef: AgreementFigures;
  rvef: AgreementFigures;
};

function parseAgreement(value: unknown): AgreementFigures | null {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.n) ||
    (value.n as number) < 1 ||
    !isNumber(value.mae) ||
    !isNumber(value.bias)
  ) {
    return null;
  }
  const limits = value.limitsOfAgreement;
  return {
    bias: value.bias,
    limitsOfAgreement:
      Array.isArray(limits) &&
      limits.length === 2 &&
      isNumber(limits[0]) &&
      isNumber(limits[1])
        ? [limits[0], limits[1]]
        : null,
    mae: value.mae,
    n: value.n as number,
    pearsonR: numberOrNull(value.pearsonR),
  };
}

/** cardio-volume-*.json of evaluate_cardio_volume.py; null unless complete. */
export function parseServiceEvaluation(
  json: unknown,
): CardioVolumeEvaluation | null {
  if (!isRecord(json) || !isRecord(json.metrics) || !isRecord(json.dataset)) {
    return null;
  }
  const weights = isRecord(json.weights)
    ? json.weights[CARDIO_SEG_MODEL_ID]
    : undefined;
  const lvef = parseAgreement(json.metrics.lvef);
  const rvef = parseAgreement(json.metrics.rvef);
  if (
    json.pipeline !== 'cardio-volume-mri' ||
    typeof json.file !== 'string' ||
    typeof json.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(json.generatedAt)) ||
    !isRecord(weights) ||
    !isSha256(weights.sha256) ||
    !Number.isInteger(json.dataset.nPatients) ||
    !lvef ||
    !rvef
  ) {
    return null;
  }
  return {
    file: json.file,
    generatedAt: json.generatedAt,
    lvef,
    nPatients: json.dataset.nPatients as number,
    rvef,
    source: 'service',
    weightsSha256: weights.sha256,
  };
}

@Injectable()
export class CardioVolumeEvaluationService extends ModelEvaluationFinder<CardioVolumeEvaluation> {
  constructor(configService: ConfigService) {
    super(
      CardioVolumeEvaluationService.name,
      evaluationPaths(
        configService,
        [
          'AI_CARDIO_VOLUME_EVALUATION_PATH',
          '../ai-service/evaluation/cardio-volume-latest.json',
        ],
        [
          'AI_CARDIO_SEG_MODEL_CARD_PATH',
          '../models/cardio-seg-acdc-unet-effb4.json',
        ],
      ),
      parseServiceEvaluation,
      // The model card has no figure for the volumes.
      () => null,
    );
  }
}
