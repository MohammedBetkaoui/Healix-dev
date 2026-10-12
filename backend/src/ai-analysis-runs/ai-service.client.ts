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

// Pathology (ai-service/app/pathology_models.py). The BreakHis output is a
// malignancy score compared with a calibrated threshold, never a probability.
export const BREAKHIS_CLASSIFIER_ID = 'pathology-breakhis-classification';
export const BREAKHIS_DECISION_THRESHOLD = 0.13;
export const BREAST_DECISIONS = ['benign', 'malignant'] as const;
export type BreastDecision = (typeof BREAST_DECISIONS)[number];
// Original, left-right flip, up-down flip, both: their mean is the score.
const BREAKHIS_VIEWS = 4;

export const PANNUKE_SEGMENTER_ID = 'pathology-unet-pannuke-segmentation';
export const NUCLEUS_TYPES = [
  'neoplastic',
  'inflammatory',
  'connective',
  'dead',
  'epithelial',
] as const;
export type NucleusType = (typeof NUCLEUS_TYPES)[number];

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

export type BreastAnalysisResult = {
  modelId: string;
  weightsSha256: string;
  /** Mean of the 4 view scores, in [0, 1]: not calibrated, not a probability. */
  malignancyScore: number;
  threshold: number;
  decision: BreastDecision;
  /** Original, left-right flip, up-down flip, both flips. */
  views: number[];
  magnification: number;
  durationMs: number;
};

export type NucleiFractions = {
  /** Share of all the pixels. */
  background: number;
  /** Share of the nucleus pixels; every type null when there is none. */
  nucleusTypes: Record<NucleusType, number | null>;
};

export type NucleiAnalysisResult = {
  modelId: string;
  weightsSha256: string;
  /** One channel, the class index (0-5) of each pixel. */
  labelMapPng: Buffer;
  /** RGBA, each nucleus pixel in its type's colour, background transparent. */
  overlayPng: Buffer;
  classFractions: NucleiFractions;
  tiled: boolean;
  tileCount: number;
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
  | 'IMAGE_TOO_SMALL'
  | 'IMAGE_DIMENSIONS_TOO_LARGE'
  | 'SERVICE_ERROR';

// Failures that mean "this image cannot be analysed" (REJECTED_INPUT), not
// "the service failed" (FAILED).
export const INPUT_REJECTIONS: readonly AiServiceFailure[] = [
  'INVALID_IMAGE',
  'IMAGE_TOO_LARGE',
  'IMAGE_TOO_SMALL',
  'IMAGE_DIMENSIONS_TOO_LARGE',
];

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

const isPng = (data: Buffer) =>
  data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1;

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
    if (!isPng(maskPng)) throw invalid('masque non PNG');
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

/**
 * Validates POST /analyze/pathology/breast-classification. The threshold must
 * be the calibrated one, the score the mean of the 4 views, the decision the
 * one the threshold gives, the magnification the one sent: anything else is a
 * service error, never stored.
 */
export function parseBreastAnalysis(
  body: unknown,
  magnification: number,
): BreastAnalysisResult {
  if (!isRecord(body)) throw invalid('forme');
  if (body.modelId !== BREAKHIS_CLASSIFIER_ID) throw invalid('modèle');
  if (!isSha256(body.weightsSha256)) throw invalid('empreinte');
  if (!isFiniteBetween(body.malignancyScore, 0, 1)) throw invalid('score');
  // Exact: another threshold means other inference settings.
  if (body.threshold !== BREAKHIS_DECISION_THRESHOLD) throw invalid('seuil');

  const views = body.views;
  if (
    !Array.isArray(views) ||
    views.length !== BREAKHIS_VIEWS ||
    !views.every((view) => isFiniteBetween(view, 0, 1))
  ) {
    throw invalid('vues');
  }
  const score = body.malignancyScore as number;
  const mean =
    (views as number[]).reduce((sum, view) => sum + view, 0) / BREAKHIS_VIEWS;
  if (Math.abs(mean - score) > 1e-6) throw invalid('moyenne des vues');

  const expected: BreastDecision =
    score >= BREAKHIS_DECISION_THRESHOLD ? 'malignant' : 'benign';
  if (body.decision !== expected) throw invalid('décision');
  if (body.magnification !== magnification) throw invalid('grossissement');
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  return {
    decision: expected,
    durationMs: Math.round(body.durationMs as number),
    magnification,
    malignancyScore: score,
    modelId: BREAKHIS_CLASSIFIER_ID,
    threshold: BREAKHIS_DECISION_THRESHOLD,
    views: [...(views as number[])],
    weightsSha256: body.weightsSha256,
  };
}

function parseNucleusTypes(value: unknown): NucleiFractions['nucleusTypes'] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== NUCLEUS_TYPES.length ||
    !NUCLEUS_TYPES.every((type) => type in value)
  ) {
    throw invalid('types de noyaux');
  }
  const shares = NUCLEUS_TYPES.map((type) => value[type]);
  // No nucleus pixel: every share is null.
  if (!shares.every((share) => share === null)) {
    if (!shares.every((share) => isFiniteBetween(share, 0, 1)))
      throw invalid('parts des types de noyaux');
    const total = (shares as number[]).reduce((sum, share) => sum + share, 0);
    if (Math.abs(total - 1) > 1e-3) throw invalid('somme des types de noyaux');
  }
  return Object.fromEntries(
    NUCLEUS_TYPES.map((type, index) => [type, shares[index]]),
  ) as NucleiFractions['nucleusTypes'];
}

/**
 * Validates POST /analyze/pathology/nuclei-segmentation: both images PNG,
 * pixel shares coherent, tiles consistent. No nucleus count is ever read.
 */
export function parseNucleiAnalysis(body: unknown): NucleiAnalysisResult {
  if (!isRecord(body)) throw invalid('forme');
  if (body.modelId !== PANNUKE_SEGMENTER_ID) throw invalid('modèle');
  if (!isSha256(body.weightsSha256)) throw invalid('empreinte');

  if (
    typeof body.labelMapPng !== 'string' ||
    typeof body.overlayPng !== 'string'
  ) {
    throw invalid('images');
  }
  const labelMapPng = Buffer.from(body.labelMapPng, 'base64');
  const overlayPng = Buffer.from(body.overlayPng, 'base64');
  if (!isPng(labelMapPng)) throw invalid('carte des classes non PNG');
  if (!isPng(overlayPng)) throw invalid('superposition non PNG');

  if (
    !isPositiveInteger(body.imageWidth) ||
    !isPositiveInteger(body.imageHeight)
  ) {
    throw invalid('dimensions');
  }

  const fractions = body.classFractions;
  if (!isRecord(fractions) || !isFiniteBetween(fractions.background, 0, 1))
    throw invalid('part du fond');
  const nucleusTypes = parseNucleusTypes(fractions.nucleusTypes);

  if (!isPositiveInteger(body.tileCount)) throw invalid('tuiles');
  if (body.tiled !== body.tileCount > 1) throw invalid('découpage en tuiles');
  if (!isFiniteBetween(body.durationMs, 0, Number.MAX_SAFE_INTEGER))
    throw invalid('durée');

  return {
    classFractions: {
      background: fractions.background as number,
      nucleusTypes,
    },
    durationMs: Math.round(body.durationMs as number),
    imageHeight: body.imageHeight,
    imageWidth: body.imageWidth,
    labelMapPng,
    modelId: PANNUKE_SEGMENTER_ID,
    overlayPng,
    tileCount: body.tileCount,
    tiled: body.tileCount > 1,
    weightsSha256: body.weightsSha256,
  };
}

// The pathology endpoints say why an image is refused. The backend checked
// the magnification before calling: the service refusing it is an error.
export function pathologyRejection(code: unknown): AiServiceFailure {
  switch (code) {
    case 'image_too_small':
      return 'IMAGE_TOO_SMALL';
    case 'image_dimensions_too_large':
      return 'IMAGE_DIMENSIONS_TOO_LARGE';
    case 'invalid_magnification':
      return 'SERVICE_ERROR';
    default:
      return 'INVALID_IMAGE';
  }
}

const detailCode = (body: unknown): unknown =>
  isRecord(body) && isRecord(body.detail) ? body.detail.code : undefined;

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
    // Any 422 of /analyze/brain is an image the service could not decode.
    const body = await this.postImage(
      '/analyze/brain',
      { fileName, image, mimeType },
      {},
      () => 'INVALID_IMAGE',
    );
    return parseBrainAnalysis(body);
  }

  async analyzeBreast(
    image: Buffer,
    fileName: string,
    mimeType: string,
    magnification: number,
  ): Promise<BreastAnalysisResult> {
    const body = await this.postImage(
      '/analyze/pathology/breast-classification',
      { fileName, image, mimeType },
      { magnification: String(magnification) },
      pathologyRejection,
    );
    return parseBreastAnalysis(body, magnification);
  }

  async analyzeNuclei(
    image: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<NucleiAnalysisResult> {
    const body = await this.postImage(
      '/analyze/pathology/nuclei-segmentation',
      { fileName, image, mimeType },
      {},
      pathologyRejection,
    );
    return parseNucleiAnalysis(body);
  }

  /**
   * Sends one image (multipart field "image", plus text fields) and returns
   * the JSON body of a 2xx answer. Errors: 413 IMAGE_TOO_LARGE; 422 as
   * `rejection` reads detail.code; 503 MODEL_NOT_LOADED or
   * SERVICE_UNAVAILABLE; any other status SERVICE_ERROR.
   */
  private async postImage(
    path: string,
    file: { image: Buffer; fileName: string; mimeType: string },
    fields: Record<string, string>,
    rejection: (code: unknown) => AiServiceFailure,
  ): Promise<unknown> {
    if (!this.token) {
      throw new AiServiceError('SERVICE_NOT_CONFIGURED');
    }

    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(file.image)], { type: file.mimeType }),
      file.fileName,
    );
    for (const [name, value] of Object.entries(fields)) {
      form.append(name, value);
    }

    let response: Response;
    let body: unknown;
    try {
      // The timeout covers the whole exchange, body included.
      const signal = AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS);
      response = await this.fetch(path, {
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

    if (response.status === 422)
      throw new AiServiceError(rejection(detailCode(body)));
    if (response.status === 413) throw new AiServiceError('IMAGE_TOO_LARGE');
    if (response.status === 503) {
      throw new AiServiceError(
        detailCode(body) === 'model_not_loaded'
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
    return body;
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
