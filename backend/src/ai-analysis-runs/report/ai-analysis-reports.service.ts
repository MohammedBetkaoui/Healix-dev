import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiAnalysisRunStatus,
  AiRunDecision,
  Prisma,
  type AiAnalysisReport,
  UserRole,
} from '@prisma/client';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { createSha256Checksum } from '../../common/utils/checksum.util';
import { PatientFileStorageService } from '../../patients/documents/patient-file-storage.service';
import { PatientAuditService } from '../../patients/patient-audit.service';
import { PatientsService } from '../../patients/patients.service';
import { PrismaService } from '../../prisma/prisma.service';
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
} from './ai-report-template';
import { readImageSize } from './image-size';

const TIME_ZONE = 'Africa/Algiers';
const FONT_DIRECTORY = resolve(process.cwd(), 'assets', 'fonts', 'inter');
// Numbers taken by other reports in the meantime: try the next ones.
const MAX_NUMBER_ATTEMPTS = 5;

const personSelect = {
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
      gender: true,
      hospitalRecordNumber: true,
      id: true,
      lastName: true,
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
      localPath: true,
      mimeType: true,
      originalName: true,
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
  const role =
    user.role === UserRole.INDEPENDENT_DOCTOR ||
    user.role === UserRole.AFFILIATED_DOCTOR
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
  private fonts: Promise<ReportInput['fonts']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly fileStorageService: PatientFileStorageService,
    private readonly patientAuditService: PatientAuditService,
    private readonly renderer: AiReportRenderer,
    configService: ConfigService,
  ) {
    this.evaluationReportPath = resolve(
      process.cwd(),
      configService.get<string>('AI_EVALUATION_REPORT_PATH') ??
        '../ai-service/evaluation/brain-latest.json',
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
        const report = await this.prisma.aiAnalysisReport.create({
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
        await this.patientAuditService.log(
          user,
          'AI_ANALYSIS_REPORT_GENERATED',
          report.id,
          { reportNumber, runId: run.id, sha256 },
        );
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
    if (
      !run.decidedBy ||
      !run.decidedAt ||
      !run.decisionLabel ||
      (decisionStatus !== AiRunDecision.VALIDATED &&
        decisionStatus !== AiRunDecision.CORRECTED)
    ) {
      throw new Error('The run has no validated or corrected decision.');
    }

    const image = await this.fileStorageService.readStoredFile(
      run.sourceDocument.localPath,
    );
    const size = readImageSize(image);
    const mask = run.maskPath
      ? await this.fileStorageService.readStoredFile(run.maskPath)
      : null;

    return {
      decidedBy: toPerson(run.decidedBy),
      editedAt,
      evaluation: await this.readEvaluationReport(),
      fonts: await this.loadFonts(),
      mask: mask ? { data: mask, sha256: createSha256Checksum(mask) } : null,
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
        decisionReason: run.decisionReason,
        decisionStatus,
        durationMs: run.durationMs,
        id: run.id,
        maskAreaPx: run.maskAreaPx,
        maskAreaRatio: run.maskAreaRatio,
        predictions: Array.isArray(run.predictions)
          ? (run.predictions as { label: string; probability: number }[])
          : [],
        segmentationModelId: run.segmentationModelId,
        segmentationSkippedReason: run.segmentationSkippedReason,
        segmentationWeightsSha256: run.segmentationWeightsSha256,
      },
      sourceDocument: {
        checksum: run.sourceDocument.checksum,
        createdAt: run.sourceDocument.createdAt,
        data: image,
        height: size?.height ?? null,
        mimeType: run.sourceDocument.mimeType,
        originalName: run.sourceDocument.originalName,
        width: size?.width ?? null,
      },
      structure: toStructure(run.patient),
    };
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
