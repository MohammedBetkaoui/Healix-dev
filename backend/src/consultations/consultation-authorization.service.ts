import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccountStatus, UserRole, VerificationStatus } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ResolvedWorkspaceContext,
  WorkspaceContextService,
} from '../workspaces/workspace-context.service';

export const isConsultationPhysician = (role: string) =>
  role === UserRole.INDEPENDENT_DOCTOR || role === UserRole.AFFILIATED_DOCTOR;

@Injectable()
export class ConsultationAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  capabilities(role: string) {
    const physician = isConsultationPhysician(role);
    const canView = physician || role === UserRole.ESTABLISHMENT_ADMIN;
    return {
      canViewConsultations: canView,
      canCreateConsultation: physician,
      canEditConsultation: physician,
      canStartConsultation: physician,
      canCompleteConsultation: physician,
      canCancelConsultation: physician,
      canAddAddendum: physician,
    };
  }

  async resolveWorkspace(
    user: AuthenticatedUserPayload,
  ): Promise<ResolvedWorkspaceContext> {
    if (!this.capabilities(user.role).canViewConsultations) {
      throw new ForbiddenException(
        "Vous n'êtes pas autorisé à consulter les consultations.",
      );
    }
    return this.workspaceContext.resolveWorkspaceForUser({
      userId: user.sub,
      role: user.role,
    });
  }

  async resolvePhysician(user: AuthenticatedUserPayload): Promise<{
    workspace: ResolvedWorkspaceContext;
    doctorProfileId: string;
  }> {
    if (!isConsultationPhysician(user.role)) {
      throw new ForbiddenException(
        'Une action clinique doit être réalisée par un médecin.',
      );
    }
    const workspace = await this.resolveWorkspace(user);
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        accountStatus: true,
        doctorProfile: {
          select: { id: true, verificationStatus: true },
        },
      },
    });
    if (
      !account ||
      account.accountStatus !== AccountStatus.ACTIVE ||
      !account.doctorProfile ||
      account.doctorProfile.id !== workspace.doctorProfileId ||
      account.doctorProfile.verificationStatus !== VerificationStatus.VERIFIED
    ) {
      throw new ForbiddenException(
        'Un profil médecin actif dans ce workspace est requis.',
      );
    }
    return {
      workspace,
      doctorProfileId: account.doctorProfile.id,
    };
  }

  assertResponsibleDoctor(
    consultation: { doctorProfileId: string },
    doctorProfileId: string,
  ) {
    if (consultation.doctorProfileId !== doctorProfileId) {
      throw new ForbiddenException(
        'Seul le médecin responsable peut modifier cette consultation.',
      );
    }
  }
}
