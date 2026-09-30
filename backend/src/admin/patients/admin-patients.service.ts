import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { sanitizeTextInput } from '../../common/utils/sanitize';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPaginationMeta,
  getPagination,
} from '../shared/admin-pagination.util';
import { mapAdminPatientListItem } from '../shared/admin-response.mapper';
import { ListAdminPatientsQueryDto } from './dto/list-admin-patients-query.dto';

@Injectable()
export class AdminPatientsService {
  constructor(private readonly prisma: PrismaService) {}

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
