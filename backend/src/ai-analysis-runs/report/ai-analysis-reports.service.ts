import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiAnalysisRunStatus,
  AiRunDecision,
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
  Prisma,
  type AiAnalysisReport,
  UserRole,
} from '@prisma/client';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { createSha256Checksum } from '../../common/utils/checksum.util';
import { isPhysicianRole } from '../../common/utils/physician-name';
import { PatientFileStorageService } from '../../patients/documents/patient-file-storage.service';
import { PatientAuditService } from '../../patients/patient-audit.service';
import { PatientsService } from '../../patients/patients.service';
import { buildAiClinicalReport } from '../../reports/ai-clinical-report';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationProducerService } from '../../notifications/notification-producer.service';
import {
  getDecisionLabels,
  getModelLabels,
  MAP_PIPELINES,
} from '../ai-analysis-runs.service';
import {
  CARDIO_SEG_STRUCTURES,
  ECG_CLASSES,
  type EcgClass,
} from '../ai-service.client';
import { colourLabelMap } from '../volumetry/label-overlay';
import {
  readVolumetry,
  type VolumetryImagePhase,
  VOLUMETRY_IMAGE_PHASES,
  volumetryImageName,
  effectiveState,
} from '../volumetry/volumetry';
import { AiReportRenderer } from './ai-report-renderer';
import {
  type EvaluationReport,
  parseEvaluationReport,
} from './ai-report-rules';
import {
  buildReportDocument,
  type ReportInput,
  type ReportPerson,
  type ReportStructure,
  type ReportVolumeFigure,
  type ReportVolumetry,
} from './ai-report-template';
import { CardioEvaluationService } from './cardio-evaluation';
import { CardioSegEvaluationService } from './cardio-seg-evaluation';
import { CardioVolumeEvaluationService } from './cardio-volume-evaluation';
import { readImageSize } from './image-size';
import {
  type BreakhisEvaluation,
  findPathologyEvaluation,
  type PannukeEvaluation,
} from './pathology-evaluation';

const TIME_ZONE = 'Africa/Algiers';
const FONT_DIRECTORY = resolve(process.cwd(), 'assets', 'fonts', 'inter');
// Numbers taken by other reports in the meantime: try the next ones.
const MAX_NUMBER_ATTEMPTS = 5;

const personSelect = {
  id: true,
  fullName: true,
  role: true,
  doctorProfile: { select: { speciality: true } },
} as const;

const establishmentSelect = {
  address: true,
  name: true,
  phone: true,
  professionalEmail: true,
  type: true,
  wilaya: true,
} as const;

const practiceSelect = {
  professionalAddress: true,
  speciality: true,
  wilaya: true,
  user: { select: { fullName: true } },
} as const;

// Only what the report may print: never the national identity number nor
// the phone of the patient (they are not even read).
const runForReport = {
  decidedBy: { select: personSelect },
  patient: {
    select: {
      birthDate: true,
      doctorProfile: { select: practiceSelect },
      establishment: { select: establishmentSelect },
      firstName: true,
      firstNameAr: true,
      gender: true,
      hospitalRecordNumber: true,
      id: true,
      lastName: true,
      lastNameAr: true,
      workspaceId: true,
      workspace: {
        select: {
          establishment: { select: establishmentSelect },
          ownerDoctorProfile: { select: practiceSelect },
          type: true,
        },
      },
    },
  },
  requestedBy: { select: personSelect },
  sourceDocument: {
    select: {
      checksum: true,
      createdAt: true,
      dicomSeries: true,
      dicomStudyId: true,
      instanceNumber: true,
      localPath: true,
      mimeType: true,
      originalName: true,
      seriesNumber: true,
      sopInstanceUid: true,
    },
  },
} satisfies Prisma.AiAnalysisRunInclude;

type RunForReport = Prisma.AiAnalysisRunGetPayload<{
  include: typeof runForReport;
}>;

export type ReportUnavailableReason =
  | 'RUN_NOT_SUCCEEDED'
  | 'NOT_DECIDED'
  | 'REJECTED';

const UNAVAILABLE_MESSAGES: Record<ReportUnavailableReason, string> = {
  NOT_DECIDED:
    "Validez ou corrigez d'abord le résultat : le compte rendu n'existe qu'après la décision du médecin.",
  REJECTED: "Cette analyse a été rejetée : elle n'a pas de compte rendu.",
  RUN_NOT_SUCCEEDED: "Le compte rendu n'existe que pour une analyse réussie.",
};

/** null when the run has a report: SUCCEEDED and validated or corrected. */
export function getReportUnavailableReason(run: {
  status: AiAnalysisRunStatus;
  decisionStatus: AiRunDecision | null;
}): ReportUnavailableReason | null {
  if (run.status !== AiAnalysisRunStatus.SUCCEEDED) return 'RUN_NOT_SUCCEEDED';
  if (run.decisionStatus === null) return 'NOT_DECIDED';
  if (run.decisionStatus === AiRunDecision.REJECTED) return 'REJECTED';
  return null;
}

/** Year of the numbering, in Algeria's time. */
export function reportYear(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
  }).format(at);
}

/** CR-IA-<year>-<NNNNNN>: the one after the last number of that year. */
export function nextReportNumber(year: string, last: string | null): string {
  const prefix = `CR-IA-${year}-`;
  const previous = last?.startsWith(prefix)
    ? Number(last.slice(prefix.length))
    : 0;
  return `${prefix}${String(previous + 1).padStart(6, '0')}`;
}

function toPerson(user: RunForReport['requestedBy']): ReportPerson {
  const role = isPhysicianRole(user.role)
    ? 'physician'
    : user.role === UserRole.ESTABLISHMENT_ADMIN
      ? 'establishmentAdmin'
      : 'other';
  return {
    fullName: user.fullName,
    role,
    speciality:
      role === 'physician' ? (user.doctorProfile?.speciality ?? null) : null,
  };
}

function toStructure(patient: RunForReport['patient']): ReportStructure {
  const { workspace } = patient;
  // The workspace is the tenant; the legacy owner fields when it is missing.
  const establishment = workspace
    ? workspace.type === 'ESTABLISHMENT'
      ? workspace.establishment
      : null
    : patient.establishment;
  const practice = workspace
    ? workspace.type === 'PRIVATE_PRACTICE'
      ? workspace.ownerDoctorProfile
      : null
    : patient.doctorProfile;

  if (establishment) {
    return {
      address: establishment.address,
      email: establishment.professionalEmail,
      kind: 'establishment',
      name: establishment.name,
      phone: establishment.phone,
      type: establishment.type,
      wilaya: establishment.wilaya,
    };
  }
  if (practice) {
    return {
      address: practice.professionalAddress,
      doctorName: practice.user.fullName,
      kind: 'practice',
      speciality: practice.speciality,
      wilaya: practice.wilaya,
    };
  }
  return { kind: 'unknown' };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

type NucleiFractionsJson = {
  background: number;
  nucleusTypes: Record<string, number | null>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isClassRecord = (value: unknown): value is Record<EcgClass, number> =>
  isRecord(value) &&
  ECG_CLASSES.every((label) => typeof value[label] === 'number');

/** What a cardiac MRI run stored in `predictions`; null for any other shape. */
export function readCardioSegPredictions(run: {
  pipeline: string;
  predictions: unknown;
}): ReportInput['run']['cardioSeg'] {
  const stored = run.predictions;
  if (
    run.pipeline !== 'cardio-seg-mri' ||
    !isRecord(stored) ||
    !isRecord(stored.structures) ||
    typeof stored.noStructureFound !== 'boolean' ||
    typeof stored.configSha256 !== 'string' ||
    (stored.source !== 'image' && stored.source !== 'dicom')
  ) {
    return null;
  }
  const structures = stored.structures;
  const areas = CARDIO_SEG_STRUCTURES.map((name) => structures[name]);
  if (
    !areas.every(
      (area) =>
        isRecord(area) &&
        typeof area.pixels === 'number' &&
        (area.areaMm2 === null || typeof area.areaMm2 === 'number'),
    )
  ) {
    return null;
  }
  const spacing = stored.pixelSpacingMm;
  return {
    configSha256: stored.configSha256,
    noStructureFound: stored.noStructureFound,
    pixelSpacingMm:
      Array.isArray(spacing) &&
      spacing.length === 2 &&
      spacing.every((value) => typeof value === 'number')
        ? [spacing[0], spacing[1]]
        : null,
    source: stored.source,
    structures: Object.fromEntries(
      CARDIO_SEG_STRUCTURES.map((name, index) => [name, areas[index]]),
    ) as NonNullable<ReportInput['run']['cardioSeg']>['structures'],
  };
}

/** The model card of a cine volumetry run, from its `predictions`. */
function readCardioVolumeConfig(run: { predictions: unknown }): string | null {
  const stored = run.predictions;
  return isRecord(stored) && typeof stored.configSha256 === 'string'
    ? stored.configSha256
    : null;
}

/** The series a cine archive was made from (the `dicomSeries` of its document); null otherwise. */
export function readDicomSeries(value: unknown): ReportVolumetry['series'] {
  if (!isRecord(value) || !Number.isInteger(value.instances)) return null;
  return {
    description:
      typeof value.description === 'string' ? value.description : null,
    instances: value.instances as number,
    number: Number.isInteger(value.seriesNumber)
      ? (value.seriesNumber as number)
      : null,
  };
}

// Of the slices kept, the basal, the middle and the apical ones are shown: the
// report is not an atlas of the stack.
const FIGURE_SLICES = 3;

export function pickFigureSlices(
  slices: number,
  excluded: readonly number[],
): number[] {
  const kept = Array.from({ length: slices }, (_, index) => index).filter(
    (index) => !excluded.includes(index),
  );
  if (kept.length <= FIGURE_SLICES) return kept;
  return [
    ...new Set(
      Array.from({ length: FIGURE_SLICES }, (_, rank) =>
        Math.round((rank * (kept.length - 1)) / (FIGURE_SLICES - 1)),
      ),
    ),
  ].map((position) => kept[position]);
}

/** What a cardiology run stored in `predictions`; null for any other shape. */
export function readEcgPredictions(run: {
  pipeline: string;
  predictions: unknown;
}): ReportInput['run']['ecg'] {
  const positive = getModelLabels(run);
  const stored = run.predictions;
  if (
    !positive ||
    !isRecord(stored) ||
    !isClassRecord(stored.probabilities) ||
    !isClassRecord(stored.thresholds) ||
    typeof stored.windows !== 'number' ||
    typeof stored.inputSamplingRate !== 'number' ||
    typeof stored.durationSeconds !== 'number' ||
    typeof stored.configSha256 !== 'string'
  ) {
    return null;
  }
  return {
    configSha256: stored.configSha256,
    durationSeconds: stored.durationSeconds,
    inputSamplingRate: stored.inputSamplingRate,
    positive,
    probabilities: stored.probabilities,
    thresholds: stored.thresholds,
    windows: stored.windows,
  };
}

/** Lead II of a stored trace (JSON of the run); null when unreadable. */
export function readLeadII(
  data: Buffer,
): { samplingRate: number; leadII: number[] } | null {
  try {
    const trace = JSON.parse(data.toString('utf8')) as unknown;
    if (!isRecord(trace) || !isRecord(trace.leads)) return null;
    const leadII = trace.leads.II;
    if (
      typeof trace.samplingRate !== 'number' ||
      trace.samplingRate <= 0 ||
      !Array.isArray(leadII) ||
      !leadII.every((value) => typeof value === 'number')
    ) {
      return null;
    }
    return { leadII, samplingRate: trace.samplingRate };
  } catch {
    return null;
  }
}

function isNucleiFractions(value: unknown): value is NucleiFractionsJson {
  if (typeof value !== 'object' || value === null) return false;
  const fractions = value as Record<string, unknown>;
  const types = fractions.nucleusTypes;
  return (
    typeof fractions.background === 'number' &&
    typeof types === 'object' &&
    types !== null &&
    Object.values(types).every(
      (share) => share === null || typeof share === 'number',
    )
  );
}

export type ServedReport = {
  fileName: string;
  pdf: Buffer;
  reportNumber: string;
};

// The official PDF report of a decided run. Generated on the first request,
// stored with its SHA-256 and number, then always served as stored: a frozen
// document, never regenerated.
@Injectable()
export class AiAnalysisReportsService {
  private readonly logger = new Logger(AiAnalysisReportsService.name);
  private readonly evaluationReportPath: string;
  private readonly pathologyEvaluationDir: string;
  private readonly cardioEvaluation: CardioEvaluationService;
  private readonly cardioSegEvaluation: CardioSegEvaluationService;
  private readonly cardioVolumeEvaluation: CardioVolumeEvaluationService;
  private fonts: Promise<ReportInput['fonts']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly fileStorageService: PatientFileStorageService,
    private readonly patientAuditService: PatientAuditService,
    private readonly renderer: AiReportRenderer,
    configService: ConfigService,
    @Optional()
    private readonly notificationProducer?: NotificationProducerService,
  ) {
    this.evaluationReportPath = resolve(
      process.cwd(),
      configService.get<string>('AI_EVALUATION_REPORT_PATH') ??
        '../ai-service/evaluation/brain-latest.json',
    );
    this.pathologyEvaluationDir = resolve(
      process.cwd(),
      configService.get<string>('AI_PATHOLOGY_EVALUATION_DIR') ??
        '../ai-service/evaluation',
    );
    this.cardioEvaluation = new CardioEvaluationService(configService);
    this.cardioSegEvaluation = new CardioSegEvaluationService(configService);
    this.cardioVolumeEvaluation = new CardioVolumeEvaluationService(
      configService,
    );
  }

  async getReport(
    user: AuthenticatedUserPayload,
    patientId: string,
    runId: string,
  ): Promise<ServedReport> {
    await this.patientsService.getPatientInScope(user, patientId);

    // (id, patientId): a run of another patient answers 404.
    const run = await this.prisma.aiAnalysisRun.findFirst({
      include: runForReport,
      where: { id: runId, patientId },
    });
    if (!run) {
      throw new NotFoundException('Analyse introuvable.');
    }

    const reason = getReportUnavailableReason(run);
    if (reason) {
      throw new ConflictException({
        code: 'AI_REPORT_NOT_AVAILABLE',
        message: UNAVAILABLE_MESSAGES[reason],
        reason,
      });
    }

    const existing = await this.prisma.aiAnalysisReport.findUnique({
      where: { runId: run.id },
    });
    return existing ? this.serve(user, existing) : this.generate(user, run);
  }

  private async generate(
    user: AuthenticatedUserPayload,
    run: RunForReport,
  ): Promise<ServedReport> {
    for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
      const editedAt = new Date();
      const year = reportYear(editedAt);
      const last = await this.prisma.aiAnalysisReport.findFirst({
        orderBy: { reportNumber: 'desc' },
        select: { reportNumber: true },
        where: { reportNumber: { startsWith: `CR-IA-${year}-` } },
      });
      const reportNumber = nextReportNumber(year, last?.reportNumber ?? null);

      // Nothing is stored unless the PDF was produced.
      let pdf: Buffer;
      let contentSha256: string;
      try {
        const document = buildReportDocument(
          await this.buildInput(run, reportNumber, editedAt),
        );
        contentSha256 = document.contentSha256;
        pdf = await this.renderer.render(document);
      } catch (error) {
        this.logger.error(
          `Report of run ${run.id} could not be rendered.`,
          error instanceof Error ? error.message : 'Unknown error',
        );
        throw new InternalServerErrorException({
          code: 'AI_REPORT_RENDER_FAILED',
          message: "Le compte rendu n'a pas pu être généré.",
        });
      }

      const sha256 = createSha256Checksum(pdf);
      const { localPath } = await this.fileStorageService.storeAiReport({
        patientId: run.patientId,
        pdf,
        reportNumber,
      });

      try {
        // The report and its row in the clinical reports center are stored
        // together: the center never misses a report, nor lists one that
        // does not exist.
        const report = await this.prisma.$transaction(async (transaction) => {
          const created = await transaction.aiAnalysisReport.create({
            data: {
              contentSha256,
              filePath: localPath,
              generatedById: user.sub,
              reportNumber,
              runId: run.id,
              sha256,
              sizeBytes: pdf.length,
            },
          });
          const clinicalReport = buildAiClinicalReport({
            aiReport: created,
            run,
          });
          if (clinicalReport) {
            await transaction.clinicalReport.create({ data: clinicalReport });
          }
          return created;
        });
        await this.patientAuditService.log(
          user,
          'AI_ANALYSIS_REPORT_GENERATED',
          report.id,
          { reportNumber, runId: run.id, sha256 },
        );
        await this.notificationProducer?.create({
          userId: run.requestedBy.id,
          workspaceId: run.patient.workspaceId,
          category: NotificationCategory.REPORT,
          type: 'AI_REPORT_AVAILABLE',
          severity: NotificationSeverity.SUCCESS,
          resourceType: NotificationResourceType.AI_REPORT,
          resourceId: run.id,
          data: {
            analysisRunId: run.id,
            reportId: report.id,
            pipeline: run.pipeline,
          },
          dedupeKey: `ai-report-available:${report.id}:${run.requestedBy.id}`,
        });
        return { fileName: `${reportNumber}.pdf`, pdf, reportNumber };
      } catch (error) {
        await this.fileStorageService.deleteLocalFile(localPath);
        if (!isUniqueViolation(error)) throw error;

        // Another request stored a report first: for this run (the one to
        // serve), or under this number (then take the next one).
        const winner = await this.prisma.aiAnalysisReport.findUnique({
          where: { runId: run.id },
        });
        if (winner) return this.serve(user, winner);
      }
    }

    throw new ConflictException({
      code: 'AI_REPORT_NUMBER_UNAVAILABLE',
      message: "Aucun numéro de compte rendu n'a pu être attribué. Réessayez.",
    });
  }

  // As stored, checked against its recorded SHA-256.
  private async serve(
    user: AuthenticatedUserPayload,
    report: AiAnalysisReport,
  ): Promise<ServedReport> {
    const pdf = await this.fileStorageService.readStoredFile(report.filePath);
    if (createSha256Checksum(pdf) !== report.sha256) {
      this.logger.error(
        `Stored report ${report.reportNumber} does not match its SHA-256.`,
      );
      throw new InternalServerErrorException({
        code: 'AI_REPORT_INTEGRITY_FAILED',
        message: 'Le compte rendu archivé ne correspond plus à son empreinte.',
      });
    }

    await this.patientAuditService.log(
      user,
      'AI_ANALYSIS_REPORT_DOWNLOADED',
      report.id,
      { reportNumber: report.reportNumber, runId: report.runId },
    );
    return {
      fileName: `${report.reportNumber}.pdf`,
      pdf,
      reportNumber: report.reportNumber,
    };
  }

  private async buildInput(
    run: RunForReport,
    reportNumber: string,
    editedAt: Date,
  ): Promise<ReportInput> {
    const decisionStatus = run.decisionStatus;
    const cardio = run.pipeline === 'cardio-ecg';
    const mri = run.pipeline === 'cardio-seg-mri';
    const volume = run.pipeline === 'cardio-volume-mri';
    // A validated map (nuclei, cardiac MRI) has no label: it was reviewed and
    // accepted. An ECG keeps a set of classes, possibly empty, instead of one;
    // a cine volumetry keeps its measures.
    const decisionLabels = cardio
      ? getDecisionLabels(run.decisionLabels)
      : null;
    const labelRequired =
      !MAP_PIPELINES.has(run.pipeline) && !cardio && !volume;
    if (
      !run.decidedBy ||
      !run.decidedAt ||
      (labelRequired && !run.decisionLabel) ||
      (cardio && !decisionLabels) ||
      (decisionStatus !== AiRunDecision.VALIDATED &&
        decisionStatus !== AiRunDecision.CORRECTED)
    ) {
      throw new Error('The run has no validated or corrected decision.');
    }

    // A cine archive is not an image (and may be large): its checksum is the
    // document's, and its images are the ones stored with the volumetry.
    const image = volume
      ? Buffer.alloc(0)
      : await this.fileStorageService.readStoredFile(
          run.sourceDocument.localPath,
        );
    const slice = run.slicePath
      ? await this.fileStorageService.readStoredFile(run.slicePath)
      : null;
    // A DICOM slice has no image size of its own: the analysed slice's.
    const size = readImageSize(slice ?? image);
    const mask =
      run.maskPath && !volume
        ? await this.fileStorageService.readStoredFile(run.maskPath)
        : null;
    const overlay = run.overlayPath
      ? await this.fileStorageService.readStoredFile(run.overlayPath)
      : null;
    const traceFile = run.tracePath
      ? await this.fileStorageService.readStoredFile(run.tracePath)
      : null;
    const leadII = traceFile ? readLeadII(traceFile) : null;

    return {
      breakhisEvaluation:
        run.pipeline === 'pathology-breast'
          ? await this.findPathologyEvaluation(
              'breakhis',
              run.classificationWeightsSha256,
            )
          : null,
      cardioEvaluation: cardio
        ? await this.cardioEvaluation.find(run.classificationWeightsSha256)
        : null,
      cardioSegEvaluation: mri
        ? await this.cardioSegEvaluation.find(run.segmentationWeightsSha256)
        : null,
      decidedBy: toPerson(run.decidedBy),
      ecgTrace:
        traceFile && leadII
          ? { ...leadII, sha256: createSha256Checksum(traceFile) }
          : null,
      editedAt,
      evaluation:
        run.pipeline === 'brain' ? await this.readEvaluationReport() : null,
      fonts: await this.loadFonts(),
      mask: mask ? { data: mask, sha256: createSha256Checksum(mask) } : null,
      slice: slice
        ? { data: slice, sha256: createSha256Checksum(slice) }
        : null,
      volumetry: volume ? await this.buildVolumetry(run) : null,
      overlay: overlay
        ? { data: overlay, sha256: createSha256Checksum(overlay) }
        : null,
      pannukeEvaluation:
        run.pipeline === 'pathology-nuclei'
          ? await this.findPathologyEvaluation(
              'pannuke',
              run.segmentationWeightsSha256,
            )
          : null,
      patient: {
        birthDate: run.patient.birthDate,
        firstName: run.patient.firstName,
        gender: run.patient.gender,
        hospitalRecordNumber: run.patient.hospitalRecordNumber,
        id: run.patient.id,
        lastName: run.patient.lastName,
      },
      reportNumber,
      requestedBy: toPerson(run.requestedBy),
      run: {
        classificationModelId: run.classificationModelId,
        classificationWeightsSha256: run.classificationWeightsSha256,
        clinicianImpression: run.clinicianImpression,
        createdAt: run.createdAt,
        decidedAt: run.decidedAt,
        decisionLabel: run.decisionLabel,
        decisionLabels,
        decisionReason: run.decisionReason,
        decisionStatus,
        decisionThreshold: run.decisionThreshold,
        durationMs: run.durationMs,
        cardioSeg: mri ? readCardioSegPredictions(run) : null,
        ecg: cardio ? readEcgPredictions(run) : null,
        id: run.id,
        magnification: run.magnification,
        malignancyScore: run.malignancyScore,
        maskAreaPx: run.maskAreaPx,
        maskAreaRatio: run.maskAreaRatio,
        modelDecision: run.modelDecision,
        nucleiFractions: isNucleiFractions(run.nucleiFractions)
          ? run.nucleiFractions
          : null,
        pipeline: run.pipeline,
        // The ECG's predictions are an object, read into `ecg`.
        predictions: Array.isArray(run.predictions)
          ? (run.predictions as { label: string; probability: number }[])
          : [],
        segmentationModelId: run.segmentationModelId,
        segmentationSkippedReason: run.segmentationSkippedReason,
        segmentationWeightsSha256: run.segmentationWeightsSha256,
        tileCount: run.tileCount,
        ttaScores:
          Array.isArray(run.ttaScores) &&
          run.ttaScores.every((score) => typeof score === 'number')
            ? run.ttaScores
            : null,
      },
      sourceDocument: {
        checksum: run.sourceDocument.checksum,
        createdAt: run.sourceDocument.createdAt,
        data: image,
        // A document made from a slice of a DICOM study says which one.
        dicomSlice:
          run.sourceDocument.dicomStudyId || run.sourceDocument.sopInstanceUid
            ? {
                instanceNumber: run.sourceDocument.instanceNumber,
                seriesNumber: run.sourceDocument.seriesNumber,
              }
            : null,
        height: size?.height ?? null,
        mimeType: run.sourceDocument.mimeType,
        originalName: run.sourceDocument.originalName,
        width: size?.width ?? null,
      },
      structure: toStructure(run.patient),
    };
  }

  // The measures in force, the model's ED and ES slices (a few, coloured from their
  // class map) and the figures measured on the test patients.
  private async buildVolumetry(
    run: RunForReport,
  ): Promise<ReportVolumetry | null> {
    const volumetry = readVolumetry(run.volumetry);
    if (!volumetry) {
      throw new Error('The run has no volumetry.');
    }

    const figures: ReportVolumeFigure[] = [];
    if (run.maskPath) {
      const folder = run.maskPath;
      const { excludedSlices } = effectiveState(volumetry);
      const slices = pickFigureSlices(volumetry.images.slices, excludedSlices);
      const phases: readonly VolumetryImagePhase[] = VOLUMETRY_IMAGE_PHASES;
      for (const phase of phases) {
        for (const index of slices) {
          const data = await this.fileStorageService.readAiVolumetryImage(
            folder,
            volumetryImageName('slice', phase, index),
          );
          const overlay = colourLabelMap(
            await this.fileStorageService.readAiVolumetryImage(
              folder,
              volumetryImageName('label', phase, index),
            ),
          );
          const size = readImageSize(data);
          figures.push({
            height: size?.height ?? 256,
            image: { data, sha256: createSha256Checksum(data) },
            overlay: { data: overlay, sha256: createSha256Checksum(overlay) },
            phase,
            slice: index,
            width: size?.width ?? 256,
          });
        }
      }
    }

    return {
      configSha256: readCardioVolumeConfig(run),
      evaluation: await this.cardioVolumeEvaluation.find(
        run.segmentationWeightsSha256,
      ),
      figures,
      series: readDicomSeries(run.sourceDocument.dicomSeries),
      volumetry,
    };
  }

  // The pathology evaluation of these weights; none prints no figure.
  private async findPathologyEvaluation(
    part: 'breakhis',
    weightsSha256: string | null,
  ): Promise<BreakhisEvaluation | null>;
  private async findPathologyEvaluation(
    part: 'pannuke',
    weightsSha256: string | null,
  ): Promise<PannukeEvaluation | null>;
  private async findPathologyEvaluation(
    part: 'breakhis' | 'pannuke',
    weightsSha256: string | null,
  ): Promise<BreakhisEvaluation | PannukeEvaluation | null> {
    const evaluation =
      part === 'breakhis'
        ? await findPathologyEvaluation(
            this.pathologyEvaluationDir,
            'breakhis',
            weightsSha256,
          )
        : await findPathologyEvaluation(
            this.pathologyEvaluationDir,
            'pannuke',
            weightsSha256,
          );
    if (!evaluation) {
      this.logger.warn(
        `No ${part} evaluation of weights ${weightsSha256 ?? '(none)'} in ${this.pathologyEvaluationDir}.`,
      );
    }
    return evaluation;
  }

  // A missing or incomplete evaluation report prints no figure.
  private async readEvaluationReport(): Promise<EvaluationReport | null> {
    if (!existsSync(this.evaluationReportPath)) {
      this.logger.warn(`No evaluation report at ${this.evaluationReportPath}.`);
      return null;
    }
    try {
      return parseEvaluationReport(
        JSON.parse(await readFile(this.evaluationReportPath, 'utf8')),
      );
    } catch {
      this.logger.warn(
        `Unreadable evaluation report ${this.evaluationReportPath}.`,
      );
      return null;
    }
  }

  private loadFonts(): Promise<ReportInput['fonts']> {
    this.fonts ??= Promise.all(
      [400, 600, 700].map((weight) =>
        readFile(resolve(FONT_DIRECTORY, `inter-latin-${weight}-normal.woff2`)),
      ),
    ).then(([regular, semibold, bold]) => ({ bold, regular, semibold }));
    // A failed read is retried on the next report.
    this.fonts.catch(() => {
      this.fonts = null;
    });
    return this.fonts;
  }
}
