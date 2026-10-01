import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceType,
} from '@prisma/client';

import {
  UserRole,
  type UserRole as UserRoleValue,
} from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';

type WorkspaceActor = {
  userId: string;
  role: UserRoleValue;
};

export type ResolvedWorkspaceContext = {
  workspaceId: string;
  workspaceType: WorkspaceType;
  membershipRole: WorkspaceMembershipRole;
  establishmentId?: string;
  doctorProfileId?: string;
};

type WorkspaceSelection = {
  type: WorkspaceType;
  membershipRoles: WorkspaceMembershipRole[];
};

@Injectable()
export class WorkspaceContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWorkspaceForUser(
    actor: WorkspaceActor,
    requestedWorkspaceId?: string,
  ): Promise<ResolvedWorkspaceContext> {
    const selection = this.getAutomaticSelection(actor.role);
    const membership = await this.prisma.workspaceMembership.findFirst({
      where: {
        userId: actor.userId,
        status: WorkspaceMembershipStatus.ACTIVE,
        role: { in: selection.membershipRoles },
        workspaceId: requestedWorkspaceId,
        workspace: { type: selection.type },
      },
      include: {
        workspace: true,
        user: {
          select: {
            doctorProfile: { select: { id: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (!membership) {
      throw new ForbiddenException(
        'Aucun workspace actif ne correspond à ce compte.',
      );
    }

    return {
      workspaceId: membership.workspace.id,
      workspaceType: membership.workspace.type,
      membershipRole: membership.role,
      establishmentId: membership.workspace.establishmentId ?? undefined,
      doctorProfileId:
        membership.workspace.ownerDoctorProfileId ??
        membership.user.doctorProfile?.id ??
        undefined,
    };
  }

  private getAutomaticSelection(role: UserRoleValue): WorkspaceSelection {
    switch (role) {
      case UserRole.ESTABLISHMENT_ADMIN:
        return {
          type: WorkspaceType.ESTABLISHMENT,
          membershipRoles: [
            WorkspaceMembershipRole.OWNER,
            WorkspaceMembershipRole.ADMIN,
          ],
        };
      case UserRole.INDEPENDENT_DOCTOR:
        return {
          type: WorkspaceType.PRIVATE_PRACTICE,
          membershipRoles: [WorkspaceMembershipRole.OWNER],
        };
      case UserRole.AFFILIATED_DOCTOR:
        return {
          type: WorkspaceType.ESTABLISHMENT,
          membershipRoles: [WorkspaceMembershipRole.DOCTOR],
        };
      default:
        throw new ForbiddenException(
          "Ce type de compte n'est pas associé à un workspace clinique.",
        );
    }
  }
}
