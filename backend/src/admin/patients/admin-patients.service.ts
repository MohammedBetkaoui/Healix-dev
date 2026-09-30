import { Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { type RequestContext } from '../../common/utils/request-context';
import { sanitizeTextInput } from '../../common/utils/sanitize';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPaginationMeta,
  getPagination,
} from '../shared/admin-pagination.util';
import {
  mapAdminPatientListItem,
  mapAuditLog,
} from '../shared/admin-response.mapper';
import { ListAdminPatientsQueryDto } from './dto/list-admin-patients-query.dto';

@Injectable()
export class AdminPatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listPatients(query: ListAdminPatientsQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where = this.buildWhere(query);

    const [total, patients] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        include: {
          establishment: { select: { name: true } },
          doctorProfile: {
            select: { id: true, user: { select: { fullName: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        where,
      }),
    ]);

    return {
      data: patients.map(mapAdminPatientListItem),
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async getPatientById(
    id: string,
    adminId: string,
    context: Partial<RequestContext> = {},
  ) {
    const patient = await this.prisma.patient.findUnique({
      include: {
        establishment: true,
        doctorProfile: { include: { user: { select: { fullName: true } } } },
      },
      where: { id },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable.');
    }

    // AuditLog has no patientId column: entries for sub-resources
    // (consultations/documents/AI analyses) are recorded against their own
    // entityId. Same gathering as PatientsService#listAuditLog.
    const [consultations, documents, analyses] = await Promise.all([
      this.prisma.patientConsultation.findMany({
        where: { patientId: id },
        select: { id: true },
      }),
      this.prisma.patientDocument.findMany({
        where: { patientId: id },
        select: { id: true },
      }),
      this.prisma.patientAiAnalysis.findMany({
        where: { patientId: id },
        select: { id: true },
      }),
    ]);
    const entityIds = [
      id,
      ...consultations.map((consultation) => consultation.id),
      ...documents.map((document) => document.id),
      ...analyses.map((analysis) => analysis.id),
    ];

    const latestAuditLogs = await this.prisma.auditLog.findMany({
      include: { user: { select: { fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      where: { entityId: { in: entityIds } },
    });

    // Never field values (nationalId, medicalSummary, …) in metadata — same
    // rule as PatientsService#update for PATIENT_UPDATED.
    await this.auditLogsService.createAuditLog({
      action: 'ADMIN_VIEWED_PATIENT',
      entityId: id,
      // Same casing as entityTypeByAction in patient-audit.service.ts.
      entityType: 'Patient',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      userId: adminId,
    });

    return {
      patient: mapAdminPatientListItem(patient),
      establishment: patient.establishment,
      doctorProfile: patient.doctorProfile,
      latestAuditLogs: latestAuditLogs.map(mapAuditLog),
    };
  }

  // Same filters as PatientsService#buildWhere, without the owner scope.
  private buildWhere(
    query: ListAdminPatientsQueryDto,
  ): Prisma.PatientWhereInput {
    const where: Prisma.PatientWhereInput = {};

    if (query.search) {
      const search = sanitizeTextInput(query.search);
      where.OR = [
        { firstName: { contains: search } },
        { firstNameAr: { contains: search } },
        { lastName: { contains: search } },
        { lastNameAr: { contains: search } },
        { nationalId: { contains: search } },
        { phone: { contains: search } },
        { hospitalRecordNumber: { contains: search } },
      ];
    }

    if (query.gender) {
      where.gender = query.gender;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.administrativeStatus) {
      where.administrativeStatus = query.administrativeStatus;
    }

    if (query.insurance) {
      where.insurance = query.insurance;
    }

    if (query.sector) {
      where.sector = query.sector;
    }

    if (query.bloodGroup) {
      where.bloodGroup = query.bloodGroup;
    }

    if (query.wilaya) {
      where.wilaya = sanitizeTextInput(query.wilaya);
    }

    return where;
  }
}
