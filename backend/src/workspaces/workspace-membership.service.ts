import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type WorkspaceMembership,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type EnsureMembershipInput = {
  workspaceId: string;
  userId: string;
  role: WorkspaceMembershipRole;
  status?: WorkspaceMembershipStatus;
};

@Injectable()
export class WorkspaceMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  ensureMembership(
    input: EnsureMembershipInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<WorkspaceMembership> {
    const status = input.status ?? WorkspaceMembershipStatus.ACTIVE;

    return client.workspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        status,
      },
      update: {
        role: input.role,
        status,
      },
    });
  }
}
