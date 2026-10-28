import {
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  ClinicalReportCategory,
  ClinicalReportSource,
  ClinicalReportStatus,
  NotificationCategory,
  NotificationSeverity,
  PatientAdministrativeStatus,
  Prisma,
} from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { createSha256Checksum } from '../common/utils/checksum.util';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { NotificationProducerService } from '../notifications/notification-producer.service';
import { PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { PatientFileValidator } from '../patients/documents/patient-file-validator';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { storageReferenceOf } from '../storage/storage-keys';
import { CancelReportDto } from './dto/cancel-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ImportReportDto } from './dto/import-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import {
  type ReportDetail,
  reportDetailInclude,
  reportListInclude,
  toReportDetail,
  toReportListItem,
} from './mappers/report-response.mapper';
import {
  REPORT_SECTIONS,
  sectionTitle,
  sourceForCategory,
} from './report-constants';
import {
  ReportAuthorizationService,
  isPhysicianRole,
} from './report-authorization.service';
import {
  reportBadRequest,
  reportConflict,
  reportForbidden,
  reportNotFound,
} from './report-errors';
import { fingerprint, reportContent } from './report-fingerprint';
import { ReportNumberService } from './report-number.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportStorageService } from './report-storage.service';

const ENTITY_TYPE = 'CLINICAL_REPORT';
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

class ConcurrentFinalizationError extends Error {}

type Section = { id: string; title: string; body: string };

/** Sections of the form: empty ones dropped, in print order, with their title. */
export function normalizeSections(
  input: Array<{ id: string; body: string }> | undefined,
): Section[] {
  const bodies = new Map<string, string>();
  for (const section of input ?? []) {
    const body = sanitizeTextInput(section.body);
    if (body) bodies.set(section.id, body);
  }
  return REPORT_SECTIONS.flatMap((section) => {
    const body = bodies.get(section.id);
    return body
      ? [{ id: section.id, title: sectionTitle(section.id), body }]
      : [];
  });
}

const isCurrentFinal = (report: {
  status: ClinicalReportStatus;
  supersededAt: Date | null;
}) =>
  (report.status === ClinicalReportStatus.FINAL ||
    report.status === ClinicalReportStatus.AMENDED) &&
  report.supersededAt === null;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly authorization: ReportAuthorizationService,
    private readonly numbers: ReportNumberService,
    private readonly pdf: ReportPdfService,
    private readonly storage: ReportStorageService,
    private readonly fileStorage: PatientFileStorageService,
    private readonly fileValidator: PatientFileValidator,
    private readonly audit: AuditLogsService,
    @Optional()
    private readonly notifications?: NotificationProducerService,
  ) {}

  capabilities(user: AuthenticatedUserPayload) {
    return this.authorization.capabilities(user.role);
  }

  // --- Reads -----------------------------------------------------------------

  async list(user: AuthenticatedUserPayload, query: ListReportsQueryDto) {
    const { workspaceId } = await this.authorization.resolveWorkspace(user);
    const where = this.buildListWhere(workspaceId, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.clinicalReport.findMany({
        where,
        orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: reportListInclude,
      }),
      this.prisma.clinicalReport.count({ where }),
    ]);
    return {
      data: rows.map(toReportListItem),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async stats(user: AuthenticatedUserPayload) {
    const { workspaceId } = await this.authorization.resolveWorkspace(user);
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const current = { workspaceId, supersededAt: null };
    const [month, toFinalize, final, amended, aiValidated] = await Promise.all([
      this.prisma.clinicalReport.count({
        where: {
          ...current,
          status: { not: ClinicalReportStatus.CANCELED },
          effectiveAt: { gte: monthStart },
        },
      }),
      this.prisma.clinicalReport.count({
        where: { ...current, status: ClinicalReportStatus.DRAFT },
      }),
      this.prisma.clinicalReport.count({
        where: { ...current, status: ClinicalReportStatus.FINAL },
      }),
      this.prisma.clinicalReport.count({
        where: { ...current, status: ClinicalReportStatus.AMENDED },
      }),
      this.prisma.clinicalReport.count({
        where: {
          ...current,
          status: ClinicalReportStatus.FINAL,
          sourceType: ClinicalReportSource.AI_ANALYSIS,
        },
      }),
    ]);
    return { month, toFinalize, final, amended, aiValidated };
  }

  async patientReports(user: AuthenticatedUserPayload, patientId: string) {
    const { workspaceId } = await this.authorization.resolveWorkspace(user);
    await this.assertPatient(user, patientId, workspaceId);
    const rows = await this.prisma.clinicalReport.findMany({
      where: { workspaceId, patientId, supersededAt: null },
      orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: reportListInclude,
    });
    return rows.map(toReportListItem);
  }

  async findOne(user: AuthenticatedUserPayload, id: string) {
    const report = await this.getInScope(user, id);
    return this.withVersions(report);
  }

  async history(user: AuthenticatedUserPayload, id: string) {
    const report = await this.getInScope(user, id);
    const entries = await this.prisma.auditLog.findMany({
      where: { entityType: ENTITY_TYPE, entityId: id },
      include: { user: { select: { fullName: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const events = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorName: entry.user?.fullName ?? null,
      createdAt: entry.createdAt,
    }));
    // The report of an AI analysis is created by the analysis itself: its
    // two events come from the row, not from the audit trail.
    if (report.aiAnalysisReportId) {
      events.push(
        {
          id: `${id}:decision`,
          action: 'REPORT_AI_DECISION',
          actorName: report.author.fullName,
          createdAt: report.finalizedAt ?? report.createdAt,
        },
        {
          id: `${id}:generated`,
          action: 'REPORT_AI_GENERATED',
          actorName: null,
          createdAt: report.createdAt,
        },
      );
      events.sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
    }
    return events;
  }

  /** The PDF to show: the report's own, the analysis' one, or the imported file. */
  async getPdf(user: AuthenticatedUserPayload, id: string) {
    this.authorization.assertPermission(user, 'DOWNLOAD');
    const { workspaceId } = await this.authorization.resolveWorkspace(user);
    const report = await this.prisma.clinicalReport.findFirst({
      where: { id, workspaceId },
      include: {
        aiAnalysisReport: true,
        document: true,
        patientDocument: true,
      },
    });
    if (!report) throw reportNotFound();
    const unavailable = () =>
      reportConflict(
        'REPORT_DOCUMENT_NOT_AVAILABLE',
        "Le document de ce rapport n'est pas disponible.",
      );
    let file: Buffer;
    let fileName: string;
    let mimeType = 'application/pdf';
    if (report.aiAnalysisReport) {
      const reference = storageReferenceOf(report.aiAnalysisReport);

      if (!reference) throw unavailable();
      file = await this.fileStorage.readStoredFile(reference);
      this.assertChecksum(file, report.aiAnalysisReport.sha256);
      fileName = `${report.aiAnalysisReport.reportNumber}.pdf`;
    } else if (report.patientDocument) {
      const reference = storageReferenceOf(report.patientDocument);

      if (!reference) throw unavailable();
      file = await this.fileStorage.readStoredFile(reference);
      this.assertChecksum(file, report.patientDocument.checksum);
      fileName = report.patientDocument.originalName;
      mimeType = report.patientDocument.mimeType;
    } else if (report.document && report.number) {
      const reference = storageReferenceOf(report.document);

      if (!reference) throw unavailable();
      file = await this.storage.read(reference);
      this.assertChecksum(file, report.document.checksum);
      if (
        !report.contentFingerprint ||
        report.contentFingerprint !== report.document.contentFingerprint
      ) {
        throw new InternalServerErrorException({
          code: 'REPORT_INTEGRITY_FAILED',
          message: "L'intégrité du rapport ne peut pas être confirmée.",
        });
      }
      fileName = `${report.number}.pdf`;
    } else {
      throw unavailable();
    }
    await this.log(this.prisma, user, 'REPORT_DOCUMENT_VIEWED', id, {
      status: report.status,
    });
    return { fileName, mimeType, file };
  }

  // --- Drafts ----------------------------------------------------------------

  async create(user: AuthenticatedUserPayload, dto: CreateReportDto) {
    const { workspaceId } = await this.authorization.resolveWorkspace(
      user,
      'CREATE',
    );
    const patient = await this.assertPatient(user, dto.patientId, workspaceId, {
      mustBeActive: true,
    });
    await this.assertEncounter(dto.encounterId, patient.id);
    const category = dto.category ?? ClinicalReportCategory.CONSULTATION_NOTE;
    const created = await this.prisma.$transaction(async (transaction) => {
      const report = await transaction.clinicalReport.create({
        data: {
          workspaceId,
          patientId: patient.id,
          encounterId: dto.encounterId,
          category,
          sourceType: sourceForCategory(category),
          status: ClinicalReportStatus.DRAFT,
          title: sanitizeTextInput(dto.title),
          conclusion: this.cleanOptional(dto.conclusion),
          sections: asJson(normalizeSections(dto.sections)),
          effectiveAt: dto.effectiveDate
            ? new Date(dto.effectiveDate)
            : new Date(),
          authorId: user.sub,
        },
        select: { id: true },
      });
      await this.log(transaction, user, 'REPORT_CREATED', report.id, {
        category,
      });
      return report;
    });
    return this.findDetail(created.id);
  }

  async update(
    user: AuthenticatedUserPayload,
    id: string,
    dto: UpdateReportDto,
  ) {
    const existing = await this.getDraftForEdit(user, id);
    await this.assertEncounter(dto.encounterId, existing.patientId);
    const category = dto.category;
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.clinicalReport.updateMany({
        where: { id, status: ClinicalReportStatus.DRAFT },
        data: {
          encounterId: dto.encounterId,
          category,
          sourceType: category ? sourceForCategory(category) : undefined,
          title:
            dto.title === undefined ? undefined : sanitizeTextInput(dto.title),
          conclusion:
            dto.conclusion === undefined
              ? undefined
              : this.cleanOptional(dto.conclusion),
          sections: dto.sections
            ? asJson(normalizeSections(dto.sections))
            : undefined,
          effectiveAt: dto.effectiveDate
            ? new Date(dto.effectiveDate)
            : undefined,
        },
      });
      if (result.count !== 1) throw this.notEditable();
      await this.log(transaction, user, 'REPORT_UPDATED', id, {
        status: ClinicalReportStatus.DRAFT,
      });
    });
    return this.findDetail(id);
  }

  async remove(user: AuthenticatedUserPayload, id: string) {
    await this.getDraftForEdit(user, id);
    await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.clinicalReport.deleteMany({
        where: { id, status: ClinicalReportStatus.DRAFT },
      });
      if (deleted.count !== 1) throw this.notEditable();
      await this.log(transaction, user, 'REPORT_DRAFT_DELETED', id, {
        status: ClinicalReportStatus.DRAFT,
      });
    });
    return { deleted: true };
  }

  // --- Finalize / amend / cancel ---------------------------------------------

  async finalize(user: AuthenticatedUserPayload, id: string) {
    const { workspace, identity } = await this.authorization.resolveSigner(
      user,
      'FINALIZE',
    );
    const initial = await this.getInScope(user, id);
    if (
      initial.status === ClinicalReportStatus.FINAL ||
      initial.status === ClinicalReportStatus.AMENDED
    ) {
      return this.withVersions(initial);
    }
    if (initial.status !== ClinicalReportStatus.DRAFT) {
      throw reportConflict(
        'REPORT_NOT_FINALIZABLE',
        'Seul un brouillon peut être finalisé.',
      );
    }
    let uncommittedStorageKey: string | null = null;
    try {
      const finalized = await this.prisma.$transaction(
        async (transaction) => {
          const report = await transaction.clinicalReport.findFirst({
            where: { id, workspaceId: workspace.workspaceId },
            include: { replaces: true },
          });
          if (!report) throw reportNotFound();
          if (report.status !== ClinicalReportStatus.DRAFT) {
            throw new ConcurrentFinalizationError();
          }
          const sections = normalizeSections(
            Array.isArray(report.sections)
              ? (report.sections as Array<{ id: string; body: string }>)
              : [],
          );
          if (
            !report.title.trim() ||
            (!sections.length && !report.conclusion)
          ) {
            throw reportBadRequest(
              'REPORT_EMPTY',
              'Le rapport doit avoir un titre et un contenu (une section ou une conclusion).',
            );
          }
          if (
            report.replaces &&
            !(
              isCurrentFinal(report.replaces) &&
              report.replaces.id === report.replacesId
            )
          ) {
            throw reportConflict(
              'REPORT_NOT_AMENDABLE',
              "La version à remplacer n'est plus la version en cours.",
            );
          }
          const patient = await transaction.patient.findFirst({
            where: {
              id: report.patientId,
              workspaceId: workspace.workspaceId,
              administrativeStatus: PatientAdministrativeStatus.ACTIVE,
            },
          });
          if (!patient) throw reportNotFound();
          await this.assertEncounter(report.encounterId, report.patientId);

          const now = new Date();
          const number = await this.numbers.next(transaction, now);
          const patientSnapshot = {
            firstName: patient.firstName,
            firstNameAr: patient.firstNameAr,
            lastName: patient.lastName,
            lastNameAr: patient.lastNameAr,
            birthDate: patient.birthDate.toISOString().slice(0, 10),
            gender: patient.gender,
            hospitalRecordNumber: patient.hospitalRecordNumber,
          };
          const authorSnapshot = {
            fullName: identity.fullName,
            speciality: identity.speciality,
            registrationNumber: identity.registrationNumber,
            regionalCouncil: identity.regionalCouncil,
            professionalAddress: identity.professionalAddress,
            professionalPhone: identity.professionalPhone,
          };
          const organizationSnapshot = identity.organization;
          const contentFingerprint = fingerprint(
            reportContent({
              number,
              version: report.version,
              replacesNumber: report.replaces?.number ?? null,
              category: report.category,
              title: report.title,
              effectiveAt: report.effectiveAt,
              patient: patientSnapshot,
              author: authorSnapshot,
              organization: organizationSnapshot,
              sections,
              conclusion: report.conclusion,
            }),
          );
          let pdf: Buffer;
          try {
            pdf = await this.pdf.render({
              number,
              version: report.version,
              replacesNumber: report.replaces?.number ?? null,
              title: report.title,
              category: report.category,
              effectiveAt: report.effectiveAt,
              finalizedAt: now,
              patient: patientSnapshot,
              author: authorSnapshot,
              organization: organizationSnapshot,
              sections,
              conclusion: report.conclusion,
              contentFingerprint,
            });
          } catch {
            throw new InternalServerErrorException({
              code: 'REPORT_PDF_RENDER_FAILED',
              message: "Le PDF du rapport n'a pas pu être généré.",
            });
          }
          const stored = await this.storage.store({
            patientId: report.patientId,
            reportId: report.id,
            number,
            pdf,
          });
          uncommittedStorageKey = stored.storageKey;
          const amended = report.replacesId !== null;
          const won = await transaction.clinicalReport.updateMany({
            where: { id, status: ClinicalReportStatus.DRAFT },
            data: {
              number,
              status: amended
                ? ClinicalReportStatus.AMENDED
                : ClinicalReportStatus.FINAL,
              finalizedAt: now,
              finalizedById: user.sub,
              patientSnapshot: asJson(patientSnapshot),
              authorSnapshot: asJson(authorSnapshot),
              organizationSnapshot: asJson(organizationSnapshot),
              sections: asJson(sections),
              contentFingerprint,
            },
          });
          if (won.count !== 1) throw new ConcurrentFinalizationError();
          if (report.replacesId) {
            const superseded = await transaction.clinicalReport.updateMany({
              where: { id: report.replacesId, supersededAt: null },
              data: { supersededAt: now },
            });
            if (superseded.count !== 1) throw new ConcurrentFinalizationError();
            await this.log(
              transaction,
              user,
              'REPORT_SUPERSEDED',
              report.replacesId,
              { replacedBy: id, version: report.version },
            );
          }
          await transaction.clinicalReportDocument.create({
            data: {
              reportId: id,
              storedName: stored.storedName,
              storageKey: stored.storageKey,
              localPath: null,
              encryptionVersion: stored.encryptionVersion,
              size: stored.size,
              checksum: stored.checksum,
              contentFingerprint,
              generatedById: user.sub,
            },
          });
          await this.log(transaction, user, 'REPORT_PDF_GENERATED', id, {
            number,
          });
          await this.log(transaction, user, 'REPORT_FINALIZED', id, {
            number,
            version: report.version,
            amends: report.replacesId,
          });
          return transaction.clinicalReport.findUniqueOrThrow({
            where: { id },
            include: reportDetailInclude,
          });
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      uncommittedStorageKey = null;
      await this.notifyTreatingDoctor(finalized, user);
      return this.withVersions(finalized);
    } catch (error) {
      if (uncommittedStorageKey) await this.storage.remove(uncommittedStorageKey);
      if (
        error instanceof ConcurrentFinalizationError ||
        this.isUniqueViolation(error)
      ) {
        const winner = await this.getInScope(user, id);
        if (winner.status !== ClinicalReportStatus.DRAFT) {
          return this.withVersions(winner);
        }
      }
      throw error;
    }
  }

  /** Starts version n+1 as a draft; the current version stays untouched. */
  async amend(user: AuthenticatedUserPayload, id: string) {
    await this.authorization.resolveSigner(user, 'AMEND');
    const source = await this.getInScope(user, id);
    this.assertNotAi(source);
    if (source.patientDocumentId) {
      throw reportConflict(
        'REPORT_NOT_AMENDABLE',
        'Un document importé ne peut pas être amendé.',
      );
    }
    if (!isCurrentFinal(source)) {
      throw reportConflict(
        'REPORT_NOT_AMENDABLE',
        'Seule la version en cours d’un rapport finalisé peut être amendée.',
      );
    }
    try {
      const draft = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.clinicalReport.create({
          data: {
            workspaceId: source.workspaceId,
            patientId: source.patientId,
            encounterId: source.encounterId,
            category: source.category,
            sourceType: source.sourceType,
            status: ClinicalReportStatus.DRAFT,
            title: source.title,
            conclusion: source.conclusion,
            sections: asJson(source.sections),
            effectiveAt: source.effectiveAt,
            version: source.version + 1,
            replacesId: source.id,
            authorId: user.sub,
          },
          select: { id: true },
        });
        await this.log(
          transaction,
          user,
          'REPORT_AMENDMENT_STARTED',
          created.id,
          {
            replaces: source.id,
            version: source.version + 1,
          },
        );
        return created;
      });
      return this.findDetail(draft.id);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw this.amendmentInProgress();
      }
      throw error;
    }
  }

  async cancel(
    user: AuthenticatedUserPayload,
    id: string,
    dto: CancelReportDto,
  ) {
    await this.authorization.resolveSigner(user, 'CANCEL');
    const existing = await this.getInScope(user, id);
    this.assertNotAi(existing);
    if (existing.status === ClinicalReportStatus.CANCELED) {
      return this.withVersions(existing);
    }
    if (!isCurrentFinal(existing)) {
      throw reportConflict(
        'REPORT_NOT_CANCELABLE',
        'Seule la version en cours d’un rapport finalisé peut être annulée.',
      );
    }
    if (existing.replacedBy) throw this.amendmentInProgress();
    const reason = sanitizeTextInput(dto.reason);
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.clinicalReport.updateMany({
        where: {
          id,
          status: {
            in: [ClinicalReportStatus.FINAL, ClinicalReportStatus.AMENDED],
          },
          supersededAt: null,
        },
        data: {
          status: ClinicalReportStatus.CANCELED,
          canceledAt: new Date(),
          canceledById: user.sub,
          cancellationReason: reason,
        },
      });
      if (result.count !== 1) {
        throw reportConflict(
          'REPORT_NOT_CANCELABLE',
          'Ce rapport ne peut plus être annulé.',
        );
      }
      await this.log(transaction, user, 'REPORT_CANCELED', id, {
        number: existing.number,
      });
    });
    return this.findDetail(id);
  }

  // --- Import ----------------------------------------------------------------

  /** An external document (PDF/JPEG/PNG), final as soon as it is filed. */
  async importDocument(
    user: AuthenticatedUserPayload,
    dto: ImportReportDto,
    file: Express.Multer.File | undefined,
  ) {
    const { workspaceId } = await this.authorization.resolveWorkspace(
      user,
      'CREATE',
    );
    if (!file) {
      throw reportBadRequest(
        'REPORT_IMPORT_FILE_REQUIRED',
        'Le document à importer est obligatoire.',
      );
    }
    const patient = await this.assertPatient(user, dto.patientId, workspaceId, {
      mustBeActive: true,
    });
    await this.assertEncounter(dto.encounterId, patient.id);
    const { extension, mimeType } = this.fileValidator.validate(
      file,
      'MEDICAL_REPORT',
    );
    const [importer, organization] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: {
          fullName: true,
          doctorProfile: { select: { speciality: true } },
        },
      }),
      this.organizationOf(workspaceId),
    ]);
    const stored = await this.fileStorage.storePatientDocument({
      documentType: 'MEDICAL_REPORT',
      extension,
      file,
      patientId: patient.id,
    });
    const category = dto.category ?? ClinicalReportCategory.EXTERNAL_MEDICAL;
    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const now = new Date();
        const document = await transaction.patientDocument.create({
          data: {
            patientId: patient.id,
            documentType: 'MEDICAL_REPORT',
            originalName: stored.originalName,
            storedName: stored.storedName,
            mimeType,
            size: file.size,
            storageKey: stored.storageKey,
            localPath: null,
            encryptionVersion: stored.encryptionVersion,
            checksum: stored.checksum,
            uploadedById: user.sub,
          },
        });
        const number = await this.numbers.next(transaction, now);
        const patientSnapshot = {
          firstName: patient.firstName,
          firstNameAr: patient.firstNameAr,
          lastName: patient.lastName,
          lastNameAr: patient.lastNameAr,
          birthDate: patient.birthDate.toISOString().slice(0, 10),
          gender: patient.gender,
          hospitalRecordNumber: patient.hospitalRecordNumber,
        };
        const authorSnapshot = {
          fullName: importer.fullName,
          speciality: importer.doctorProfile?.speciality ?? null,
          registrationNumber: null,
          regionalCouncil: null,
        };
        const externalSource = {
          author: sanitizeTextInput(dto.externalAuthor),
          specialty: this.cleanOptional(dto.specialty),
          notes: this.cleanOptional(dto.notes),
        };
        const title = sanitizeTextInput(dto.title);
        const effectiveAt = new Date(dto.effectiveDate);
        const report = await transaction.clinicalReport.create({
          data: {
            number,
            workspaceId,
            patientId: patient.id,
            encounterId: dto.encounterId,
            category,
            sourceType: ClinicalReportSource.EXTERNAL_DOCUMENT,
            status: ClinicalReportStatus.FINAL,
            title,
            sections: [],
            effectiveAt,
            authorId: user.sub,
            finalizedAt: now,
            finalizedById: user.sub,
            patientSnapshot: asJson(patientSnapshot),
            authorSnapshot: asJson(authorSnapshot),
            organizationSnapshot: asJson(organization),
            externalSource: asJson(externalSource),
            patientDocumentId: document.id,
            contentFingerprint: fingerprint({
              number,
              category,
              title,
              effectiveAt,
              patient: patientSnapshot,
              externalSource,
              file: stored.checksum,
            }),
          },
          select: { id: true },
        });
        await this.log(transaction, user, 'REPORT_IMPORTED', report.id, {
          number,
          category,
          documentId: document.id,
        });
        return report;
      });
      return this.findDetail(created.id);
    } catch (error) {
      await this.fileStorage.deleteFile(stored.storageKey);
      throw error;
    }
  }

  // --- Internals -------------------------------------------------------------

  private async getInScope(user: AuthenticatedUserPayload, id: string) {
    const { workspaceId } = await this.authorization.resolveWorkspace(user);
    const report = await this.prisma.clinicalReport.findFirst({
      where: { id, workspaceId },
      include: reportDetailInclude,
    });
    // Another workspace's report answers like an unknown one.
    if (!report) throw reportNotFound();
    return report;
  }

  private async findDetail(id: string) {
    const report = await this.prisma.clinicalReport.findUniqueOrThrow({
      where: { id },
      include: reportDetailInclude,
    });
    return this.withVersions(report);
  }

  /** The draft to edit or delete: its author, or a physician of the workspace. */
  private async getDraftForEdit(user: AuthenticatedUserPayload, id: string) {
    this.authorization.assertPermission(user, 'CREATE');
    const report = await this.getInScope(user, id);
    if (report.status !== ClinicalReportStatus.DRAFT) throw this.notEditable();
    if (report.author.id !== user.sub && !isPhysicianRole(user.role)) {
      throw reportForbidden(
        'REPORT_AUTHOR_REQUIRED',
        "Seul l'auteur du brouillon ou un médecin peut le modifier.",
      );
    }
    return report;
  }

  private notEditable() {
    return reportConflict(
      'REPORT_NOT_EDITABLE',
      'Seul un brouillon peut être modifié ou supprimé.',
    );
  }

  private amendmentInProgress() {
    return reportConflict(
      'REPORT_AMENDMENT_IN_PROGRESS',
      'Un amendement de ce rapport est déjà en cours.',
    );
  }

  private assertNotAi(report: { aiAnalysisReportId: string | null }) {
    if (report.aiAnalysisReportId) {
      throw reportConflict(
        'REPORT_AI_IMMUTABLE',
        "Le compte rendu d'une analyse IA ne peut être ni modifié, ni amendé, ni annulé ici.",
      );
    }
  }

  private assertChecksum(file: Buffer, expected: string | null) {
    if (!expected || createSha256Checksum(file) !== expected) {
      throw new InternalServerErrorException({
        code: 'REPORT_INTEGRITY_FAILED',
        message: "L'intégrité du document archivé ne peut pas être confirmée.",
      });
    }
  }

  private async assertPatient(
    user: AuthenticatedUserPayload,
    patientId: string,
    workspaceId: string,
    options: { mustBeActive?: boolean } = {},
  ) {
    const patient = await this.patients.getPatientInScope(user, patientId);
    if (patient.workspaceId !== workspaceId) throw reportNotFound();
    if (
      options.mustBeActive &&
      patient.administrativeStatus !== PatientAdministrativeStatus.ACTIVE
    ) {
      throw reportForbidden(
        'PATIENT_OUT_OF_SCOPE',
        'Ce patient ne peut pas recevoir un nouveau rapport.',
      );
    }
    return patient;
  }

  private async assertEncounter(
    encounterId: string | null | undefined,
    patientId: string,
  ) {
    if (encounterId === undefined || encounterId === null) return;
    const encounter = await this.prisma.patientConsultation.findFirst({
      where: { id: encounterId, patientId },
      select: { id: true },
    });
    if (!encounter) {
      throw reportBadRequest(
        'ENCOUNTER_MISMATCH',
        'La consultation ne correspond pas au patient.',
      );
    }
  }

  private async organizationOf(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        name: true,
        establishment: {
          select: {
            name: true,
            type: true,
            address: true,
            wilaya: true,
            phone: true,
          },
        },
      },
    });
    return workspace.establishment
      ? {
          ...workspace.establishment,
          type: String(workspace.establishment.type),
        }
      : { name: workspace.name };
  }

  private async withVersions(report: ReportDetail) {
    return {
      ...toReportDetail(report),
      versions: await this.versionsOf(report),
    };
  }

  /** Every version of the report, oldest first (the chain through replacesId). */
  private async versionsOf(report: ReportDetail) {
    const select = {
      id: true,
      number: true,
      version: true,
      status: true,
      createdAt: true,
      finalizedAt: true,
      supersededAt: true,
      canceledAt: true,
      replacesId: true,
    } as const;
    type Version = Prisma.ClinicalReportGetPayload<{ select: typeof select }>;
    const chain: Version[] = [report];
    let cursor = report.replacesId;
    while (cursor) {
      const previous: Version | null =
        await this.prisma.clinicalReport.findUnique({
          where: { id: cursor },
          select,
        });
      if (!previous) break;
      chain.unshift(previous);
      cursor = previous.replacesId;
    }
    for (;;) {
      const successor: Version | null =
        await this.prisma.clinicalReport.findFirst({
          where: { replacesId: chain[chain.length - 1].id },
          select,
        });
      if (!successor) break;
      chain.push(successor);
    }
    return chain.map((version) => ({
      id: version.id,
      number: version.number,
      version: version.version,
      status: version.status,
      createdAt: version.createdAt,
      finalizedAt: version.finalizedAt,
      supersededAt: version.supersededAt,
      canceledAt: version.canceledAt,
      isCurrent: version.supersededAt === null,
    }));
  }

  private buildListWhere(workspaceId: string, query: ListReportsQueryDto) {
    const where: Prisma.ClinicalReportWhereInput = { workspaceId };
    if (!query.includeSuperseded) where.supersededAt = null;
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.patientId) where.patientId = query.patientId;
    if (query.authorId) where.authorId = query.authorId;
    if (query.from || query.to) {
      where.effectiveAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }
    if (query.query) {
      const search = sanitizeTextInput(query.query);
      where.OR = [
        { number: { contains: search } },
        { title: { contains: search } },
        { patient: { firstName: { contains: search } } },
        { patient: { firstNameAr: { contains: search } } },
        { patient: { lastName: { contains: search } } },
        { patient: { lastNameAr: { contains: search } } },
        { patient: { hospitalRecordNumber: { contains: search } } },
        { author: { fullName: { contains: search } } },
      ];
    }
    return where;
  }

  private log(
    client: Prisma.TransactionClient | PrismaService,
    user: AuthenticatedUserPayload,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.audit.createAuditLog(
      {
        userId: user.sub,
        action,
        entityType: ENTITY_TYPE,
        entityId,
        metadata,
      },
      client,
    );
  }

  // The patient's doctor learns that a colleague (or the administration) just
  // finalized a report of their patient.
  private async notifyTreatingDoctor(
    report: ReportDetail,
    actor: AuthenticatedUserPayload,
  ) {
    const notifications = this.notifications;
    if (!notifications) return;
    try {
      const patient = await this.prisma.patient.findUnique({
        where: { id: report.patientId },
        select: { doctorProfile: { select: { userId: true } } },
      });
      const userId = patient?.doctorProfile?.userId;
      if (!userId || userId === actor.sub) return;
      await notifications.create({
        userId,
        workspaceId: report.workspaceId,
        category: NotificationCategory.REPORT,
        type: 'REPORT_FINALIZED',
        severity: NotificationSeverity.INFO,
        data: {
          reportId: report.id,
          ...(report.number ? { number: report.number } : {}),
        },
        dedupeKey: `report-finalized:${report.id}:${userId}`,
      });
    } catch (error) {
      this.logger.warn(
        'Report notification REPORT_FINALIZED could not be produced.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private cleanOptional(value: string | null | undefined) {
    if (value === undefined || value === null) return null;
    return sanitizeTextInput(value) || null;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
