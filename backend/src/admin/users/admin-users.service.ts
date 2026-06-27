import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPaginationMeta,
  getPagination,
} from '../shared/admin-pagination.util';
import {
  mapAdminUserListItem,
  mapAuditLog,
} from '../shared/admin-response.mapper';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listUsers(query: ListUsersQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where = this.buildUsersWhere(query);
    const orderBy = this.buildUsersOrderBy(query);

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        include: {
          doctorProfile: {
            select: {
              verificationStatus: true,
              wilaya: true,
            },
          },
          establishment: {
            select: {
              verificationStatus: true,
              wilaya: true,
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
      data: users.map(mapAdminUserListItem),
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async getUserById(
    id: string,
    adminId: string,
    context: RequestContext = {},
  ) {
    const user = await this.prisma.user.findUnique({
      include: {
        doctorProfile: true,
        establishment: true,
        refreshTokens: false,
        verificationRequests: {
          include: {
            documents: {
              select: {
                documentType: true,
                id: true,
                originalName: true,
                status: true,
                uploadedAt: true,
              },
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 1,
        },
      },
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const latestAuditLogs = await this.prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 8,
      where: { userId: id },
    });

    await this.auditLogsService.createAuditLog({
      action: 'ADMIN_VIEWED_USER',
      entityId: id,
      entityType: 'USER',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      userId: adminId,
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        accountStatus: user.accountStatus,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      establishment: user.establishment,
      doctorProfile: user.doctorProfile,
      verificationSummary: user.verificationRequests[0] ?? null,
      latestAuditLogs: latestAuditLogs.map(mapAuditLog),
    };
  }

  async suspendUser(
    id: string,
    adminId: string,
    dto: SuspendUserDto,
    context: RequestContext = {},
  ) {
    if (id === adminId) {
      throw new ConflictException('Impossible de suspendre votre propre compte.');
    }

    const user = await this.ensureUserExists(id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        data: { accountStatus: AccountStatus.SUSPENDED },
        where: { id },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'USER_SUSPENDED',
          entityId: id,
          entityType: 'USER',
          ipAddress: context.ipAddress,
          metadata: {
            previousStatus: user.accountStatus,
            reason: dto.reason,
          },
          userAgent: context.userAgent,
          userId: adminId,
        },
        transaction,
      );
    });

    return {
      message: 'Utilisateur suspendu avec succès.',
      status: AccountStatus.SUSPENDED,
    };
  }

  async reactivateUser(
    id: string,
    adminId: string,
    context: RequestContext = {},
  ) {
    const user = await this.ensureUserExists(id);
    const nextStatus = this.resolveReactivatedAccountStatus(user);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        data: { accountStatus: nextStatus },
        where: { id },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'USER_REACTIVATED',
          entityId: id,
          entityType: 'USER',
          ipAddress: context.ipAddress,
          metadata: {
            previousStatus: user.accountStatus,
            nextStatus,
          },
          userAgent: context.userAgent,
          userId: adminId,
        },
        transaction,
      );
    });

    return {
      message: 'Utilisateur réactivé avec succès.',
      status: nextStatus,
    };
  }

  private buildUsersWhere(query: ListUsersQueryDto): Prisma.UserWhereInput {
    const search = query.search?.trim();
    const wilaya = query.wilaya?.trim();
    const andConditions: Prisma.UserWhereInput[] = [];

    if (query.role) {
      andConditions.push({ role: query.role });
    }

    if (query.accountStatus) {
      andConditions.push({ accountStatus: query.accountStatus });
    }

    if (query.createdFrom || query.createdTo) {
      andConditions.push({
        createdAt: {
          gte: query.createdFrom ? new Date(query.createdFrom) : undefined,
          lte: query.createdTo ? new Date(query.createdTo) : undefined,
        },
      });
    }

    if (query.verificationStatus) {
      andConditions.push({
        OR: [
          { establishment: { verificationStatus: query.verificationStatus } },
          { doctorProfile: { verificationStatus: query.verificationStatus } },
        ],
      });
    }

    if (wilaya) {
      andConditions.push({
        OR: [
          { establishment: { wilaya: { contains: wilaya } } },
          { doctorProfile: { wilaya: { contains: wilaya } } },
        ],
      });
    }

    if (search) {
      andConditions.push({
        OR: [
          { fullName: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
        ],
      });
    }

    return andConditions.length > 0 ? { AND: andConditions } : {};
  }

  private buildUsersOrderBy(
    query: ListUsersQueryDto,
  ): Prisma.UserOrderByWithRelationInput {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    return { [sortBy]: sortOrder };
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({
      include: {
        doctorProfile: {
          select: {
            verificationStatus: true,
          },
        },
        establishment: {
          select: {
            verificationStatus: true,
          },
        },
      },
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    return user;
  }

  private resolveReactivatedAccountStatus(
    user: Awaited<ReturnType<AdminUsersService['ensureUserExists']>>,
  ) {
    const verificationStatus =
      user.establishment?.verificationStatus ??
      user.doctorProfile?.verificationStatus ??
      VerificationStatus.NOT_STARTED;

    return verificationStatus === VerificationStatus.VERIFIED
      ? AccountStatus.VERIFIED_NO_PLAN
      : AccountStatus.BASIC_ACCOUNT;
  }
}
