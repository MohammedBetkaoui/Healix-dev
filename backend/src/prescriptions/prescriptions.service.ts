import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
  PatientAdministrativeStatus,
  PatientDocumentType,
  PrescriptionRegulatoryCategory,
  PrescriptionStatus,
  PrescriptionType,
  Prisma,
  SyncChangeOperation,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { createSha256Checksum } from '../common/utils/checksum.util';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { NotificationProducerService } from '../notifications/notification-producer.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { storageReferenceOf } from '../storage/storage-keys';
import { CancelPrescriptionDto } from './dto/cancel-prescription.dto';
import { CreatePrescriptionItemDto } from './dto/create-prescription-item.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { ListPrescriptionsQueryDto } from './dto/list-prescriptions-query.dto';
import { MedicationSearchQueryDto } from './dto/medication-search-query.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import {
  type PrescriptionDetail,
  prescriptionDetailInclude,
  toPrescriptionResponse,
} from './mappers/prescription-response.mapper';
import {
  type PrescriberIdentity,
  PrescriptionAuthorizationService,
} from './prescription-authorization.service';
import { prescriptionBadRequest,
  prescriptionConflict,
  prescriptionForbidden,
  prescriptionNotFound } from './prescription-errors';
import { PrescriptionNumberService } from './prescription-number.service';
import { PrescriptionPdfService } from './prescription-pdf.service';
import { PrescriptionRegulatoryService } from './prescription-regulatory.service';
import { PrescriptionSafetyService } from './prescription-safety.service';
import { PrescriptionStorageService } from './prescription-storage.service';
import {
  recordPrescriptionSyncChange,
  recordPrescriptionTombstone,
} from '../sync/prescription-sync-change';

type PreparedItem = {
  medicationId: string | null;
  dci: string;
  brandName: string | null;
  strength: string;
  pharmaceuticalForm: CreatePrescriptionItemDto['pharmaceuticalForm'];
  route: CreatePrescriptionItemDto['route'];
  manufacturer: string | null;
  regulatoryCategory: PrescriptionRegulatoryCategory;
  dosePerIntake: string;
  frequency: string;
  intakeMoment: string | null;
  durationDays: number | null;
  quantity: string;
  patientInstructions: string | null;
  indication: string | null;
  asNeeded: boolean;
  renewalAllowed: boolean;
  substitutionAllowed: boolean;
};

// Widest structural input the draft item rules accept: both the web
// CreatePrescriptionItemDto and the offline sync payload DTO satisfy it,
// with the `| null` tri-state on optional fields (absent and null sanitize
// identically through cleanOptional).
export type DraftItemInput = {
  medicationId?: string | null;
  dci: string;
  brandName?: string | null;
  strength: string;
  pharmaceuticalForm: CreatePrescriptionItemDto['pharmaceuticalForm'];
  route: CreatePrescriptionItemDto['route'];
  manufacturer?: string | null;
  regulatoryCategory: PrescriptionRegulatoryCategory;
  dosePerIntake: string;
  frequency: string;
  intakeMoment?: string | null;
  durationDays?: number | null;
  quantity: string;
  patientInstructions?: string | null;
  indication?: string | null;
  asNeeded?: boolean;
  renewalAllowed?: boolean;
  substitutionAllowed?: boolean;
};

class ConcurrentValidationError extends Error {}

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly authorization: PrescriptionAuthorizationService,
    private readonly safety: PrescriptionSafetyService,
    private readonly regulatory: PrescriptionRegulatoryService,
    private readonly numbers: PrescriptionNumberService,
    private readonly pdf: PrescriptionPdfService,
    private readonly storage: PrescriptionStorageService,
    private readonly audit: AuditLogsService,
    @Optional()
    private readonly notifications?: NotificationProducerService,
  ) {}

  capabilities(user: AuthenticatedUserPayload) {
    return this.authorization.capabilities(user.role);
  }

  async list(user: AuthenticatedUserPayload, query: ListPrescriptionsQueryDto) {
    this.authorization.assertPermission(user, 'VIEW');
    const workspace = await this.authorization.resolveWorkspace(user);
    const where = this.buildListWhere(workspace.workspaceId, query);
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({
        where,
        orderBy: [{ prescribedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
        select: {
          id: true,
          number: true,
          prescribedAt: true,
          validUntil: true,
          status: true,
          type: true,
          validatedAt: true,
          canceledAt: true,
          printedAt: true,
          printCount: true,
          patient: {
            select: {
              id: true,
              firstName: true,
              firstNameAr: true,
              lastName: true,
              lastNameAr: true,
              hospitalRecordNumber: true,
            },
          },
          prescriber: {
            select: { id: true, user: { select: { fullName: true } } },
          },
          items: {
            orderBy: { position: 'asc' },
            take: 3,
            select: { dci: true, brandName: true },
          },
          _count: { select: { items: true } },
          document: { select: { id: true } },
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        number: row.number,
        prescribedAt: row.prescribedAt,
        validUntil: row.validUntil,
        status: row.status,
        effectiveStatus:
          row.status === PrescriptionStatus.VALIDATED &&
          row.validUntil &&
          row.validUntil.getTime() < Date.now()
            ? 'EXPIRED'
            : row.status,
        type: row.type,
        patient: row.patient,
        prescriber: {
          id: row.prescriber.id,
          fullName: row.prescriber.user.fullName,
        },
        medications: row.items,
        itemCount: row._count.items,
        validatedAt: row.validatedAt,
        canceledAt: row.canceledAt,
        printedAt: row.printedAt,
        printCount: row.printCount,
        documentAvailable: Boolean(row.document),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async stats(user: AuthenticatedUserPayload) {
    this.authorization.assertPermission(user, 'VIEW');
    const { workspaceId } = await this.authorization.resolveWorkspace(user);
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const renewLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [month, drafts, renewSoon, canceled, alerts] = await Promise.all([
      this.prisma.prescription.count({
        where: { workspaceId, prescribedAt: { gte: monthStart } },
      }),
      this.prisma.prescription.count({
        where: { workspaceId, status: PrescriptionStatus.DRAFT },
      }),
      this.prisma.prescription.count({
        where: {
          workspaceId,
          status: PrescriptionStatus.VALIDATED,
          validUntil: { gte: now, lte: renewLimit },
        },
      }),
      this.prisma.prescription.count({
        where: {
          workspaceId,
          status: PrescriptionStatus.CANCELED,
          canceledAt: { gte: monthStart },
        },
      }),
      this.prisma.prescription.count({
        where: {
          workspaceId,
          items: {
            some: {
              regulatoryCategory: {
                not: PrescriptionRegulatoryCategory.STANDARD,
              },
            },
          },
        },
      }),
    ]);
    return { month, drafts, renewSoon, canceled, alerts };
  }

  async findOne(user: AuthenticatedUserPayload, id: string) {
    this.authorization.assertPermission(user, 'VIEW');
    return toPrescriptionResponse(await this.getInScope(user, id));
  }

  async create(user: AuthenticatedUserPayload, dto: CreatePrescriptionDto) {
    const { workspace, identity } = await this.authorization.resolvePrescriber(
      user,
      'CREATE',
    );
    const patient = await this.assertPatientAvailable(user, dto.patientId);
    if (patient.workspaceId !== workspace.workspaceId)
      throw prescriptionNotFound();
    await this.assertEncounter(
      dto.encounterId,
      patient.id,
      identity.doctorProfileId,
    );
    const items = await this.prepareItems(dto.items);
    const type = this.regulatory.requiredType(
      dto.type,
      items.map((item) => item.regulatoryCategory),
    );
    const created = await this.prisma.$transaction(async (transaction) => {
      const prescription = await transaction.prescription.create({
        data: {
          workspaceId: workspace.workspaceId,
          patientId: patient.id,
          prescriberDoctorProfileId: identity.doctorProfileId,
          encounterId: dto.encounterId,
          createdById: user.sub,
          status: PrescriptionStatus.DRAFT,
          type,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          regulatoryData: dto.regulatory
            ? asJson(this.cleanRegulatory(dto.regulatory))
            : undefined,
          items: { create: this.itemCreates(items) },
        },
        include: prescriptionDetailInclude,
      });
      await this.log(
        transaction,
        user,
        'PRESCRIPTION_CREATED',
        prescription.id,
        {
          status: PrescriptionStatus.DRAFT,
          itemCount: items.length,
        },
      );
      await recordPrescriptionSyncChange(
        transaction,
        prescription.id,
        SyncChangeOperation.CREATE,
      );
      return prescription;
    });
    return this.withDraftSafety(created);
  }

  async update(
    user: AuthenticatedUserPayload,
    id: string,
    dto: UpdatePrescriptionDto,
  ) {
    const { identity } = await this.authorization.resolvePrescriber(
      user,
      'EDIT',
    );
    const existing = await this.getInScope(user, id);
    this.assertOwnedByPrescriber(existing, identity);
    if (existing.status !== PrescriptionStatus.DRAFT) {
      throw prescriptionConflict(
        'PRESCRIPTION_NOT_EDITABLE',
        'Seul un brouillon peut être modifié.',
      );
    }
    await this.assertEncounter(
      dto.encounterId,
      existing.patientId,
      identity.doctorProfileId,
    );
    const items = dto.items ? await this.prepareItems(dto.items) : null;
    const categories = items
      ? items.map((item) => item.regulatoryCategory)
      : existing.items.map((item) => item.regulatoryCategory);
    const type = this.regulatory.requiredType(
      dto.type ?? existing.type,
      categories,
    );
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (items) {
        await transaction.prescriptionItem.deleteMany({
          where: { prescriptionId: id },
        });
      }
      const prescription = await transaction.prescription.update({
        where: { id },
        data: {
          encounterId: dto.encounterId,
          validUntil:
            dto.validUntil === undefined
              ? undefined
              : dto.validUntil === null
                ? null
                : new Date(dto.validUntil),
          type,
          regulatoryData: dto.regulatory
            ? asJson(this.cleanRegulatory(dto.regulatory))
            : undefined,
          items: items ? { create: this.itemCreates(items) } : undefined,
          syncVersion: { increment: 1 },
        },
        include: prescriptionDetailInclude,
      });
      await this.log(transaction, user, 'PRESCRIPTION_UPDATED', id, {
        status: prescription.status,
        itemCount: prescription.items.length,
      });
      await recordPrescriptionSyncChange(
        transaction,
        id,
        SyncChangeOperation.UPDATE,
      );
      return prescription;
    });
    return this.withDraftSafety(updated);
  }

  async submit(user: AuthenticatedUserPayload, id: string) {
    const { identity } = await this.authorization.resolvePrescriber(
      user,
      'EDIT',
    );
    const existing = await this.getInScope(user, id);
    this.assertOwnedByPrescriber(existing, identity);
    if (existing.status !== PrescriptionStatus.DRAFT) {
      throw prescriptionConflict(
        'PRESCRIPTION_NOT_EDITABLE',
        'Seul un brouillon peut être soumis à validation.',
      );
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.prescription.update({
        where: { id },
        data: {
          status: PrescriptionStatus.PENDING_VALIDATION,
          syncVersion: { increment: 1 },
        },
      });
      await this.log(transaction, user, 'PRESCRIPTION_SUBMITTED', id, {
        status: PrescriptionStatus.PENDING_VALIDATION,
        itemCount: existing.items.length,
      });
      await recordPrescriptionSyncChange(
        transaction,
        id,
        SyncChangeOperation.UPDATE,
      );
      return transaction.prescription.findUniqueOrThrow({
        where: { id },
        include: prescriptionDetailInclude,
      });
    });
    return toPrescriptionResponse(updated);
  }

  async validate(user: AuthenticatedUserPayload, id: string) {
    const { workspace, identity } = await this.authorization.resolvePrescriber(
      user,
      'SIGN',
    );
    const initial = await this.getInScope(user, id);
    this.assertOwnedByPrescriber(initial, identity);
    if (initial.status === PrescriptionStatus.VALIDATED) {
      return toPrescriptionResponse(initial);
    }
    if (initial.status === PrescriptionStatus.CANCELED) {
      throw prescriptionConflict(
        'PRESCRIPTION_CANCELED',
        'Cette ordonnance est annulée.',
      );
    }
    let uncommittedStorageKey: string | null = null;
    try {
      const validated = await this.prisma.$transaction(
        async (transaction) => {
          const prescription = await transaction.prescription.findFirst({
            where: { id, workspaceId: workspace.workspaceId },
            include: prescriptionDetailInclude,
          });
          if (!prescription) throw prescriptionNotFound();
          if (prescription.status === PrescriptionStatus.VALIDATED)
            return prescription;
          if (
            prescription.status !== PrescriptionStatus.DRAFT &&
            prescription.status !== PrescriptionStatus.PENDING_VALIDATION
          ) {
            throw prescriptionConflict(
              'PRESCRIPTION_CANCELED',
              'Cette ordonnance ne peut pas être validée.',
            );
          }
          this.assertOwnedByPrescriber(prescription, identity);
          if (!prescription.items.length) {
            throw prescriptionBadRequest(
              'PRESCRIPTION_EMPTY',
              "L'ordonnance doit contenir au moins un médicament.",
            );
          }
          if (
            prescription.items.some(
              (item) =>
                !item.dci.trim() ||
                !item.strength.trim() ||
                !item.dosePerIntake.trim() ||
                !item.frequency.trim() ||
                !item.quantity.trim() ||
                (item.durationDays !== null && item.durationDays <= 0),
            )
          ) {
            throw prescriptionBadRequest(
              'PRESCRIPTION_ITEM_INVALID',
              'Chaque médicament doit avoir une DCI, un dosage, une posologie, une fréquence, une quantité et une durée valide.',
            );
          }
          const currentPatient = await transaction.patient.findFirst({
            where: {
              id: prescription.patientId,
              workspaceId: workspace.workspaceId,
              administrativeStatus: PatientAdministrativeStatus.ACTIVE,
            },
          });
          if (!currentPatient) throw prescriptionNotFound();
          await this.assertEncounter(
            prescription.encounterId,
            prescription.patientId,
            identity.doctorProfileId,
            transaction,
          );
          const safetySnapshot = this.safety.evaluate(
            prescription.items,
            currentPatient.medicalSummary,
          );
          const regulatorySnapshot = this.regulatory.finalize({
            requestedType: prescription.type,
            categories: prescription.items.map(
              (item) => item.regulatoryCategory,
            ),
            regulatoryData: prescription.regulatoryData,
            prescriberRegistrationNumber: identity.registrationNumber as string,
          });
          const number = await this.numbers.next(transaction);
          const patientSnapshot = {
            firstName: currentPatient.firstName,
            firstNameAr: currentPatient.firstNameAr,
            lastName: currentPatient.lastName,
            lastNameAr: currentPatient.lastNameAr,
            birthDate: currentPatient.birthDate.toISOString(),
            gender: currentPatient.gender,
            hospitalRecordNumber: currentPatient.hospitalRecordNumber,
            address: currentPatient.address,
            wilaya: currentPatient.wilaya,
          };
          const prescriberSnapshot = {
            fullName: identity.fullName,
            speciality: identity.speciality,
            registrationNumber: identity.registrationNumber,
            regionalCouncil: identity.regionalCouncil,
            registrationWilaya: identity.registrationWilaya,
            professionalAddress: identity.professionalAddress,
            professionalPhone: identity.professionalPhone,
          };
          const organizationSnapshot = identity.organization;
          const insuranceSnapshot = {
            organization: currentPatient.insurance,
            insuredNumber: currentPatient.insuredNumber,
            sector: currentPatient.sector,
          };
          const clinicalContextSnapshot = {
            medicalSummary: currentPatient.medicalSummary,
            encounter: prescription.encounter
              ? {
                  id: prescription.encounter.id,
                  date: (
                    prescription.encounter.startedAt ??
                    prescription.encounter.createdAt
                  ).toISOString(),
                  reason: prescription.encounter.chiefComplaint,
                }
              : null,
          };
          const contentFingerprint = fingerprint({
            number,
            patient: patientSnapshot,
            prescriber: prescriberSnapshot,
            organization: organizationSnapshot,
            prescribedAt: prescription.prescribedAt,
            type: regulatorySnapshot.category,
            items: prescription.items.map((item) => ({
              position: item.position,
              dci: item.dci,
              brandName: item.brandName,
              strength: item.strength,
              pharmaceuticalForm: item.pharmaceuticalForm,
              route: item.route,
              manufacturer: item.manufacturer,
              regulatoryCategory: item.regulatoryCategory,
              dosePerIntake: item.dosePerIntake,
              frequency: item.frequency,
              intakeMoment: item.intakeMoment,
              durationDays: item.durationDays,
              quantity: item.quantity,
              patientInstructions: item.patientInstructions,
              indication: item.indication,
              asNeeded: item.asNeeded,
              renewalAllowed: item.renewalAllowed,
              substitutionAllowed: item.substitutionAllowed,
            })),
            regulatory: regulatorySnapshot,
          });
          let pdf: Buffer;
          try {
            pdf = await this.pdf.render({
              number,
              prescribedAt: prescription.prescribedAt,
              patient: patientSnapshot,
              prescriber: prescriberSnapshot,
              organization: organizationSnapshot,
              items: prescription.items,
              contentFingerprint,
            });
          } catch {
            throw new InternalServerErrorException({
              code: 'PRESCRIPTION_PDF_RENDER_FAILED',
              message: "Le PDF de l'ordonnance n'a pas pu être généré.",
            });
          }
          const stored = await this.storage.store({
            patientId: prescription.patientId,
            prescriptionId: prescription.id,
            number,
            pdf,
          });
          uncommittedStorageKey = stored.storageKey;
          const now = new Date();
          const won = await transaction.prescription.updateMany({
            where: {
              id: prescription.id,
              status: {
                in: [
                  PrescriptionStatus.DRAFT,
                  PrescriptionStatus.PENDING_VALIDATION,
                ],
              },
            },
            data: {
              number,
              status: PrescriptionStatus.VALIDATED,
              type: regulatorySnapshot.category,
              validatedAt: now,
              validatedById: user.sub,
              patientSnapshot: asJson(patientSnapshot),
              prescriberSnapshot: asJson(prescriberSnapshot),
              organizationSnapshot: asJson(organizationSnapshot),
              insuranceSnapshot: asJson(insuranceSnapshot),
              clinicalContextSnapshot: asJson(clinicalContextSnapshot),
              safetySnapshot: asJson(safetySnapshot),
              regulatorySnapshot: asJson(regulatorySnapshot),
              contentFingerprint,
              syncVersion: { increment: 1 },
            },
          });
          if (won.count !== 1) throw new ConcurrentValidationError();
          await transaction.prescriptionDocument.create({
            data: {
              prescriptionId: prescription.id,
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
          await transaction.patientDocument.create({
            data: {
              patientId: prescription.patientId,
              prescriptionId: prescription.id,
              documentType: PatientDocumentType.PRESCRIPTION,
              originalName: `${number}.pdf`,
              storedName: stored.storedName,
              mimeType: 'application/pdf',
              size: stored.size,
              storageKey: stored.storageKey,
              localPath: null,
              encryptionVersion: stored.encryptionVersion,
              checksum: stored.checksum,
              uploadedById: user.sub,
            },
          });
          await this.log(transaction, user, 'PRESCRIPTION_PDF_GENERATED', id, {
            status: PrescriptionStatus.VALIDATED,
            itemCount: prescription.items.length,
          });
          await this.log(transaction, user, 'PRESCRIPTION_VALIDATED', id, {
            status: PrescriptionStatus.VALIDATED,
            itemCount: prescription.items.length,
          });
          await recordPrescriptionSyncChange(
            transaction,
            id,
            SyncChangeOperation.UPDATE,
          );
          return transaction.prescription.findUniqueOrThrow({
            where: { id },
            include: prescriptionDetailInclude,
          });
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      uncommittedStorageKey = null;
      await this.notifyWorkspaceAdmins(
        workspace.workspaceId,
        validated.id,
        'PRESCRIPTION_VALIDATED',
        validated.number,
      );
      return toPrescriptionResponse(validated);
    } catch (error) {
      if (uncommittedStorageKey) await this.storage.remove(uncommittedStorageKey);
      if (
        error instanceof ConcurrentValidationError ||
        this.isUniqueViolation(error)
      ) {
        const winner = await this.getInScope(user, id);
        if (winner.status === PrescriptionStatus.VALIDATED) {
          return toPrescriptionResponse(winner);
        }
      }
      throw error;
    }
  }

  async cancel(
    user: AuthenticatedUserPayload,
    id: string,
    dto: CancelPrescriptionDto,
  ) {
    const { workspace, identity } = await this.authorization.resolvePrescriber(
      user,
      'CANCEL',
    );
    const existing = await this.getInScope(user, id);
    this.assertOwnedByPrescriber(existing, identity);
    if (existing.status === PrescriptionStatus.CANCELED) {
      return toPrescriptionResponse(existing);
    }
    if (existing.status !== PrescriptionStatus.VALIDATED) {
      throw prescriptionConflict(
        'PRESCRIPTION_NOT_CANCELABLE',
        'Seule une ordonnance validée peut être annulée.',
      );
    }
    const reason = sanitizeTextInput(dto.reason);
    const canceled = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.prescription.updateMany({
        where: { id, status: PrescriptionStatus.VALIDATED },
        data: {
          status: PrescriptionStatus.CANCELED,
          canceledAt: new Date(),
          canceledById: user.sub,
          cancellationReason: reason,
          syncVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw prescriptionConflict(
          'PRESCRIPTION_NOT_CANCELABLE',
          'Cette ordonnance ne peut plus être annulée.',
        );
      }
      await this.log(transaction, user, 'PRESCRIPTION_CANCELED', id, {
        status: PrescriptionStatus.CANCELED,
      });
      await recordPrescriptionSyncChange(
        transaction,
        id,
        SyncChangeOperation.UPDATE,
      );
      return transaction.prescription.findUniqueOrThrow({
        where: { id },
        include: prescriptionDetailInclude,
      });
    });
    await this.notifyWorkspaceAdmins(
      workspace.workspaceId,
      id,
      'PRESCRIPTION_CANCELED',
      canceled.number,
    );
    return toPrescriptionResponse(canceled);
  }

  async renew(user: AuthenticatedUserPayload, id: string) {
    const { identity } = await this.authorization.resolvePrescriber(
      user,
      'CREATE',
    );
    const source = await this.getInScope(user, id);
    this.assertOwnedByPrescriber(source, identity);
    if (
      source.status !== PrescriptionStatus.VALIDATED &&
      source.status !== PrescriptionStatus.CANCELED
    ) {
      throw prescriptionConflict(
        'PRESCRIPTION_NOT_RENEWABLE',
        'Seule une ordonnance finalisée peut être renouvelée.',
      );
    }
    const renewed = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.prescription.create({
        data: {
          workspaceId: source.workspaceId,
          patientId: source.patientId,
          prescriberDoctorProfileId: identity.doctorProfileId,
          encounterId: source.encounterId,
          createdById: user.sub,
          status: PrescriptionStatus.DRAFT,
          type: source.type,
          validUntil: source.validUntil,
          basedOnPrescriptionId: source.id,
          regulatoryData: source.regulatoryData ?? undefined,
          items: {
            create: source.items.map((item) => ({
              position: item.position,
              medicationId: item.medicationId,
              dci: item.dci,
              brandName: item.brandName,
              strength: item.strength,
              pharmaceuticalForm: item.pharmaceuticalForm,
              route: item.route,
              manufacturer: item.manufacturer,
              regulatoryCategory: item.regulatoryCategory,
              dosePerIntake: item.dosePerIntake,
              frequency: item.frequency,
              intakeMoment: item.intakeMoment,
              durationDays: item.durationDays,
              quantity: item.quantity,
              patientInstructions: item.patientInstructions,
              indication: item.indication,
              asNeeded: item.asNeeded,
              renewalAllowed: item.renewalAllowed,
              substitutionAllowed: item.substitutionAllowed,
            })),
          },
        },
        include: prescriptionDetailInclude,
      });
      await this.log(transaction, user, 'PRESCRIPTION_RENEWED', created.id, {
        sourcePrescriptionId: source.id,
        status: PrescriptionStatus.DRAFT,
        itemCount: source.items.length,
      });
      await recordPrescriptionSyncChange(
        transaction,
        created.id,
        SyncChangeOperation.CREATE,
      );
      return created;
    });
    return this.withDraftSafety(renewed);
  }

  async remove(user: AuthenticatedUserPayload, id: string) {
    const { identity } = await this.authorization.resolvePrescriber(
      user,
      'EDIT',
    );
    const existing = await this.getInScope(user, id);
    this.assertOwnedByPrescriber(existing, identity);
    if (existing.status !== PrescriptionStatus.DRAFT) {
      throw prescriptionConflict(
        'PRESCRIPTION_NOT_EDITABLE',
        'Seul un brouillon peut être supprimé.',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      // Tombstone identity is captured before the row disappears: the change
      // feed keeps just enough of it for devices to unlock or conflict.
      const tombstone = await transaction.prescription.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          workspaceId: true,
          patientId: true,
          number: true,
          status: true,
          syncVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const deleted = await transaction.prescription.deleteMany({
        where: { id, status: PrescriptionStatus.DRAFT },
      });
      if (deleted.count !== 1) {
        throw prescriptionConflict(
          'PRESCRIPTION_NOT_EDITABLE',
          'Ce brouillon ne peut plus être supprimé.',
        );
      }
      await this.log(transaction, user, 'PRESCRIPTION_DRAFT_DELETED', id, {
        status: PrescriptionStatus.DRAFT,
      });
      await recordPrescriptionTombstone(transaction, tombstone);
    });
    return { deleted: true };
  }

  async markPrinted(user: AuthenticatedUserPayload, id: string) {
    this.authorization.assertPermission(user, 'PRINT');
    const existing = await this.getInScope(user, id);
    if (
      existing.status !== PrescriptionStatus.VALIDATED &&
      existing.status !== PrescriptionStatus.CANCELED
    ) {
      throw prescriptionConflict(
        'PRESCRIPTION_DOCUMENT_NOT_AVAILABLE',
        "Le document final de cette ordonnance n'est pas disponible.",
      );
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.prescription.update({
        where: { id },
        data: { printCount: { increment: 1 }, printedAt: new Date() },
      });
      await this.log(transaction, user, 'PRESCRIPTION_PRINTED', id, {
        status: existing.status,
      });
      return transaction.prescription.findUniqueOrThrow({
        where: { id },
        include: prescriptionDetailInclude,
      });
    });
    return toPrescriptionResponse(updated);
  }

  async getPdf(user: AuthenticatedUserPayload, id: string) {
    this.authorization.assertPermission(user, 'PRINT');
    const prescription = await this.getInScope(user, id);
    if (
      prescription.status !== PrescriptionStatus.VALIDATED &&
      prescription.status !== PrescriptionStatus.CANCELED
    ) {
      throw prescriptionConflict(
        'PRESCRIPTION_DOCUMENT_NOT_AVAILABLE',
        "Le document final de cette ordonnance n'est pas disponible.",
      );
    }
    const document = await this.prisma.prescriptionDocument.findUnique({
      where: { prescriptionId: id },
    });
    if (!document) {
      throw prescriptionConflict(
        'PRESCRIPTION_DOCUMENT_NOT_AVAILABLE',
        "Le document final de cette ordonnance n'est pas disponible.",
      );
    }
    const recalculatedFingerprint = fingerprint({
      number: prescription.number,
      patient: prescription.patientSnapshot,
      prescriber: prescription.prescriberSnapshot,
      organization: prescription.organizationSnapshot,
      prescribedAt: prescription.prescribedAt,
      type: prescription.type,
      items: prescription.items.map((item) => ({
        position: item.position,
        dci: item.dci,
        brandName: item.brandName,
        strength: item.strength,
        pharmaceuticalForm: item.pharmaceuticalForm,
        route: item.route,
        manufacturer: item.manufacturer,
        regulatoryCategory: item.regulatoryCategory,
        dosePerIntake: item.dosePerIntake,
        frequency: item.frequency,
        intakeMoment: item.intakeMoment,
        durationDays: item.durationDays,
        quantity: item.quantity,
        patientInstructions: item.patientInstructions,
        indication: item.indication,
        asNeeded: item.asNeeded,
        renewalAllowed: item.renewalAllowed,
        substitutionAllowed: item.substitutionAllowed,
      })),
      regulatory: prescription.regulatorySnapshot,
    });
    if (
      !prescription.contentFingerprint ||
      prescription.contentFingerprint !== document.contentFingerprint ||
      prescription.contentFingerprint !== recalculatedFingerprint
    ) {
      throw new InternalServerErrorException({
        code: 'PRESCRIPTION_CONTENT_INTEGRITY_FAILED',
        message:
          "L'intégrité logique de l'ordonnance ne peut pas être confirmée.",
      });
    }
    // A row without any reference has no file behind it.
    const documentReference = storageReferenceOf(document);

    if (!documentReference) {
      throw new NotFoundException('Document introuvable.');
    }

    const pdf = await this.storage.read(documentReference);
    if (createSha256Checksum(pdf) !== document.checksum) {
      throw new InternalServerErrorException({
        code: 'PRESCRIPTION_DOCUMENT_INTEGRITY_FAILED',
        message: "L'intégrité du document archivé ne peut pas être confirmée.",
      });
    }
    await this.audit.createAuditLog({
      userId: user.sub,
      action: 'PRESCRIPTION_DOCUMENT_VIEWED',
      entityType: 'PRESCRIPTION',
      entityId: id,
      metadata: { status: prescription.status },
    });
    return {
      fileName: `${prescription.number ?? 'ordonnance'}.pdf`,
      pdf,
    };
  }

  async history(user: AuthenticatedUserPayload, id: string) {
    this.authorization.assertPermission(user, 'VIEW');
    await this.getInScope(user, id);
    const entries = await this.prisma.auditLog.findMany({
      where: { entityType: 'PRESCRIPTION', entityId: id },
      include: { user: { select: { fullName: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorName: entry.user?.fullName ?? null,
      createdAt: entry.createdAt,
    }));
  }

  async patientContext(user: AuthenticatedUserPayload, patientId: string) {
    this.authorization.assertPermission(user, 'VIEW');
    const patient = await this.patients.getPatientInScope(user, patientId);
    const encounters = await this.prisma.patientConsultation.findMany({
      where: { patientId },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        startedAt: true,
        createdAt: true,
        chiefComplaint: true,
        doctorProfileId: true,
        doctorProfile: { select: { user: { select: { fullName: true } } } },
      },
    });
    return {
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        firstNameAr: patient.firstNameAr,
        lastName: patient.lastName,
        lastNameAr: patient.lastNameAr,
        birthDate: patient.birthDate,
        gender: patient.gender,
        hospitalRecordNumber: patient.hospitalRecordNumber,
        insurance: patient.insurance,
        maskedInsuredNumber: this.mask(patient.insuredNumber),
        medicalSummary: patient.medicalSummary,
      },
      encounters: encounters.map((encounter) => ({
        id: encounter.id,
        date: encounter.startedAt ?? encounter.createdAt,
        practitionerId: encounter.doctorProfileId,
        practitionerName: encounter.doctorProfile.user.fullName,
        label: encounter.chiefComplaint ?? '',
      })),
    };
  }

  async medications(
    user: AuthenticatedUserPayload,
    query: MedicationSearchQueryDto,
  ) {
    this.authorization.assertPermission(user, 'VIEW');
    await this.authorization.resolveWorkspace(user);
    const q = query.q ? sanitizeTextInput(query.q) : '';
    return this.prisma.medicationReference.findMany({
      where: {
        active: true,
        ...(q
          ? {
              OR: [
                { dci: { contains: q } },
                { brandName: { contains: q } },
                { manufacturer: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ dci: 'asc' }, { brandName: 'asc' }],
      take: query.limit,
      select: {
        id: true,
        dci: true,
        brandName: true,
        strength: true,
        pharmaceuticalForm: true,
        route: true,
        manufacturer: true,
        regulatoryCategory: true,
        reimbursable: true,
        requiresPriorApproval: true,
        source: true,
      },
    });
  }

  async prescriberContext(user: AuthenticatedUserPayload) {
    const { identity } = await this.authorization.resolvePrescriber(
      user,
      'CREATE',
    );
    return identity;
  }

  // Shared rule book for the offline sync vertical (backend/src/sync): it
  // re-runs the exact draft invariants of create()/update() without touching
  // any row, inside the caller's transaction — authoritative medication
  // values from the catalog (the device cache is never trusted), encounter
  // identity match, regulatory type escalation and regulatory data cleaning.
  // Domain violations come back as { ok: false } instead of throwing so the
  // sync engine can persist a durable REJECTED result per operation.
  async prepareSyncDraft(
    transaction: Prisma.TransactionClient,
    input: {
      patientId: string;
      doctorProfileId: string;
      encounterId?: string | null;
      type?: PrescriptionType;
      items?: DraftItemInput[];
      existingCategories?: PrescriptionRegulatoryCategory[];
      regulatory?: {
        acknowledgement: boolean;
        carnetReference?: string;
        note?: string;
      };
    },
  ): Promise<
    | {
        ok: true;
        prepared: PreparedItem[] | null;
        effectiveType: PrescriptionType;
        regulatoryData: Prisma.InputJsonValue | undefined;
      }
    | { ok: false; code: string; message: string }
  > {
    try {
      const prepared = input.items
        ? await this.prepareItems(input.items, transaction)
        : null;
      const categories = prepared
        ? prepared.map((item) => item.regulatoryCategory)
        : (input.existingCategories ?? []);
      const effectiveType = this.regulatory.requiredType(
        input.type,
        categories,
      );
      if (typeof input.encounterId === 'string') {
        await this.assertEncounter(
          input.encounterId,
          input.patientId,
          input.doctorProfileId,
          transaction,
        );
      }
      const regulatoryData = input.regulatory
        ? asJson(this.cleanRegulatory(input.regulatory))
        : undefined;
      return { ok: true, prepared, effectiveType, regulatoryData };
    } catch (error) {
      const response = (error as { response?: { code?: string; message?: string } })
        .response;
      return {
        ok: false,
        code: response?.code ?? 'PRESCRIPTION_ITEM_INVALID',
        message:
          response?.message
            ??
            "Le brouillon d'ordonnance ne satisfait pas les règles serveur.",
      };
    }
  }

  private async getInScope(user: AuthenticatedUserPayload, id: string) {
    const { workspaceId } = await this.authorization.resolveWorkspace(user);
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, workspaceId },
      include: prescriptionDetailInclude,
    });
    if (!prescription) throw prescriptionNotFound();
    return prescription;
  }

  private async assertPatientAvailable(
    user: AuthenticatedUserPayload,
    id: string,
  ) {
    const patient = await this.patients.getPatientInScope(user, id);
    if (patient.administrativeStatus !== PatientAdministrativeStatus.ACTIVE) {
      throw prescriptionForbidden(
        'PATIENT_OUT_OF_SCOPE',
        'Ce patient ne peut pas recevoir une nouvelle ordonnance.',
      );
    }
    return patient;
  }

  private async assertEncounter(
    encounterId: string | null | undefined,
    patientId: string,
    doctorProfileId: string,
    transaction: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (encounterId === undefined || encounterId === null) return;
    const encounter = await transaction.patientConsultation.findFirst({
      where: {
        id: encounterId,
        patientId,
        doctorProfileId,
      },
      select: { id: true },
    });
    if (!encounter) {
      throw prescriptionBadRequest(
        'ENCOUNTER_MISMATCH',
        'La consultation ne correspond pas au patient et au prescripteur.',
      );
    }
  }

  // Public: items are prepared with authoritative catalog values inside the
  // caller's transaction; identical behavior for the web API and the offline
  // sync vertical.
  async prepareItems(
    dtos: readonly DraftItemInput[],
    transaction: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const medicationIds = [
      ...new Set(
        dtos
          .map((item) => item.medicationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const medications = medicationIds.length
      ? await transaction.medicationReference.findMany({
          where: { id: { in: medicationIds }, active: true },
        })
      : [];
    const byId = new Map(
      medications.map((medication) => [medication.id, medication]),
    );
    return dtos.map<PreparedItem>((dto) => {
      const medication = dto.medicationId ? byId.get(dto.medicationId) : null;
      if (dto.medicationId && !medication) {
        throw prescriptionBadRequest(
          'MEDICATION_NOT_FOUND',
          'Un médicament sélectionné est introuvable ou inactif.',
        );
      }
      return {
        medicationId: medication?.id ?? null,
        dci: sanitizeTextInput(medication?.dci ?? dto.dci),
        brandName: this.cleanOptional(medication?.brandName ?? dto.brandName),
        strength: sanitizeTextInput(medication?.strength ?? dto.strength),
        pharmaceuticalForm:
          medication?.pharmaceuticalForm ?? dto.pharmaceuticalForm,
        route: medication?.route ?? dto.route,
        manufacturer: this.cleanOptional(
          medication?.manufacturer ?? dto.manufacturer,
        ),
        regulatoryCategory:
          medication?.regulatoryCategory ?? dto.regulatoryCategory,
        dosePerIntake: sanitizeTextInput(dto.dosePerIntake),
        frequency: sanitizeTextInput(dto.frequency),
        intakeMoment: this.cleanOptional(dto.intakeMoment),
        durationDays: dto.durationDays ?? null,
        quantity: sanitizeTextInput(dto.quantity),
        patientInstructions: this.cleanOptional(dto.patientInstructions),
        indication: this.cleanOptional(dto.indication),
        asNeeded: dto.asNeeded ?? false,
        renewalAllowed: dto.renewalAllowed ?? false,
        substitutionAllowed: dto.substitutionAllowed ?? true,
      };
    });
  }

  // Public: shared with the offline sync vertical (1-based positions).
  itemCreates(items: PreparedItem[]) {
    return items.map((item, position) => ({ ...item, position: position + 1 }));
  }

  private withDraftSafety(prescription: PrescriptionDetail) {
    const mapped = toPrescriptionResponse(prescription);
    const evaluation = this.safety.evaluate(
      prescription.items,
      prescription.patient.medicalSummary,
    );
    return {
      ...mapped,
      alerts: evaluation.alerts,
      safetyEvaluation: evaluation,
    };
  }

  private assertOwnedByPrescriber(
    prescription: { prescriberDoctorProfileId: string },
    identity: PrescriberIdentity,
  ) {
    if (prescription.prescriberDoctorProfileId !== identity.doctorProfileId) {
      throw prescriptionForbidden(
        'PRESCRIBER_REQUIRED',
        "Seul le prescripteur de l'ordonnance peut effectuer cette action.",
      );
    }
  }

  private buildListWhere(
    workspaceId: string,
    query: ListPrescriptionsQueryDto,
  ) {
    const where: Prisma.PrescriptionWhereInput = { workspaceId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.patientId) where.patientId = query.patientId;
    if (query.prescriberId)
      where.prescriberDoctorProfileId = query.prescriberId;
    if (query.medicationId)
      where.items = { some: { medicationId: query.medicationId } };
    if (query.from || query.to) {
      where.prescribedAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }
    if (query.query) {
      const search = sanitizeTextInput(query.query);
      where.OR = [
        { number: { contains: search } },
        { patient: { firstName: { contains: search } } },
        { patient: { firstNameAr: { contains: search } } },
        { patient: { lastName: { contains: search } } },
        { patient: { lastNameAr: { contains: search } } },
        { patient: { hospitalRecordNumber: { contains: search } } },
        { prescriber: { user: { fullName: { contains: search } } } },
        { items: { some: { dci: { contains: search } } } },
        { items: { some: { brandName: { contains: search } } } },
      ];
    }
    return where;
  }

  private log(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUserPayload,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.audit.createAuditLog(
      {
        userId: user.sub,
        action,
        entityType: 'PRESCRIPTION',
        entityId,
        metadata,
      },
      transaction,
    );
  }

  private async notifyWorkspaceAdmins(
    workspaceId: string,
    prescriptionId: string,
    type: 'PRESCRIPTION_VALIDATED' | 'PRESCRIPTION_CANCELED',
    number: string | null,
  ) {
    const notifications = this.notifications;
    if (!notifications) return;
    try {
      const memberships = await this.prisma.workspaceMembership.findMany({
        where: {
          workspaceId,
          status: WorkspaceMembershipStatus.ACTIVE,
          role: {
            in: [WorkspaceMembershipRole.OWNER, WorkspaceMembershipRole.ADMIN],
          },
        },
        select: { userId: true },
      });
      await Promise.all(
        memberships.map(({ userId }) =>
          notifications.create({
            userId,
            workspaceId,
            category: NotificationCategory.PRESCRIPTION,
            type,
            severity:
              type === 'PRESCRIPTION_CANCELED'
                ? NotificationSeverity.WARNING
                : NotificationSeverity.SUCCESS,
            resourceType: NotificationResourceType.PRESCRIPTION,
            resourceId: prescriptionId,
            data: { prescriptionId, ...(number ? { number } : {}) },
            dedupeKey: `${type.toLowerCase()}:${prescriptionId}:${userId}`,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Prescription notification ${type} could not be produced.`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private cleanRegulatory(value: {
    acknowledgement: boolean;
    carnetReference?: string;
    note?: string;
  }) {
    return {
      acknowledgement: value.acknowledgement,
      carnetReference: this.cleanOptional(value.carnetReference),
      note: this.cleanOptional(value.note),
    };
  }

  private cleanOptional(value: string | null | undefined) {
    if (value === undefined || value === null) return null;
    const cleaned = sanitizeTextInput(value);
    return cleaned || null;
  }

  private mask(value: string | null) {
    return value
      ? `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
      : null;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
