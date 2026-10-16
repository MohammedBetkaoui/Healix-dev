import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiAnalysisRunStatus,
  AiRunDecision,
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
import {
  AI_SERVICE_TIMEOUT_MS,
  AiServiceClient,
  AiServiceError,
  type AiServiceFailure,
  INPUT_REJECTIONS,
  type NucleiFractions,
} from './ai-service.client';
import {
  type AiPipeline,
  CreateAiAnalysisRunDto,
  NUCLEI_MAGNIFICATION,
} from './dto/create-ai-analysis-run.dto';
import {
  CORRECTION_LABELS,
  DecideAiAnalysisRunDto,
} from './dto/decide-ai-analysis-run.dto';

// The inference service decodes PNG and JPEG only (no DICOM).
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

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
  if (pipeline === 'brain') {
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

type FinishData = Partial<
  Omit<AiAnalysisRun, 'predictions' | 'ttaScores' | 'nucleiFractions'>
> & {
  errorCode?: RunErrorCode;
  predictions?: { label: string; probability: number }[];
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
  ) {}

  async create(
    user: AuthenticatedUserPayload,
    patientId: string,
    dto: CreateAiAnalysisRunDto,
  ) {
    // The request itself first: nothing is read for a malformed one.
    const magnification = checkMagnification(dto.pipeline, dto.magnification);

    await this.patientsService.getPatientInScope(user, patientId);
    await this.patientsService.assertDiagnosticAiConsentSigned(patientId);

    // (id, patientId): a document of another patient answers 404.
    const document = await this.prisma.patientDocument.findFirst({
      where: { id: dto.sourceDocumentId, patientId },
    });

    if (!document) {
      throw new NotFoundException('Document introuvable.');
    }

    if (!SUPPORTED_IMAGE_TYPES.has(document.mimeType)) {
      throw new UnprocessableEntityException({
        code: 'AI_UNSUPPORTED_DOCUMENT',
        message: 'Seules les images PNG ou JPEG peuvent être analysées.',
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

    // The chain and the magnification, never a result.
    await this.patientAuditService.log(
      user,
      'AI_ANALYSIS_RUN_CREATED',
      run.id,
      {
        magnification,
        patientId,
        pipeline: dto.pipeline,
        sourceDocumentId: document.id,
      },
    );

    const file = {
      image,
      mimeType: document.mimeType,
      name: document.originalName,
    };
    switch (dto.pipeline) {
      case 'pathology-breast':
        return this.runBreast(user, run, file, magnification as number);
      case 'pathology-nuclei':
        return this.runNuclei(user, run, file);
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
    const { patientId } = run;

    let maskPath: string | null = null;
    let overlayPath: string;
    try {
      ({ localPath: maskPath } = await this.fileStorageService.storeAiMask({
        patientId,
        png: result.labelMapPng,
        runId: run.id,
      }));
      ({ localPath: overlayPath } =
        await this.fileStorageService.storeAiOverlay({
          patientId,
          png: result.overlayPng,
          runId: run.id,
        }));
    } catch {
      // No half-stored result: the label map goes with its overlay.
      if (maskPath) await this.fileStorageService.deleteLocalFile(maskPath);
      await this.finish(user, run.id, {
        errorCode: 'MASK_STORAGE_FAILED',
        status: AiAnalysisRunStatus.FAILED,
      });
      throw this.toHttpError('MASK_STORAGE_FAILED', run.id);
    }

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

  // The service call; a failure is stored (REJECTED_INPUT when the image is
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
      throw this.toHttpError(code, runId);
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
  // and accepted, no label) or rejected, never corrected.
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

    const isNuclei = run.pipeline === 'pathology-nuclei';
    const modelLabel = getModelLabel(run);

    if (!isNuclei && !modelLabel) {
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

    if (isNuclei && dto.status === AiRunDecision.CORRECTED) {
      throw new BadRequestException({
        code: 'AI_CORRECTION_NOT_APPLICABLE',
        message:
          'Une carte de segmentation des noyaux se valide ou se rejette ; elle ne se corrige pas.',
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
    const reason = dto.reason ? sanitizeTextInput(dto.reason) : '';

    // Conditional write: of two concurrent submissions, only one lands.
    const { count } = await this.prisma.aiAnalysisRun.updateMany({
      data: {
        decidedAt: new Date(),
        decidedById: user.sub,
        decisionLabel,
        decisionReason: reason || null,
        decisionStatus: dto.status,
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

    // Agreement with the model only, never the reason's text. A nuclei map
    // has no label to agree with.
    await this.patientAuditService.log(
      user,
      'AI_ANALYSIS_RUN_DECIDED',
      run.id,
      {
        agreesWithModel:
          dto.status === AiRunDecision.REJECTED || isNuclei
            ? null
            : decisionLabel === modelLabel,
        decisionLabel,
        modelLabel,
        status: dto.status,
      },
    );

    return this.findOne(user, patientId, runId);
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

    return run;
  }

  // Every failure carries the runId: the result page shows its state.
  private toHttpError(code: RunErrorCode, runId: string): HttpException {
    const body = (status: string, message: string) => ({
      code: status,
      message,
      reason: code,
      runId,
    });

    switch (code) {
      case 'INVALID_IMAGE':
      case 'IMAGE_TOO_LARGE':
      case 'IMAGE_TOO_SMALL':
      case 'IMAGE_DIMENSIONS_TOO_LARGE':
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
      case 'SERVICE_ERROR':
        return new BadGatewayException(
          body(
            'AI_SERVICE_ERROR',
            "Le service d'analyse a renvoyé une réponse invalide.",
          ),
        );
    }
  }

  // maskPath and overlayPath stay server-side; the client gets hasMask,
  // hasOverlay and their routes.
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
      magnification: run.magnification,
      malignancyScore: run.malignancyScore,
      decisionThreshold: run.decisionThreshold,
      ttaScores: run.ttaScores,
      modelDecision: run.modelDecision,
      segmentationModelId: run.segmentationModelId,
      segmentationWeightsSha256: run.segmentationWeightsSha256,
      hasMask: run.maskPath !== null,
      hasOverlay: Boolean(run.overlayPath),
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
