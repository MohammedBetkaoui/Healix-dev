import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListConsultationsQueryDto } from './dto/list-consultations-query.dto';
import {
  consultationDetailInclude,
  consultationListInclude,
  linkedPrescriptionSelect,
  linkedReportSelect,
  toConsultationDetail,
  toConsultationListItem,
} from './mappers/consultation-response.mapper';

// Algeria is on UTC+1 all year (no daylight saving time).
const ALGIERS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of today, of this week (Monday) and of this month, as instants. */
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

const isPhysician = (role: string) =>
  role === UserRole.INDEPENDENT_DOCTOR || role === UserRole.AFFILIATED_DOCTOR;

// The consultations a user sees are the ones of the patients they see: the
// rule of the patient record (the patients of the workspace they work in).
// A consultation of another workspace answers 404, like an unknown one.
// Consultations are read here only: a consultation is a piece of the medical
// record, it is neither edited nor deleted.
@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
  ) {}

  capabilities(user: AuthenticatedUserPayload) {
    return { canCreateConsultation: isPhysician(user.role) };
  }

  async list(user: AuthenticatedUserPayload, query: ListConsultationsQueryDto) {
    const scope = await this.patients.getPatientScope(user);
    const where = await this.buildListWhere(user, scope.where, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patientConsultation.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
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
    const scope = await this.patients.getPatientScope(user);
    const starts = periodStarts();
    const visible: Prisma.PatientConsultationWhereInput = {
      patient: scope.where,
    };
    const since = (date: Date) => ({ ...visible, date: { gte: date } });
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
      // Share of the consultations of this month that have a prescription.
      withPrescription,
      prescriptionShare: month
        ? Math.round((withPrescription / month) * 100)
        : 0,
    };
  }

  async findOne(user: AuthenticatedUserPayload, id: string) {
    const scope = await this.patients.getPatientScope(user);
    const consultation = await this.prisma.patientConsultation.findFirst({
      where: { id, patient: scope.where },
      include: consultationDetailInclude,
    });
    if (!consultation) {
      // Another workspace's consultation answers like an unknown one.
      throw new NotFoundException('Consultation introuvable.');
    }
    // Only what belongs to this consultation AND to its patient, in this
    // workspace: a stray link to another patient's record is never shown.
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

  private async buildListWhere(
    user: AuthenticatedUserPayload,
    patientScope: Prisma.PatientWhereInput,
    query: ListConsultationsQueryDto,
  ): Promise<Prisma.PatientConsultationWhereInput> {
    const filters: Prisma.PatientConsultationWhereInput[] = [
      { patient: patientScope },
    ];
    if (query.patientId) filters.push({ patientId: query.patientId });
    if (query.from || query.to) {
      filters.push({
        date: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      });
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
      // No doctor profile (the administration): nothing is "mine".
      filters.push({ doctorProfileId: profile?.id ?? '' });
    }
    if (query.query) {
      const search = sanitizeTextInput(query.query);
      filters.push({
        OR: [
          { reason: { contains: search } },
          { diagnosis: { contains: search } },
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
