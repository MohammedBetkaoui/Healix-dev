import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsultationStatus, Prisma, PrescriptionStatus } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultationAuthorizationService } from './consultation-authorization.service';
import { CancelConsultationDto } from './dto/cancel-consultation.dto';
import { CreateConsultationAddendumDto } from './dto/create-consultation-addendum.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { ListConsultationsQueryDto } from './dto/list-consultations-query.dto';
import {
  ConsultationDiagnosisDto,
  ConsultationVitalSignsDto,
  UpdateConsultationDto,
} from './dto/update-consultation.dto';
import {
  consultationDetailInclude,
  consultationListInclude,
  linkedPrescriptionSelect,
  linkedReportSelect,
  toConsultationDetail,
  toConsultationListItem,
} from './mappers/consultation-response.mapper';

const ALGIERS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EDITABLE_STATUSES: ConsultationStatus[] = [
  ConsultationStatus.DRAFT,
  ConsultationStatus.IN_PROGRESS,
];

export function periodStarts(now = new Date()) {
  const local = new Date(now.getTime() + ALGIERS_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const today = Date.UTC(year, month, day) - ALGIERS_OFFSET_MS;
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return {
    today: new Date(today),
    week: new Date(today - sinceMonday * DAY_MS),
    month: new Date(Date.UTC(year, month, 1) - ALGIERS_OFFSET_MS),
  };
}

function cleanNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = sanitizeTextInput(value);
  return cleaned || null;
}

function diagnosisData(diagnosis: ConsultationDiagnosisDto) {
  return {
    label: sanitizeTextInput(diagnosis.label),
    code: cleanNullable(diagnosis.code),
    codeSystem: cleanNullable(diagnosis.codeSystem),
    isPrimary: diagnosis.isPrimary ?? false,
    note: cleanNullable(diagnosis.note),
  };
}

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: ConsultationAuthorizationService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  capabilities(user: AuthenticatedUserPayload) {
    return this.authorization.capabilities(user.role);
  }

  async list(user: AuthenticatedUserPayload, query: ListConsultationsQueryDto) {
    const scope = await this.authorization.resolveWorkspace(user);
    const where = await this.buildListWhere(user, scope.workspaceId, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patientConsultation.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: consultationListInclude,
      }),
      this.prisma.patientConsultation.count({ where }),
    ]);
    return {
      data: rows.map(toConsultationListItem),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async stats(user: AuthenticatedUserPayload) {
    const scope = await this.authorization.resolveWorkspace(user);
    const starts = periodStarts();
    const since = (date: Date): Prisma.PatientConsultationWhereInput => ({
      workspaceId: scope.workspaceId,
      startedAt: { gte: date },
    });
    const [today, week, month, withPrescription] = await Promise.all([
      this.prisma.patientConsultation.count({ where: since(starts.today) }),
      this.prisma.patientConsultation.count({ where: since(starts.week) }),
      this.prisma.patientConsultation.count({ where: since(starts.month) }),
      this.prisma.patientConsultation.count({
        where: { ...since(starts.month), prescriptions: { some: {} } },
      }),
    ]);
    return {
      today,
      week,
      month,
      withPrescription,
      prescriptionShare: month
        ? Math.round((withPrescription / month) * 100)
        : 0,
    };
  }

  async create(user: AuthenticatedUserPayload, dto: CreateConsultationDto) {
    const { workspace, doctorProfileId } =
      await this.authorization.resolvePhysician(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, workspaceId: workspace.workspaceId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: {
          id: dto.appointmentId,
          patientId: patient.id,
          doctorProfileId,
          patient: { workspaceId: workspace.workspaceId },
        },
        select: { id: true },
      });
      if (!appointment) {
        throw new BadRequestException(
          'Ce rendez-vous ne correspond pas au patient et au médecin.',
        );
      }
    }

    const consultation = await this.prisma.$transaction(async (client) => {
      const created = await client.patientConsultation.create({
        data: {
          workspaceId: workspace.workspaceId,
          patientId: patient.id,
          doctorProfileId,
          appointmentId: dto.appointmentId ?? null,
          createdById: user.sub,
          status: ConsultationStatus.DRAFT,
        },
      });
      await this.auditLogs.createAuditLog(
        {
          userId: user.sub,
          action: 'CONSULTATION_CREATED',
          entityType: 'PatientConsultation',
          entityId: created.id,
          metadata: { status: ConsultationStatus.DRAFT },
        },
        client,
      );
      return created;
    });
    return this.findOne(user, consultation.id);
  }

  async update(
    user: AuthenticatedUserPayload,
    id: string,
    dto: UpdateConsultationDto,
  ) {
    const context = await this.getMutableConsultation(user, id);
    if (!EDITABLE_STATUSES.includes(context.consultation.status)) {
      throw new ConflictException(
        'Une consultation finalisée ou annulée ne peut plus être modifiée.',
      );
    }
    await this.prisma.$transaction(async (client) => {
      await client.patientConsultation.update({
        where: { id },
        data: {
          chiefComplaint: cleanNullable(dto.chiefComplaint),
          historyPresentIllness: cleanNullable(dto.historyPresentIllness),
          clinicalExamination: cleanNullable(dto.clinicalExamination),
          assessment: cleanNullable(dto.assessment),
          carePlan: cleanNullable(dto.carePlan),
          followUpPlan: cleanNullable(dto.followUpPlan),
          vitalSigns:
            dto.vitalSigns === undefined || dto.vitalSigns === null
              ? undefined
              : {
                  upsert: {
                    create: this.vitalSignsData(dto.vitalSigns),
                    update: this.vitalSignsData(dto.vitalSigns),
                  },
                },
        },
      });
      if (dto.vitalSigns === null) {
        await client.consultationVitalSigns.deleteMany({
          where: { consultationId: id },
        });
      }
      if (dto.diagnoses !== undefined) {
        await client.consultationDiagnosis.deleteMany({
          where: { consultationId: id },
        });
        if (dto.diagnoses.length) {
          await client.consultationDiagnosis.createMany({
            data: dto.diagnoses.map((diagnosis) => ({
              consultationId: id,
              ...diagnosisData(diagnosis),
            })),
          });
        }
      }
      await this.auditLogs.createAuditLog(
        {
          userId: user.sub,
          action: 'CONSULTATION_UPDATED',
          entityType: 'PatientConsultation',
          entityId: id,
          metadata: { status: context.consultation.status },
        },
        client,
      );
    });
    return this.findOne(user, id);
  }

  async start(user: AuthenticatedUserPayload, id: string) {
    const { consultation } = await this.getMutableConsultation(user, id);
    if (consultation.status === ConsultationStatus.IN_PROGRESS) {
      return this.findOne(user, id);
    }
    if (consultation.status !== ConsultationStatus.DRAFT) {
      throw new ConflictException(
        'Seule une consultation en brouillon peut être démarrée.',
      );
    }
    await this.prisma.$transaction(async (client) => {
      await client.patientConsultation.update({
        where: { id },
        data: { status: ConsultationStatus.IN_PROGRESS, startedAt: new Date() },
      });
      await this.auditLogs.createAuditLog(
        {
          userId: user.sub,
          action: 'CONSULTATION_STARTED',
          entityType: 'PatientConsultation',
          entityId: id,
          metadata: { status: ConsultationStatus.IN_PROGRESS },
        },
        client,
      );
    });
    return this.findOne(user, id);
  }

  async complete(user: AuthenticatedUserPayload, id: string) {
    const { consultation } = await this.getMutableConsultation(user, id);
    if (consultation.status === ConsultationStatus.COMPLETED) {
      return this.findOne(user, id);
    }
    if (!EDITABLE_STATUSES.includes(consultation.status)) {
      throw new ConflictException(
        'Une consultation annulée ne peut pas être finalisée.',
      );
    }
    const hasClinicalContent = Boolean(
      consultation.chiefComplaint?.trim() ||
      consultation.assessment?.trim() ||
      consultation.clinicalExamination?.trim() ||
      consultation._count.diagnoses,
    );
    if (!hasClinicalContent) {
      throw new BadRequestException(
        'Renseignez au minimum un motif ou une évaluation clinique avant la finalisation.',
      );
    }
    const now = new Date();
    await this.prisma.$transaction(async (client) => {
      await client.patientConsultation.update({
        where: { id },
        data: {
          status: ConsultationStatus.COMPLETED,
          startedAt: consultation.startedAt ?? now,
          completedAt: now,
          completedById: user.sub,
        },
      });
      await this.auditLogs.createAuditLog(
        {
          userId: user.sub,
          action: 'CONSULTATION_COMPLETED',
          entityType: 'PatientConsultation',
          entityId: id,
          metadata: { status: ConsultationStatus.COMPLETED },
        },
        client,
      );
    });
    return this.findOne(user, id);
  }

  async cancel(
    user: AuthenticatedUserPayload,
    id: string,
    dto: CancelConsultationDto,
  ) {
    const { consultation } = await this.getMutableConsultation(user, id);
    if (consultation.status === ConsultationStatus.CANCELED) {
      return this.findOne(user, id);
    }
    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new ConflictException(
        'Une consultation finalisée ne peut pas être annulée.',
      );
    }
    await this.prisma.$transaction(async (client) => {
      await client.patientConsultation.update({
        where: { id },
        data: {
          status: ConsultationStatus.CANCELED,
          canceledAt: new Date(),
          cancellationReason: sanitizeTextInput(dto.reason),
        },
      });
      await this.auditLogs.createAuditLog(
        {
          userId: user.sub,
          action: 'CONSULTATION_CANCELED',
          entityType: 'PatientConsultation',
          entityId: id,
          metadata: { status: ConsultationStatus.CANCELED },
        },
        client,
      );
    });
    return this.findOne(user, id);
  }

  async addAddendum(
    user: AuthenticatedUserPayload,
    id: string,
    dto: CreateConsultationAddendumDto,
  ) {
    const { consultation } = await this.getMutableConsultation(user, id);
    if (consultation.status !== ConsultationStatus.COMPLETED) {
      throw new ConflictException(
        'Un addendum peut uniquement compléter une consultation finalisée.',
      );
    }
    await this.prisma.$transaction(async (client) => {
      const addendum = await client.consultationAddendum.create({
        data: {
          consultationId: id,
          authorId: user.sub,
          content: sanitizeTextInput(dto.content),
        },
      });
      await this.auditLogs.createAuditLog(
        {
          userId: user.sub,
          action: 'CONSULTATION_ADDENDUM_CREATED',
          entityType: 'ConsultationAddendum',
          entityId: addendum.id,
          metadata: { status: ConsultationStatus.COMPLETED },
        },
        client,
      );
    });
    return this.findOne(user, id);
  }

  async findOne(user: AuthenticatedUserPayload, id: string) {
    const scope = await this.authorization.resolveWorkspace(user);
    const consultation = await this.prisma.patientConsultation.findFirst({
      where: { id, workspaceId: scope.workspaceId },
      include: consultationDetailInclude,
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    const link = {
      encounterId: id,
      patientId: consultation.patientId,
      workspaceId: scope.workspaceId,
    };
    const [prescriptions, reports] = await Promise.all([
      this.prisma.prescription.findMany({
        where: link,
        orderBy: [{ prescribedAt: 'desc' }, { id: 'desc' }],
        select: linkedPrescriptionSelect,
      }),
      this.prisma.clinicalReport.findMany({
        where: { ...link, supersededAt: null },
        orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
        select: linkedReportSelect,
      }),
    ]);
    return toConsultationDetail(consultation, prescriptions, reports);
  }

  async clinicalContext(user: AuthenticatedUserPayload, id: string) {
    const scope = await this.authorization.resolveWorkspace(user);
    const consultation = await this.prisma.patientConsultation.findFirst({
      where: { id, workspaceId: scope.workspaceId },
      select: { id: true, patientId: true },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    const patientWhere = {
      id: consultation.patientId,
      workspaceId: scope.workspaceId,
    };
    const [
      patient,
      recentConsultations,
      activePrescriptions,
      recentReports,
      recentAiAnalyses,
      recentDocuments,
      recentDicomStudies,
    ] = await Promise.all([
      this.prisma.patient.findFirst({
        where: patientWhere,
        select: {
          id: true,
          firstName: true,
          firstNameAr: true,
          lastName: true,
          lastNameAr: true,
          birthDate: true,
          gender: true,
          bloodGroup: true,
          hospitalRecordNumber: true,
          medicalSummary: true,
        },
      }),
      this.prisma.patientConsultation.findMany({
        where: {
          workspaceId: scope.workspaceId,
          patientId: consultation.patientId,
          id: { not: id },
        },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          status: true,
          startedAt: true,
          createdAt: true,
          chiefComplaint: true,
          assessment: true,
        },
      }),
      this.prisma.prescription.findMany({
        where: {
          workspaceId: scope.workspaceId,
          patientId: consultation.patientId,
          status: {
            in: [
              PrescriptionStatus.DRAFT,
              PrescriptionStatus.PENDING_VALIDATION,
              PrescriptionStatus.VALIDATED,
            ],
          },
        },
        orderBy: { prescribedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          number: true,
          status: true,
          prescribedAt: true,
          validUntil: true,
        },
      }),
      this.prisma.clinicalReport.findMany({
        where: {
          workspaceId: scope.workspaceId,
          patientId: consultation.patientId,
          supersededAt: null,
        },
        orderBy: { effectiveAt: 'desc' },
        take: 5,
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          effectiveAt: true,
        },
      }),
      this.prisma.aiAnalysisRun.findMany({
        where: { patientId: consultation.patientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          pipeline: true,
          status: true,
          decisionStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.patientDocument.findMany({
        where: { patientId: consultation.patientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          documentType: true,
          originalName: true,
          createdAt: true,
        },
      }),
      this.prisma.dicomStudy.findMany({
        where: {
          workspaceId: scope.workspaceId,
          patientId: consultation.patientId,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          studyDate: true,
          studyDescription: true,
          modalities: true,
          seriesCount: true,
          instancesCount: true,
          createdAt: true,
        },
      }),
    ]);
    if (!patient) throw new NotFoundException('Patient introuvable.');
    return {
      patient: {
        ...patient,
        medicalSummary: this.safeMedicalSummary(patient.medicalSummary),
      },
      recentConsultations: recentConsultations.map((item) => ({
        ...item,
        occurredAt: item.startedAt ?? item.createdAt,
      })),
      activePrescriptions,
      recentReports,
      recentAiAnalyses,
      recentDocuments,
      recentDicomStudies,
    };
  }

  private async getMutableConsultation(
    user: AuthenticatedUserPayload,
    id: string,
  ) {
    const physician = await this.authorization.resolvePhysician(user);
    const consultation = await this.prisma.patientConsultation.findFirst({
      where: { id, workspaceId: physician.workspace.workspaceId },
      select: {
        id: true,
        workspaceId: true,
        patientId: true,
        doctorProfileId: true,
        status: true,
        startedAt: true,
        chiefComplaint: true,
        clinicalExamination: true,
        assessment: true,
        _count: { select: { diagnoses: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    this.authorization.assertResponsibleDoctor(
      consultation,
      physician.doctorProfileId,
    );
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: consultation.patientId,
        workspaceId: physician.workspace.workspaceId,
      },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    return { consultation, physician };
  }

  private vitalSignsData(dto: ConsultationVitalSignsDto) {
    return {
      systolicBp: dto.systolicBp ?? null,
      diastolicBp: dto.diastolicBp ?? null,
      heartRate: dto.heartRate ?? null,
      respiratoryRate: dto.respiratoryRate ?? null,
      oxygenSaturation: dto.oxygenSaturation ?? null,
      temperature: dto.temperature ?? null,
      weightKg: dto.weightKg ?? null,
      heightCm: dto.heightCm ?? null,
    };
  }

  private safeMedicalSummary(value: Prisma.JsonValue) {
    const summary =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const strings = (field: string) => {
      const candidate = summary[field];
      return Array.isArray(candidate)
        ? candidate.filter((item): item is string => typeof item === 'string')
        : [];
    };
    return {
      allergies: strings('allergies'),
      chronicDiseases: strings('chronicDiseases'),
      currentMedications: strings('currentMedications'),
    };
  }

  private async buildListWhere(
    user: AuthenticatedUserPayload,
    workspaceId: string,
    query: ListConsultationsQueryDto,
  ): Promise<Prisma.PatientConsultationWhereInput> {
    const filters: Prisma.PatientConsultationWhereInput[] = [{ workspaceId }];
    if (query.patientId) filters.push({ patientId: query.patientId });
    if (query.doctorId) filters.push({ doctorProfileId: query.doctorId });
    if (query.status) filters.push({ status: query.status });
    if (query.from || query.to) {
      const range = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
      filters.push({ OR: [{ startedAt: range }, { createdAt: range }] });
    }
    if (query.prescription === 'with') {
      filters.push({ prescriptions: { some: {} } });
    } else if (query.prescription === 'without') {
      filters.push({ prescriptions: { none: {} } });
    }
    if (query.mine) {
      const profile = await this.prisma.doctorProfile.findUnique({
        where: { userId: user.sub },
        select: { id: true },
      });
      filters.push({ doctorProfileId: profile?.id ?? '' });
    }
    if (query.query) {
      const search = sanitizeTextInput(query.query);
      filters.push({
        OR: [
          { chiefComplaint: { contains: search } },
          { assessment: { contains: search } },
          { diagnoses: { some: { label: { contains: search } } } },
          { patient: { firstName: { contains: search } } },
          { patient: { firstNameAr: { contains: search } } },
          { patient: { lastName: { contains: search } } },
          { patient: { lastNameAr: { contains: search } } },
          { patient: { hospitalRecordNumber: { contains: search } } },
        ],
      });
    }
    return { AND: filters };
  }
}
