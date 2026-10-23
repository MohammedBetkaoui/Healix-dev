import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiAnalysisRunStatus,
  AiRunDecision,
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
  PatientDocumentType,
  type Prisma,
  type AiAnalysisRun,
} from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import {
  formatPhysicianName,
  isPhysicianRole,
} from '../common/utils/physician-name';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationProducerService } from '../notifications/notification-producer.service';
import {
  AI_SERVICE_TIMEOUT_MS,
  AiServiceClient,
  AiServiceError,
  type AiServiceFailure,
  type CardioSegAnalysisResult,
  ECG_CLASSES,
  ECG_REJECTIONS,
  type EcgAnalysisResult,
  type EcgClass,
  INPUT_REJECTIONS,
  type NucleiFractions,
  type RejectionDetails,
} from './ai-service.client';
import {
  type AiPipeline,
  CreateAiAnalysisRunDto,
  NUCLEI_MAGNIFICATION,
} from './dto/create-ai-analysis-run.dto';
import {
  CORRECTION_LABELS,
  DecideAiAnalysisRunDto,
  ECG_NORMAL_CLASS,
} from './dto/decide-ai-analysis-run.dto';

// The inference service decodes PNG and JPEG; the cardiac MRI chain also
// reads a single-frame DICOM.
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const DICOM_MIME_TYPE = 'application/dicom';

// Chains whose result is a map to review: validated or rejected, never
// corrected to a class.
export const MAP_PIPELINES: ReadonlySet<string> = new Set([
  'pathology-nuclei',
  'cardio-seg-mri',
]);

/** A DICOM document: declared so, or a .dcm sent without a MIME type. */
export function isDicomDocument(document: {
  documentType: string;
  mimeType: string;
  originalName: string;
}): boolean {
  return (
    document.documentType === PatientDocumentType.DICOM ||
    document.mimeType === DICOM_MIME_TYPE ||
    (!document.mimeType && document.originalName.toLowerCase().endsWith('.dcm'))
  );
}

/** What a cardiac MRI run stores in `predictions`: the areas, never an image. */
export type CardioSegPredictions = Pick<
  CardioSegAnalysisResult,
  | 'configSha256'
  | 'noStructureFound'
  | 'pixelSpacingMm'
  | 'source'
  | 'structures'
>;
// A CSV/TXT signal (stored as text/csv or text/plain) carries no sampling
// rate; a zipped WFDB record has it in its header.
const ECG_TEXT_TYPES = new Set(['text/csv', 'text/plain']);

/** What a cardiology run stores in `predictions`: never the signal itself. */
export type EcgPredictions = Pick<
  EcgAnalysisResult,
  | 'configSha256'
  | 'durationSeconds'
  | 'inputSamplingRate'
  | 'positive'
  | 'probabilities'
  | 'thresholds'
  | 'windows'
>;

// A run still RUNNING this long after its creation lost its request (backend
// restarted mid-analysis): the service call itself stops at the timeout.
export const STALE_RUN_AFTER_MS = AI_SERVICE_TIMEOUT_MS + 60_000;

type RunErrorCode =
  | AiServiceFailure
  | 'MASK_STORAGE_FAILED'
  | 'RUN_INTERRUPTED';

// The decision's author, by name only (never other user fields): the role
// only tells whether the name is a physician's, given as "Dr <name>".
export const decidedByInclude = {
  decidedBy: { select: { fullName: true, role: true } },
  // The number of its PDF report, once generated.
  report: { select: { reportNumber: true } },
} as const;

export type RunWithDecider = AiAnalysisRun & {
  decidedBy?: { fullName: string; role: string } | null;
  report?: { reportNumber: string } | null;
};

const deciderName = ({ fullName, role }: { fullName: string; role: string }) =>
  isPhysicianRole(role) ? formatPhysicianName(fullName) : fullName;

const alreadyDecided = () =>
  new ConflictException({
    code: 'AI_RUN_ALREADY_DECIDED',
    message: 'Cette analyse a déjà reçu une décision, qui est définitive.',
  });

// Prediction with the highest probability in the stored predictions.
export function getTopPrediction(
  predictions: unknown,
): { label: string; probability: number } | null {
  if (!Array.isArray(predictions)) {
    return null;
  }

  let top: { label: string; probability: number } | null = null;
  for (const prediction of predictions as unknown[]) {
    const candidate = prediction as { label?: unknown; probability?: unknown };
    if (
      typeof candidate.label === 'string' &&
      typeof candidate.probability === 'number' &&
      (top === null || candidate.probability > top.probability)
    ) {
      top = { label: candidate.label, probability: candidate.probability };
    }
  }

  return top;
}

export function getTopLabel(predictions: unknown): string | null {
  return getTopPrediction(predictions)?.label ?? null;
}

const isEcgClass = (value: unknown): value is EcgClass =>
  (ECG_CLASSES as readonly unknown[]).includes(value);

/**
 * The ECG model's answer, the classes at or above their threshold (possibly
 * none), in class order; null for the other chains and without a result.
 */
export function getModelLabels(run: {
  pipeline: string;
  predictions: unknown;
}): EcgClass[] | null {
  if (run.pipeline !== 'cardio-ecg') return null;
  const predictions = run.predictions as { positive?: unknown } | null;
  if (!predictions || !Array.isArray(predictions.positive)) return null;
  const positive = predictions.positive as unknown[];
  return ECG_CLASSES.filter((label) => positive.includes(label));
}

/** The classes a physician kept on an ECG, as stored. */
export function getDecisionLabels(value: unknown): EcgClass[] | null {
  return Array.isArray(value) ? value.filter(isEcgClass) : null;
}

const sameLabels = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((label) => b.includes(label));

/**
 * The model's answer the physician validates or corrects: the brain
 * classifier's top class, the BreakHis result (benign | malignant). None for
 * the nuclei segmentation, a map to review, not a class.
 */
export function getModelLabel(run: {
  pipeline: string;
  predictions: unknown;
  modelDecision: string | null;
}): string | null {
  switch (run.pipeline) {
    case 'brain':
      return getTopLabel(run.predictions);
    case 'pathology-breast':
      return run.modelDecision;
    default:
      return null;
  }
}

/**
 * The magnification a chain takes: none for brain, one of 40, 100, 200 or
 * 400 for the breast classification, 40 for the nuclei segmentation (the
 * physician confirms a 40x H&E image).
 */
export function checkMagnification(
  pipeline: AiPipeline,
  magnification: number | null | undefined,
): number | null {
  if (
    pipeline === 'brain' ||
    pipeline === 'cardio-ecg' ||
    pipeline === 'cardio-seg-mri'
  ) {
    if (magnification != null) {
      throw new BadRequestException({
        code: 'AI_MAGNIFICATION_UNEXPECTED',
        message:
          "Le grossissement ne concerne que l'analyse d'une lame d'histopathologie.",
      });
    }
    return null;
  }
  if (magnification == null) {
    throw new BadRequestException({
      code: 'AI_MAGNIFICATION_REQUIRED',
      message: 'Indiquez le grossissement de la lame.',
    });
  }
  if (
    pipeline === 'pathology-nuclei' &&
    magnification !== NUCLEI_MAGNIFICATION
  ) {
    throw new BadRequestException({
      code: 'AI_MAGNIFICATION_NOT_SUPPORTED',
      message:
        'La segmentation des noyaux ne prend que des images H&E au grossissement 40×.',
    });
  }
  return magnification;
}

/** The sampling rate and unit of a signal belong to the ECG chain only. */
export function checkEcgOptions(
  pipeline: AiPipeline,
  options: { samplingRate?: number; unit?: string },
): void {
  if (
    pipeline !== 'cardio-ecg' &&
    (options.samplingRate !== undefined || options.unit !== undefined)
  ) {
    throw new BadRequestException({
      code: 'AI_ECG_OPTIONS_UNEXPECTED',
      message:
        "La fréquence d'échantillonnage et l'unité ne concernent que l'analyse d'un ECG.",
    });
  }
}

type FinishData = Partial<
  Omit<
    AiAnalysisRun,
    'predictions' | 'ttaScores' | 'nucleiFractions' | 'decisionLabels'
  >
> & {
  errorCode?: RunErrorCode;
  predictions?:
    | { label: string; probability: number }[]
    | EcgPredictions
    | CardioSegPredictions;
  ttaScores?: number[];
  nucleiFractions?: NucleiFractions;
  status: AiAnalysisRunStatus;
};

@Injectable()
export class AiAnalysisRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly fileStorageService: PatientFileStorageService,
    private readonly patientAuditService: PatientAuditService,
    private readonly aiServiceClient: AiServiceClient,
    @Optional()
    private readonly notificationProducer?: NotificationProducerService,
  ) {}

  async create(
    user: AuthenticatedUserPayload,
    patientId: string,
    dto: CreateAiAnalysisRunDto,
  ) {
    // The request itself first: nothing is read for a malformed one.
    const magnification = checkMagnification(dto.pipeline, dto.magnification);
    checkEcgOptions(dto.pipeline, dto);

    await this.patientsService.getPatientInScope(user, patientId);
    await this.patientsService.assertDiagnosticAiConsentSigned(patientId);

    // (id, patientId): a document of another patient answers 404.
    const document = await this.prisma.patientDocument.findFirst({
      where: { id: dto.sourceDocumentId, patientId },
    });

    if (!document) {
      throw new NotFoundException('Document introuvable.');
    }

    const ecg = dto.pipeline === 'cardio-ecg';
    if (ecg && document.documentType !== PatientDocumentType.ECG_SIGNAL) {
      throw new UnprocessableEntityException({
        code: 'AI_UNSUPPORTED_DOCUMENT',
        message:
          'Seul un document de type « Signal ECG » peut être analysé par cette chaîne.',
      });
    }
    const mri = dto.pipeline === 'cardio-seg-mri';
    const dicom = mri && isDicomDocument(document);
    if (mri && !dicom && !SUPPORTED_IMAGE_TYPES.has(document.mimeType)) {
      throw new UnprocessableEntityException({
        code: 'AI_UNSUPPORTED_DOCUMENT',
        message:
          'Seules une image PNG ou JPEG, ou un DICOM, peuvent être analysés par cette chaîne.',
      });
    }
    if (!ecg && !mri && !SUPPORTED_IMAGE_TYPES.has(document.mimeType)) {
      throw new UnprocessableEntityException({
        code: 'AI_UNSUPPORTED_DOCUMENT',
        message: 'Seules les images PNG ou JPEG peuvent être analysées.',
      });
    }
    const textSignal = ecg && ECG_TEXT_TYPES.has(document.mimeType);
    if (textSignal && dto.samplingRate === undefined) {
      throw new BadRequestException({
        code: 'AI_SAMPLING_RATE_REQUIRED',
        message:
          "Indiquez la fréquence d'échantillonnage du signal (un fichier CSV ou texte ne la contient pas).",
      });
    }

    const image = await this.fileStorageService.readStoredFile(
      document.localPath,
    );
    const impression = dto.clinicianImpression
      ? sanitizeTextInput(dto.clinicianImpression)
      : '';

    const run = await this.prisma.aiAnalysisRun.create({
      data: {
        clinicianImpression: impression || null,
        magnification,
        patientId,
        pipeline: dto.pipeline,
        requestedById: user.sub,
        sourceDocumentId: document.id,
        status: AiAnalysisRunStatus.RUNNING,
      },
    });

    // The chain and the magnification (the rate and unit of a signal),
    // never a result.
    await this.patientAuditService.log(
      user,
      'AI_ANALYSIS_RUN_CREATED',
      run.id,
      {
        magnification,
        patientId,
        pipeline: dto.pipeline,
        sourceDocumentId: document.id,
        ...(ecg
          ? {
              samplingRate: dto.samplingRate ?? null,
              unit: dto.unit ?? null,
            }
          : {}),
      },
    );

    const file = {
      image,
      // A .dcm may be stored without a MIME type.
      mimeType: dicom ? DICOM_MIME_TYPE : document.mimeType,
      name: document.originalName,
    };
    switch (dto.pipeline) {
      case 'pathology-breast':
        return this.runBreast(user, run, file, magnification as number);
      case 'pathology-nuclei':
        return this.runNuclei(user, run, file);
      case 'cardio-seg-mri':
        return this.runCardioSeg(user, run, file);
      case 'cardio-ecg':
        // A WFDB header gives its own rate and unit: sent for text only.
        return this.runEcg(
          user,
          run,
          file,
          textSignal ? { samplingRate: dto.samplingRate, unit: dto.unit } : {},
        );
      default:
        return this.runBrain(user, run, file);
    }
  }

  // One chain, never followed by another: the service's answer, stored.
  private async runBrain(
    user: AuthenticatedUserPayload,
    run: AiAnalysisRun,
    file: { image: Buffer; mimeType: string; name: string },
  ) {
    const result = await this.analyze(user, run.id, () =>
      this.aiServiceClient.analyzeBrain(file.image, file.name, file.mimeType),
    );
    const { patientId } = run;

    let maskPath: string | null = null;
    if (result.segmentation) {
      try {
        ({ localPath: maskPath } = await this.fileStorageService.storeAiMask({
          patientId,
          png: result.segmentation.maskPng,
          runId: run.id,
        }));
      } catch {
        await this.finish(user, run.id, {
          errorCode: 'MASK_STORAGE_FAILED',
          status: AiAnalysisRunStatus.FAILED,
        });
        throw this.toHttpError('MASK_STORAGE_FAILED', run.id);
      }
    }

    const completed = await this.finish(user, run.id, {
      classificationModelId: result.classification.modelId,
      classificationWeightsSha256: result.classification.weightsSha256,
      durationMs: result.durationMs,
      maskAreaPx: result.segmentation?.areaPx ?? null,
      maskAreaRatio: result.segmentation?.areaRatio ?? null,
      maskPath,
      predictions: result.classification.predictions,
      segmentationModelId: result.segmentation?.modelId ?? null,
      segmentationSkippedReason: result.segmentationSkippedReason,
      segmentationWeightsSha256: result.segmentation?.weightsSha256 ?? null,
      status: AiAnalysisRunStatus.SUCCEEDED,
    });

    return this.toRunResponse(completed);
  }

  // BreakHis: the score and its 4 views next to the threshold; never in
  // `predictions` (not a probability, and the brain rules read that field).
  private async runBreast(
    user: AuthenticatedUserPayload,
    run: AiAnalysisRun,
    file: { image: Buffer; mimeType: string; name: string },
    magnification: number,
  ) {
    const result = await this.analyze(user, run.id, () =>
      this.aiServiceClient.analyzeBreast(
        file.image,
        file.name,
        file.mimeType,
        magnification,
      ),
    );
    const completed = await this.finish(user, run.id, {
      classificationModelId: result.modelId,
      classificationWeightsSha256: result.weightsSha256,
      decisionThreshold: result.threshold,
      durationMs: result.durationMs,
      magnification: result.magnification,
      malignancyScore: result.malignancyScore,
      modelDecision: result.decision,
      status: AiAnalysisRunStatus.SUCCEEDED,
      ttaScores: result.views,
    });
    return this.toRunResponse(completed);
  }

  // PanNuke: the label map (maskPath) and its colour overlay (overlayPath),
  // the pixel shares and the tiles. The "segmented area" is every nucleus
  // pixel: 1 - background.
  private async runNuclei(
    user: AuthenticatedUserPayload,
    run: AiAnalysisRun,
    file: { image: Buffer; mimeType: string; name: string },
  ) {
    const result = await this.analyze(user, run.id, () =>
      this.aiServiceClient.analyzeNuclei(file.image, file.name, file.mimeType),
    );
    const { maskPath, overlayPath } = await this.storeMapImages(user, run, {
      labelMapPng: result.labelMapPng,
      overlayPng: result.overlayPng,
    });

    const ratio = 1 - result.classFractions.background;
    const completed = await this.finish(user, run.id, {
      durationMs: result.durationMs,
      magnification: NUCLEI_MAGNIFICATION,
      maskAreaPx: Math.round(ratio * result.imageWidth * result.imageHeight),
      maskAreaRatio: ratio,
      maskPath,
      nucleiFractions: result.classFractions,
      overlayPath,
      segmentationModelId: result.modelId,
      segmentationWeightsSha256: result.weightsSha256,
      status: AiAnalysisRunStatus.SUCCEEDED,
      tileCount: result.tileCount,
    });
    return this.toRunResponse(completed);
  }

  // Cardiac MRI: the class map (maskPath), its colour overlay (overlayPath)
  // and the slice as analysed (slicePath); the areas in `predictions`. The
  // "segmented area" is every pixel of the three structures.
  private async runCardioSeg(
    user: AuthenticatedUserPayload,
    run: AiAnalysisRun,
    file: { image: Buffer; mimeType: string; name: string },
  ) {
    const result = await this.analyze(user, run.id, () =>
      this.aiServiceClient.analyzeCardioSeg(
        file.image,
        file.name,
        file.mimeType,
      ),
    );
    const { maskPath, overlayPath, slicePath } = await this.storeMapImages(
      user,
      run,
      {
        labelMapPng: result.labelMapPng,
        overlayPng: result.overlayPng,
        slicePng: result.slicePng,
      },
    );

    const pixels = Object.values(result.structures).reduce(
      (sum, area) => sum + area.pixels,
      0,
    );
    const completed = await this.finish(user, run.id, {
      durationMs: result.durationMs,
      maskAreaPx: pixels,
      maskAreaRatio: pixels / (result.imageWidth * result.imageHeight),
      maskPath,
      overlayPath,
      predictions: {
        configSha256: result.configSha256,
        noStructureFound: result.noStructureFound,
        pixelSpacingMm: result.pixelSpacingMm,
        source: result.source,
        structures: result.structures,
      },
      segmentationModelId: result.modelId,
      segmentationWeightsSha256: result.weightsSha256,
      slicePath,
      status: AiAnalysisRunStatus.SUCCEEDED,
    });
    return this.toRunResponse(completed);
  }

  // The images of a segmentation map, all stored or none: on a failure the
  // stored ones are removed and the run FAILED (MASK_STORAGE_FAILED).
  private async storeMapImages(
    user: AuthenticatedUserPayload,
    run: AiAnalysisRun,
    images: { labelMapPng: Buffer; overlayPng: Buffer; slicePng?: Buffer },
  ): Promise<{
    maskPath: string;
    overlayPath: string;
    slicePath: string | null;
  }> {
    const storage = this.fileStorageService;
    const stored: string[] = [];
    const store = async (kind: 'mask' | 'overlay' | 'slice', png: Buffer) => {
      const input = { patientId: run.patientId, png, runId: run.id };
      const { localPath } =
        kind === 'mask'
          ? await storage.storeAiMask(input)
          : kind === 'overlay'
            ? await storage.storeAiOverlay(input)
            : await storage.storeAiSlice(input);
      stored.push(localPath);
      return localPath;
    };
    try {
      return {
        maskPath: await store('mask', images.labelMapPng),
        overlayPath: await store('overlay', images.overlayPng),
        slicePath: images.slicePng
          ? await store('slice', images.slicePng)
          : null,
      };
    } catch {
      for (const path of stored) {
        await this.fileStorageService.deleteLocalFile(path);
      }
      await this.finish(user, run.id, {
        errorCode: 'MASK_STORAGE_FAILED',
        status: AiAnalysisRunStatus.FAILED,
      });
      throw this.toHttpError('MASK_STORAGE_FAILED', run.id);
    }
  }

  // A 12-lead ECG: the probabilities per class, the thresholds and the
  // classes above them in `predictions`; the trace (first 10 s, filtered, as
  // drawn) in its own file, served by GET .../ecg-trace.
  private async runEcg(
    user: AuthenticatedUserPayload,
    run: AiAnalysisRun,
    file: { image: Buffer; mimeType: string; name: string },
    options: { samplingRate?: number; unit?: 'mV' | 'uV' },
  ) {
    const result = await this.analyze(user, run.id, () =>
      this.aiServiceClient.analyzeEcg(
        file.image,
        file.name,
        file.mimeType,
        options,
      ),
    );

    let tracePath: string;
    try {
      ({ localPath: tracePath } = await this.fileStorageService.storeAiEcgTrace(
        {
          json: Buffer.from(JSON.stringify(result.trace), 'utf8'),
          patientId: run.patientId,
          runId: run.id,
        },
      ));
    } catch {
      await this.finish(user, run.id, {
        errorCode: 'MASK_STORAGE_FAILED',
        status: AiAnalysisRunStatus.FAILED,
      });
      throw this.toHttpError('MASK_STORAGE_FAILED', run.id);
    }

    const completed = await this.finish(user, run.id, {
      classificationModelId: result.modelId,
      classificationWeightsSha256: result.weightsSha256,
      durationMs: result.durationMs,
      predictions: {
        configSha256: result.configSha256,
        durationSeconds: result.durationSeconds,
        inputSamplingRate: result.inputSamplingRate,
        positive: result.positive,
        probabilities: result.probabilities,
        thresholds: result.thresholds,
        windows: result.windows,
      },
      status: AiAnalysisRunStatus.SUCCEEDED,
      tracePath,
    });
    return this.toRunResponse(completed);
  }

  // The service call; a failure is stored (REJECTED_INPUT when the input is
  // refused, FAILED otherwise) and answered with the run's id.
  private async analyze<T>(
    user: AuthenticatedUserPayload,
    runId: string,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      const code =
        error instanceof AiServiceError ? error.code : 'SERVICE_ERROR';
      await this.finish(user, runId, {
        errorCode: code,
        status: INPUT_REJECTIONS.includes(code)
          ? AiAnalysisRunStatus.REJECTED_INPUT
          : AiAnalysisRunStatus.FAILED,
      });
      throw this.toHttpError(
        code,
        runId,
        error instanceof AiServiceError ? error.details : {},
      );
    }
  }

  async list(user: AuthenticatedUserPayload, patientId: string) {
    await this.patientsService.getPatientInScope(user, patientId);

    const runs = await this.prisma.aiAnalysisRun.findMany({
      include: decidedByInclude,
      orderBy: { createdAt: 'desc' },
      where: { patientId },
    });
    const current = await Promise.all(
      runs.map((run) => this.expireIfStale(user, run)),
    );

    return current.map((run) => this.toRunResponse(run));
  }

  async findOne(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
  ) {
    const run = await this.getRunInScope(user, patientId, runId);
    return this.toRunResponse(await this.expireIfStale(user, run));
  }

  // The physician's decision is final: one per run, only on a SUCCEEDED run.
  // Brain and breast: validate the model's answer, correct it to another
  // label of the chain, or reject it. Nuclei: the map is validated (reviewed
  // and accepted, no label) or rejected, never corrected. ECG (multi-label):
  // validate the model's classes, correct them to another set, or reject.
  async decide(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
    dto: DecideAiAnalysisRunDto,
  ) {
    const run = await this.getRunInScope(user, patientId, runId);

    if (run.status !== AiAnalysisRunStatus.SUCCEEDED) {
      throw new ConflictException({
        code: 'AI_RUN_NOT_DECIDABLE',
        message: 'Seule une analyse réussie peut recevoir une décision.',
      });
    }

    if (run.decisionStatus !== null) {
      throw alreadyDecided();
    }

    if (run.pipeline === 'cardio-ecg') {
      return this.decideEcg(user, patientId, run, dto);
    }
    if (dto.correctedLabels !== undefined) {
      throw new BadRequestException({
        code: 'AI_CORRECTED_LABELS_NOT_APPLICABLE',
        message:
          'Plusieurs classes ne se retiennent que pour un ECG ; corrigez avec une seule classe.',
      });
    }

    const isMap = MAP_PIPELINES.has(run.pipeline);
    const modelLabel = getModelLabel(run);

    if (!isMap && !modelLabel) {
      throw new ConflictException({
        code: 'AI_RUN_NOT_DECIDABLE',
        message: "Cette analyse n'a pas de résultat de classification.",
      });
    }

    if (dto.status !== AiRunDecision.CORRECTED && dto.correctedLabel) {
      throw new BadRequestException({
        code: 'AI_CORRECTED_LABEL_UNEXPECTED',
        message: "Une classe corrigée n'accompagne qu'une correction.",
      });
    }

    if (isMap && dto.status === AiRunDecision.CORRECTED) {
      throw new BadRequestException({
        code: 'AI_CORRECTION_NOT_APPLICABLE',
        message:
          'Une carte de segmentation se valide ou se rejette ; elle ne se corrige pas.',
      });
    }

    if (
      dto.status === AiRunDecision.CORRECTED &&
      !(CORRECTION_LABELS[run.pipeline as AiPipeline] ?? []).includes(
        dto.correctedLabel as string,
      )
    ) {
      throw new BadRequestException({
        code: 'AI_CORRECTED_LABEL_INVALID',
        message: "Cette classe n'appartient pas à cette chaîne d'analyse.",
      });
    }

    if (
      dto.status === AiRunDecision.CORRECTED &&
      dto.correctedLabel === modelLabel
    ) {
      throw new BadRequestException({
        code: 'AI_CORRECTION_MATCHES_MODEL',
        message:
          'La classe corrigée doit différer de la classe proposée par le modèle.',
      });
    }

    const decisionLabel =
      dto.status === AiRunDecision.VALIDATED
        ? modelLabel
        : dto.status === AiRunDecision.CORRECTED
          ? (dto.correctedLabel as string)
          : null;

    // Agreement with the model only, never the reason's text. A nuclei map
    // has no label to agree with.
    return this.recordDecision(
      user,
      patientId,
      run,
      dto,
      { decisionLabel },
      {
        agreesWithModel:
          dto.status === AiRunDecision.REJECTED || isMap
            ? null
            : decisionLabel === modelLabel,
        decisionLabel,
        modelLabel,
        status: dto.status,
      },
    );
  }

  // NORM excludes every other class; a correction differs from the model's
  // set. Validating keeps the model's classes, even none above a threshold.
  private async decideEcg(
    user: AuthenticatedUserPayload,
    patientId: string,
    run: RunWithDecider,
    dto: DecideAiAnalysisRunDto,
  ) {
    const modelLabels = getModelLabels(run);
    if (!modelLabels) {
      throw new ConflictException({
        code: 'AI_RUN_NOT_DECIDABLE',
        message: "Cette analyse n'a pas de résultat de classification.",
      });
    }

    if (dto.correctedLabel !== undefined) {
      throw new BadRequestException({
        code: 'AI_CORRECTED_LABEL_UNEXPECTED',
        message:
          'Un ECG se corrige par un ensemble de classes (correctedLabels), pas par une seule.',
      });
    }
    if (dto.status !== AiRunDecision.CORRECTED && dto.correctedLabels) {
      throw new BadRequestException({
        code: 'AI_CORRECTED_LABEL_UNEXPECTED',
        message: "Des classes corrigées n'accompagnent qu'une correction.",
      });
    }

    let decisionLabels: EcgClass[] | null = null;
    if (dto.status === AiRunDecision.VALIDATED) {
      decisionLabels = modelLabels;
    } else if (dto.status === AiRunDecision.CORRECTED) {
      const corrected = dto.correctedLabels;
      if (!corrected || corrected.length === 0) {
        throw new BadRequestException({
          code: 'AI_CORRECTED_LABELS_REQUIRED',
          message: 'Indiquez les classes retenues.',
        });
      }
      if (corrected.includes(ECG_NORMAL_CLASS) && corrected.length > 1) {
        throw new BadRequestException({
          code: 'AI_CORRECTED_LABELS_INVALID',
          message: '« ECG normal » exclut toute autre classe.',
        });
      }
      decisionLabels = ECG_CLASSES.filter((label) => corrected.includes(label));
      if (sameLabels(decisionLabels, modelLabels)) {
        throw new BadRequestException({
          code: 'AI_CORRECTION_MATCHES_MODEL',
          message:
            'Les classes corrigées doivent différer de celles proposées par le modèle.',
        });
      }
    }

    return this.recordDecision(
      user,
      patientId,
      run,
      dto,
      { decisionLabel: null, decisionLabels },
      {
        agreesWithModel:
          dto.status === AiRunDecision.REJECTED
            ? null
            : dto.status === AiRunDecision.VALIDATED,
        decisionLabels,
        modelLabels,
        status: dto.status,
      },
    );
  }

  // Conditional write: of two concurrent submissions, only one lands.
  private async recordDecision(
    user: AuthenticatedUserPayload,
    patientId: string,
    run: RunWithDecider,
    dto: DecideAiAnalysisRunDto,
    labels: { decisionLabel: string | null; decisionLabels?: string[] | null },
    audit: Prisma.InputJsonObject,
  ) {
    const reason = dto.reason ? sanitizeTextInput(dto.reason) : '';
    const { count } = await this.prisma.aiAnalysisRun.updateMany({
      data: {
        decidedAt: new Date(),
        decidedById: user.sub,
        decisionLabel: labels.decisionLabel,
        decisionReason: reason || null,
        decisionStatus: dto.status,
        ...(labels.decisionLabels
          ? { decisionLabels: labels.decisionLabels }
          : {}),
      },
      where: {
        decisionStatus: null,
        id: run.id,
        status: AiAnalysisRunStatus.SUCCEEDED,
      },
    });

    if (count === 0) {
      throw alreadyDecided();
    }

    await this.patientAuditService.log(
      user,
      'AI_ANALYSIS_RUN_DECIDED',
      run.id,
      audit,
    );

    return this.findOne(user, patientId, run.id);
  }

  // Without this, a run whose request died (backend restart) would stay
  // RUNNING for good and the result page would poll it forever.
  async expireIfStale(
    user: AuthenticatedUserPayload,
    run: RunWithDecider,
    now: Date = new Date(),
  ): Promise<RunWithDecider> {
    if (
      run.status !== AiAnalysisRunStatus.RUNNING ||
      now.getTime() - run.createdAt.getTime() < STALE_RUN_AFTER_MS
    ) {
      return run;
    }

    // Guarded on RUNNING: a request finishing at the same moment wins.
    const { count } = await this.prisma.aiAnalysisRun.updateMany({
      data: {
        errorCode: 'RUN_INTERRUPTED',
        status: AiAnalysisRunStatus.FAILED,
      },
      where: { id: run.id, status: AiAnalysisRunStatus.RUNNING },
    });

    if (count > 0) {
      await this.patientAuditService.log(
        user,
        'AI_ANALYSIS_RUN_COMPLETED',
        run.id,
        {
          errorCode: 'RUN_INTERRUPTED',
          magnification: run.magnification,
          pipeline: run.pipeline,
          segmentationModelId: null,
          status: AiAnalysisRunStatus.FAILED,
        },
      );
    }

    const current = await this.prisma.aiAnalysisRun.findFirst({
      include: decidedByInclude,
      where: { id: run.id },
    });
    return current ?? run;
  }

  async getMask(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
  ) {
    const run = await this.getRunInScope(user, patientId, runId);

    if (!run.maskPath) {
      throw new NotFoundException('Masque introuvable.');
    }

    return {
      fileName: `masque-${run.id}.png`,
      png: await this.fileStorageService.readStoredFile(run.maskPath),
    };
  }

  // The colour overlay of a nuclei segmentation.
  async getOverlay(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
  ) {
    const run = await this.getRunInScope(user, patientId, runId);

    if (!run.overlayPath) {
      throw new NotFoundException('Superposition introuvable.');
    }

    return {
      fileName: `superposition-${run.id}.png`,
      png: await this.fileStorageService.readStoredFile(run.overlayPath),
    };
  }

  // The slice a cardiac MRI segmentation analysed (8-bit PNG).
  async getSlice(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
  ) {
    const run = await this.getRunInScope(user, patientId, runId);

    if (!run.slicePath) {
      throw new NotFoundException('Coupe introuvable.');
    }

    return {
      fileName: `coupe-${run.id}.png`,
      png: await this.fileStorageService.readStoredFile(run.slicePath),
    };
  }

  // The trace of an ECG analysis: the first 10 s, filtered, in mV, per lead.
  async getEcgTrace(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
  ) {
    const run = await this.getRunInScope(user, patientId, runId);

    if (!run.tracePath) {
      throw new NotFoundException('Tracé introuvable.');
    }

    return {
      fileName: `trace-ecg-${run.id}.json`,
      json: await this.fileStorageService.readStoredFile(run.tracePath),
    };
  }

  private async getRunInScope(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
  ) {
    await this.patientsService.getPatientInScope(user, patientId);

    // (id, patientId): a run of another patient answers 404.
    const run = await this.prisma.aiAnalysisRun.findFirst({
      include: decidedByInclude,
      where: { id: runId, patientId },
    });

    if (!run) {
      throw new NotFoundException('Analyse introuvable.');
    }

    return run;
  }

  private async finish(
    user: AuthenticatedUserPayload,
    runId: string,
    data: FinishData,
  ) {
    const run = await this.prisma.aiAnalysisRun.update({
      data,
      where: { id: runId },
    });

    // The chain and the magnification, never the score nor the fractions.
    await this.patientAuditService.log(
      user,
      'AI_ANALYSIS_RUN_COMPLETED',
      run.id,
      {
        errorCode: run.errorCode,
        magnification: run.magnification,
        pipeline: run.pipeline,
        segmentationModelId: run.segmentationModelId,
        status: run.status,
      },
    );

    if (
      run.status === AiAnalysisRunStatus.SUCCEEDED ||
      run.status === AiAnalysisRunStatus.FAILED
    ) {
      const succeeded = run.status === AiAnalysisRunStatus.SUCCEEDED;
      await this.notificationProducer?.create({
        userId: run.requestedById,
        category: NotificationCategory.AI_ANALYSIS,
        type: succeeded ? 'AI_ANALYSIS_SUCCEEDED' : 'AI_ANALYSIS_FAILED',
        severity: succeeded
          ? NotificationSeverity.SUCCESS
          : NotificationSeverity.WARNING,
        resourceType: NotificationResourceType.AI_ANALYSIS_RUN,
        resourceId: run.id,
        data: { analysisRunId: run.id, pipeline: run.pipeline },
        dedupeKey: `analysis-${succeeded ? 'ready' : 'failed'}:${run.id}:${run.requestedById}`,
      });
    }

    return run;
  }

  // Every failure carries the runId: the result page shows its state. A
  // refused ECG says why (missing leads, duration...) in `details`.
  private toHttpError(
    code: RunErrorCode,
    runId: string,
    details: RejectionDetails = {},
  ): HttpException {
    const body = (status: string, message: string) => ({
      code: status,
      message,
      reason: code,
      runId,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    });

    if ((ECG_REJECTIONS as readonly string[]).includes(code)) {
      return new UnprocessableEntityException(
        body(
          'AI_INPUT_REJECTED',
          "Le signal ECG a été refusé par le service d'analyse.",
        ),
      );
    }

    switch (code) {
      case 'INVALID_IMAGE':
      case 'IMAGE_TOO_LARGE':
      case 'IMAGE_TOO_SMALL':
      case 'IMAGE_DIMENSIONS_TOO_LARGE':
      case 'CARDIO_SEG_NOT_GRAYSCALE':
      case 'CARDIO_SEG_MULTIFRAME':
        return new UnprocessableEntityException(
          body(
            'AI_INPUT_REJECTED',
            "L'image a été refusée par le service d'analyse.",
          ),
        );
      case 'SERVICE_TIMEOUT':
        return new GatewayTimeoutException(
          body(
            'AI_SERVICE_TIMEOUT',
            "Le service d'analyse n'a pas répondu à temps.",
          ),
        );
      case 'SERVICE_UNAVAILABLE':
      case 'SERVICE_NOT_CONFIGURED':
      case 'MODEL_NOT_LOADED':
        return new ServiceUnavailableException(
          body(
            'AI_SERVICE_UNAVAILABLE',
            "Le service d'analyse est indisponible.",
          ),
        );
      case 'RUN_INTERRUPTED':
        return new InternalServerErrorException(
          body(
            'AI_RUN_INTERRUPTED',
            "L'analyse a été interrompue avant sa fin.",
          ),
        );
      case 'MASK_STORAGE_FAILED':
        return new InternalServerErrorException(
          body(
            'AI_MASK_STORAGE_FAILED',
            "Le masque de segmentation n'a pas pu être enregistré.",
          ),
        );
      default:
        return new BadGatewayException(
          body(
            'AI_SERVICE_ERROR',
            "Le service d'analyse a renvoyé une réponse invalide.",
          ),
        );
    }
  }

  // maskPath, overlayPath, tracePath and slicePath stay server-side; the
  // client gets hasMask, hasOverlay, hasTrace, hasSlice and their routes.
  toRunResponse(run: RunWithDecider) {
    return {
      id: run.id,
      patientId: run.patientId,
      sourceDocumentId: run.sourceDocumentId,
      pipeline: run.pipeline,
      status: run.status,
      classificationModelId: run.classificationModelId,
      classificationWeightsSha256: run.classificationWeightsSha256,
      predictions: run.predictions,
      modelLabel: getModelLabel(run),
      modelLabels: getModelLabels(run),
      magnification: run.magnification,
      malignancyScore: run.malignancyScore,
      decisionThreshold: run.decisionThreshold,
      ttaScores: run.ttaScores,
      modelDecision: run.modelDecision,
      segmentationModelId: run.segmentationModelId,
      segmentationWeightsSha256: run.segmentationWeightsSha256,
      hasMask: run.maskPath !== null,
      hasOverlay: Boolean(run.overlayPath),
      hasTrace: Boolean(run.tracePath),
      hasSlice: Boolean(run.slicePath),
      maskAreaPx: run.maskAreaPx,
      maskAreaRatio: run.maskAreaRatio,
      nucleiFractions: run.nucleiFractions,
      tileCount: run.tileCount,
      segmentationSkippedReason: run.segmentationSkippedReason,
      clinicianImpression: run.clinicianImpression,
      errorCode: run.errorCode,
      durationMs: run.durationMs,
      requestedById: run.requestedById,
      decisionStatus: run.decisionStatus,
      decisionLabel: run.decisionLabel,
      decisionLabels: getDecisionLabels(run.decisionLabels),
      decisionReason: run.decisionReason,
      decidedById: run.decidedById,
      decidedByName: run.decidedBy ? deciderName(run.decidedBy) : null,
      decidedAt: run.decidedAt,
      reportNumber: run.report?.reportNumber ?? null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }
}
