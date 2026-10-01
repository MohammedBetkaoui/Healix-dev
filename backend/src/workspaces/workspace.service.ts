import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type Workspace,
  WorkspaceMembershipRole,
  WorkspaceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceMembershipService } from './workspace-membership.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CreateEstablishmentWorkspaceInput = {
  establishmentId: string;
  name: string;
  ownerUserId: string;
};

type CreatePrivatePracticeWorkspaceInput = {
  name: string;
  ownerDoctorProfileId: string;
  ownerUserId: string;
};

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: WorkspaceMembershipService,
  ) {}

  async createForEstablishment(
    input: CreateEstablishmentWorkspaceInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<Workspace> {
    const workspace = await client.workspace.upsert({
      where: { establishmentId: input.establishmentId },
      create: {
        type: WorkspaceType.ESTABLISHMENT,
        name: input.name,
        establishmentId: input.establishmentId,
      },
      update: {
        type: WorkspaceType.ESTABLISHMENT,
        name: input.name,
      },
    });

    await this.memberships.ensureMembership(
      {
        workspaceId: workspace.id,
        userId: input.ownerUserId,
        role: WorkspaceMembershipRole.OWNER,
      },
      client,
    );

    return workspace;
  }

  async createForPrivatePractice(
    input: CreatePrivatePracticeWorkspaceInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<Workspace> {
    const workspace = await client.workspace.upsert({
      where: { ownerDoctorProfileId: input.ownerDoctorProfileId },
      create: {
        type: WorkspaceType.PRIVATE_PRACTICE,
        name: input.name,
        ownerDoctorProfileId: input.ownerDoctorProfileId,
      },
      update: {
        type: WorkspaceType.PRIVATE_PRACTICE,
        name: input.name,
      },
    });

    await this.memberships.ensureMembership(
      {
        workspaceId: workspace.id,
        userId: input.ownerUserId,
        role: WorkspaceMembershipRole.OWNER,
      },
      client,
    );

    return workspace;
  }

  async addDoctorToEstablishment(
    establishmentId: string,
    userId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<void> {
    const workspace = await client.workspace.findUnique({
      where: { establishmentId },
      select: { id: true },
    });

    if (!workspace) {
      throw new NotFoundException(
        "Le workspace de l'établissement est introuvable.",
      );
    }

    await this.memberships.ensureMembership(
      {
        workspaceId: workspace.id,
        userId,
        role: WorkspaceMembershipRole.DOCTOR,
      },
      client,
    );
  }
}
