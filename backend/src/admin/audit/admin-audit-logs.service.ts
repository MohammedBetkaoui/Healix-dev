import { Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPaginationMeta,
  getPagination,
} from '../shared/admin-pagination.util';
import { mapAuditLog } from '../shared/admin-response.mapper';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AdminAuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listAuditLogs(query: ListAuditLogsQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where = this.buildAuditWhere(query);
    const orderBy = this.buildAuditOrderBy(query);

    const [total, auditLogs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        include: {
          user: {
            select: {
              fullName: true,
              role: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
        where,
      }),
    ]);

    return {
      data: auditLogs.map(mapAuditLog),
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async getAuditLogById(
    id: string,
    adminId: string,
    context: RequestContext = {},
  ) {
    const auditLog = await this.prisma.auditLog.findUnique({
      include: {
        user: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
      where: { id },
    });

    if (!auditLog) {
      throw new NotFoundException('Audit log introuvable.');
    }

    await this.auditLogsService.createAuditLog({
      action: 'ADMIN_VIEWED_AUDIT_LOG',
      entityId: id,
      entityType: 'AUDIT_LOG',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      userId: adminId,
    });

    return mapAuditLog(auditLog);
  }

  private buildAuditWhere(
    query: ListAuditLogsQueryDto,
  ): Prisma.AuditLogWhereInput {
    const search = query.search?.trim();
    const andConditions: Prisma.AuditLogWhereInput[] = [];

    if (query.action) {
      andConditions.push({ action: { contains: query.action } });
    }

    if (query.role) {
      andConditions.push({ user: { role: query.role } });
    }

    if (query.userId) {
      andConditions.push({ userId: query.userId });
    }

    if (query.entityType) {
      andConditions.push({ entityType: { contains: query.entityType } });
    }

    if (query.ipAddress) {
      andConditions.push({ ipAddress: { contains: query.ipAddress } });
    }

    if (query.from || query.to) {
      andConditions.push({
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      });
    }

    if (search) {
      andConditions.push({
        OR: [
          { action: { contains: search } },
          { entityType: { contains: search } },
          { entityId: { contains: search } },
          { user: { fullName: { contains: search } } },
          { user: { email: { contains: search } } },
        ],
      });
    }

    return andConditions.length > 0 ? { AND: andConditions } : {};
  }

  private buildAuditOrderBy(
    query: ListAuditLogsQueryDto,
  ): Prisma.AuditLogOrderByWithRelationInput {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    return { [sortBy]: sortOrder };
  }
}
