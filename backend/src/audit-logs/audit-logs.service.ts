import { Injectable } from '@nestjs/common';

import { type AuditLog, type Prisma } from '@prisma/client';
import { type AccountStatus } from '../common/enums/account-status.enum';
import { type UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CreateAuditLogInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditLog(
    input: CreateAuditLogInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<AuditLog> {
    return client.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
        user: input.userId
          ? {
              connect: {
                id: input.userId,
              },
            }
          : undefined,
      },
    });
  }

  logLoginSuccess(
    input: {
      userId: string;
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata: {
        role: UserRole;
        accountStatus: AccountStatus;
      };
    },
    client: PrismaExecutor = this.prisma,
  ): Promise<AuditLog> {
    return this.createAuditLog(
      {
        action: 'LOGIN_SUCCESS',
        entityType: 'USER',
        entityId: input.userId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
        userId: input.userId,
      },
      client,
    );
  }

  logLoginFailed(
    input: {
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata?: Prisma.InputJsonValue;
      userId?: string | null;
    },
    client: PrismaExecutor = this.prisma,
  ): Promise<AuditLog> {
    return this.createAuditLog(
      {
        action: 'LOGIN_FAILED',
        entityType: 'AUTH',
        entityId: input.userId ?? null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
        userId: input.userId,
      },
      client,
    );
  }

  logLogout(
    input: {
      userId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    client: PrismaExecutor = this.prisma,
  ): Promise<AuditLog> {
    return this.createAuditLog(
      {
        action: 'LOGOUT',
        entityType: 'AUTH',
        entityId: input.userId ?? null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        userId: input.userId,
      },
      client,
    );
  }
}
