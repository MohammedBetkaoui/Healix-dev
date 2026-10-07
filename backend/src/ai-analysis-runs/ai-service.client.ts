import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Client of the Python inference service (ai-service/). It only ever sends
// the bytes of an image: no patient identity leaves the backend.

export const BRAIN_CLASSIFIER_ID = 'brain-efficientnetb4-tumor-classification';
export const BRAIN_LABELS = [
  'glioma',
  'meningioma',
  'notumor',
  'pituitary',
] as const;
export type BrainLabel = (typeof BRAIN_LABELS)[number];

// Imposed routing, re-checked on every response: only these two classes get
// a segmentation, each by its own model.
export const BRAIN_SEGMENTER_BY_CLASS: Partial<Record<BrainLabel, string>> = {
  meningioma: 'brain-unet-meningioma-segmentation',
  pituitary: 'brain-unet-pituitary-segmentation',
};

export const AI_SERVICE_TIMEOUT_MS = 60_000;
const STATUS_TIMEOUT_MS = 5_000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export type BrainPrediction = { label: BrainLabel; probability: number };

export type BrainAnalysisResult = {
  classification: {
    modelId: string;
    weightsSha256: string;
    predictions: BrainPrediction[];
  };
  segmentation: {
    modelId: string;
    weightsSha256: string;
    maskPng: Buffer;
    areaPx: number;
    areaRatio: number;
  } | null;
  segmentationSkippedReason:
    | null
    | 'not_applicable_for_class'
    | 'model_not_loaded';
  imageWidth: number;
  imageHeight: number;
  durationMs: number;
};

export type AiServiceFailure =
  | 'SERVICE_NOT_CONFIGURED'
  | 'SERVICE_UNAVAILABLE'
  | 'SERVICE_TIMEOUT'
  | 'MODEL_NOT_LOADED'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'SERVICE_ERROR';

export class AiServiceError extends Error {
  constructor(
    readonly code: AiServiceFailure,
    message: string = code,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export type AiModelStatus = {
  modelId: string;
  loaded: boolean;
  weightsSha256: string | null;
  error: string | null;
};

export type AiServiceStatus = {
  service:
    | 'available'
    | 'unavailable'
    | 'not_configured'
    | 'unauthorized'
    | 'error';
  models: AiModelStatus[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isFiniteBetween = (value: unknown, min: number, max: number) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const invalid = (detail: string) =>
  new AiServiceError(
    'SERVICE_ERROR',
    `Réponse du service IA invalide : ${detail}.`,
  );

/**
 * Validates POST /analyze/brain. Anything unexpected (labels, ordering,
 * routing, mask) is a service error, never stored as a result.
 */
export function parseBrainAnalysis(body: unknown): BrainAnalysisResult {
  if (!isRecord(body) || !isRecord(body.classification)) throw invalid('forme');

  const { classification } = body;
  if (classification.modelId !== BRAIN_CLASSIFIER_ID)
    throw invalid('modèle de classification');
  if (!isSha256(classification.weightsSha256))
    throw invalid('empreinte de classification');
  if (
    !Array.isArray(classification.predictions) ||
    classification.predictions.length !== BRAIN_LABELS.length
  ) {
    throw invalid('prédictions');
  }

  const predictions: BrainPrediction[] = classification.predictions.map(
    (prediction: unknown) => {
      if (
        !isRecord(prediction) ||
        !BRAIN_LABELS.includes(prediction.label as BrainLabel) ||
        !isFiniteBetween(prediction.probability, 0, 1)
      ) {
        throw invalid('prédiction');
      }
      return {
        label: prediction.label as BrainLabel,
        probability: prediction.probability as number,
      };
    },
  );
  if (
    new Set(predictions.map((prediction) => prediction.label)).size !==
    BRAIN_LABELS.length
  )
    throw invalid('classes');
  if (
    predictions.some(
      (prediction, index) =>
        index > 0 &&
        prediction.probability > predictions[index - 1].probability,
    )
  ) {
    throw invalid('ordre des prédictions');
  }
  const total = predictions.reduce(
    (sum, prediction) => sum + prediction.probability,
    0,
  );
  if (Math.abs(total - 1) > 1e-3) throw invalid('somme des probabilités');

  if (
    !isFiniteBetween(body.imageWidth, 1, Number.MAX_SAFE_INTEGER) ||
    !isFiniteBetween(body.imageHeight, 1, Number.MAX_SAFE_INTEGER)
  ) {
    throw invalid('dimensions');
  }
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  const expectedSegmenter = BRAIN_SEGMENTER_BY_CLASS[predictions[0].label];
  const skipped = body.segmentationSkippedReason;
  let segmentation: BrainAnalysisResult['segmentation'] = null;

  if (body.segmentation === null) {
    const expectedReason = expectedSegmenter
      ? 'model_not_loaded'
      : 'not_applicable_for_class';
    if (skipped !== expectedReason)
      throw invalid('raison d’absence de segmentation');
  } else {
    const raw = body.segmentation;
    if (!isRecord(raw) || skipped !== null || !expectedSegmenter)
      throw invalid('segmentation hors routage');
    if (raw.modelId !== expectedSegmenter)
      throw invalid('modèle de segmentation');
    if (!isSha256(raw.weightsSha256))
      throw invalid('empreinte de segmentation');
    if (typeof raw.maskPng !== 'string') throw invalid('masque');
    const maskPng = Buffer.from(raw.maskPng, 'base64');
    if (!maskPng.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
      throw invalid('masque non PNG');
    const pixels = (body.imageWidth as number) * (body.imageHeight as number);
    if (
      !Number.isInteger(raw.areaPx) ||
      !isFiniteBetween(raw.areaPx, 0, pixels)
    )
      throw invalid('surface');
    if (!isFiniteBetween(raw.areaRatio, 0, 1))
      throw invalid('ratio de surface');
    segmentation = {
      modelId: raw.modelId,
      weightsSha256: raw.weightsSha256,
      maskPng,
      areaPx: raw.areaPx as number,
      areaRatio: raw.areaRatio as number,
    };
  }

  return {
    classification: {
      modelId: classification.modelId,
      weightsSha256: classification.weightsSha256,
      predictions,
    },
    segmentation,
    segmentationSkippedReason:
      skipped as BrainAnalysisResult['segmentationSkippedReason'],
    imageWidth: body.imageWidth as number,
    imageHeight: body.imageHeight as number,
    durationMs: Math.round(body.durationMs as number),
  };
}

@Injectable()
export class AiServiceClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(configService: ConfigService) {
    this.baseUrl = (
      configService.get<string>('AI_SERVICE_URL') ?? 'http://127.0.0.1:8001'
    ).replace(/\/+$/, '');
    this.token = configService.get<string>('AI_SERVICE_TOKEN') ?? '';
  }

  async analyzeBrain(
    image: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<BrainAnalysisResult> {
    if (!this.token) {
      throw new AiServiceError('SERVICE_NOT_CONFIGURED');
    }

    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(image)], { type: mimeType }),
      fileName,
    );

    let response: Response;
    let body: unknown;
    try {
      // The timeout covers the whole exchange, body included.
      const signal = AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS);
      response = await this.fetch('/analyze/brain', {
        body: form,
        method: 'POST',
        signal,
      });
      body = await response.json().catch((error: unknown) => {
        if (isTimeout(error)) throw error;
        return undefined;
      });
    } catch (error) {
      throw toTransportError(error);
    }

    if (response.status === 422) throw new AiServiceError('INVALID_IMAGE');
    if (response.status === 413) throw new AiServiceError('IMAGE_TOO_LARGE');
    if (response.status === 503) {
      const code =
        isRecord(body) && isRecord(body.detail) ? body.detail.code : undefined;
      throw new AiServiceError(
        code === 'model_not_loaded'
          ? 'MODEL_NOT_LOADED'
          : 'SERVICE_UNAVAILABLE',
      );
    }
    if (!response.ok) {
      throw new AiServiceError(
        'SERVICE_ERROR',
        `Service IA : HTTP ${response.status}.`,
      );
    }

    return parseBrainAnalysis(body);
  }

  /** GET /models, relayed without ever exposing the token. */
  async getStatus(): Promise<AiServiceStatus> {
    if (!this.token) {
      return { service: 'not_configured', models: [] };
    }

    try {
      const response = await this.fetch('/models', {
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (response.status === 401)
        return { service: 'unauthorized', models: [] };
      if (!response.ok) return { service: 'error', models: [] };

      const body: unknown = await response.json();
      const models =
        isRecord(body) && Array.isArray(body.models) ? body.models : [];
      return {
        service: 'available',
        models: models.filter(isRecord).map((model) => ({
          modelId: String(model.modelId),
          loaded: model.loaded === true,
          weightsSha256: isSha256(model.weightsSha256)
            ? model.weightsSha256
            : null,
          error: typeof model.error === 'string' ? model.error : null,
        })),
      };
    } catch {
      return { service: 'unavailable', models: [] };
    }
  }

  private fetch(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'X-Service-Token': this.token },
    });
  }
}

// By name, not instanceof: AbortSignal.timeout rejects with a DOMException,
// which is not always an Error of the current realm.
function isTimeout(error: unknown): boolean {
  const name =
    typeof error === 'object' && error !== null
      ? (error as { name?: unknown }).name
      : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

function toTransportError(error: unknown): AiServiceError {
  if (error instanceof AiServiceError) return error;
  return new AiServiceError(
    isTimeout(error) ? 'SERVICE_TIMEOUT' : 'SERVICE_UNAVAILABLE',
  );
}
