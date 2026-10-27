import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceType } from '@prisma/client';

import {
  hasCapability,
  type WorkspaceCapability,
  capabilitiesForWorkspaceRole,
} from '../common/authorization/capabilities';
import { AccountStatus } from '../common/enums/account-status.enum';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ResolvedWorkspaceContext,
  WorkspaceContextService,
} from '../workspaces/workspace-context.service';

// What every organization/team endpoint resolves for the caller before doing
// anything: the workspace the call acts on and the capabilities the role has.
// The workspace is never taken from the request body: it is resolved from the
// membership in the database.
export type WorkspaceActorContext = {
  workspaceId: string;
  establishmentId: string;
  membershipRole: ResolvedWorkspaceContext['membershipRole'];
  capabilities: WorkspaceCapability[];
};

type Actor = { userId: string; role: AuthenticatedUserPayload['role'] };
export type { Actor };

// Controllers pass the JWT payload; the service maps `sub` onto `userId`
// once, here: every workspace resolution below uses the database, never the
// payload's workspaceId.
export function actorOf(user: Pick<AuthenticatedUserPayload, 'sub' | 'role'>): Actor {
  return { userId: user.sub, role: user.role };
}

@Injectable()
export class OrganizationAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  // Resolves the ACTIVE establishment workspace of the caller and its
  // capabilities. A suspended or rejected account (or one without a usable
  // membership) stops here already.
  async resolveActor(
    actor: Actor,
    requestedWorkspaceId?: string,
  ): Promise<WorkspaceActorContext> {
    const context =
      await this.workspaceContext.resolveWorkspaceForUser(
        actor,
        requestedWorkspaceId,
      );

    if (context.workspaceType !== WorkspaceType.ESTABLISHMENT) {
      throw new ForbiddenException(
        "La gestion d'établissement ne concerne que les workspaces établissement.",
      );
    }
    if (!context.establishmentId) {
      throw new NotFoundException('Établissement introuvable.');
    }

    const account = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { accountStatus: true },
    });

    if (
      !account ||
      account.accountStatus === AccountStatus.SUSPENDED ||
      account.accountStatus === AccountStatus.REJECTED
    ) {
      throw new ForbiddenException('Ce compte ne peut plus agir ici.');
    }

    return {
      workspaceId: context.workspaceId,
      establishmentId: context.establishmentId,
      membershipRole: context.membershipRole,
      capabilities: capabilitiesForWorkspaceRole(
        context.membershipRole,
        context.workspaceType,
      ),
    };
  }

  // Server-side authorization: denies by default. Doctors keep readBasic, only
  // OWNER/ADMIN go further, and capabilities not in the matrix do not exist.
  require(
    context: WorkspaceActorContext,
    capability: WorkspaceCapability,
  ): void {
    if (!hasCapability(context.capabilities, capability)) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission d'effectuer cette action.",
      );
    }
  }

  // A resource (membership, invitation) belongs to one workspace: a caller of
  // another workspace gets an identical 404, whether the resource exists or
  // not, so the existence of workspace data is never revealed.
  static assertSameWorkspace(
    context: { workspaceId: string },
    resourceWorkspaceId: string | null | undefined,
  ): void {
    if (resourceWorkspaceId !== context.workspaceId) {
      throw new NotFoundException('Ressource introuvable.');
    }
  }
}
