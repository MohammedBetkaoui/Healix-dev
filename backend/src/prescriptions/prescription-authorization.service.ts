import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  UserRole,
  VerificationStatus,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import {
  type ResolvedWorkspaceContext,
  WorkspaceContextService,
} from '../workspaces/workspace-context.service';
import {
  prescriptionConflict,
  prescriptionForbidden,
} from './prescription-errors';

export type PrescriptionPermission =
  | 'VIEW'
  | 'CREATE'
  | 'EDIT'
  | 'SIGN'
  | 'CANCEL'
  | 'PRINT';

export type PrescriberIdentity = {
  doctorProfileId: string;
  fullName: string;
  speciality: string;
  registrationNumber: string | null;
  regionalCouncil: string | null;
  registrationWilaya: string | null;
  professionalAddress: string;
  professionalPhone: string;
  organization: {
    id: string | null;
    name: string;
    address: string;
    wilaya: string;
    phone: string;
  };
  credentialsComplete: boolean;
};

@Injectable()
export class PrescriptionAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly entitlements: EntitlementsService,
  ) {}

  capabilities(role: string) {
    const physician =
      role === UserRole.INDEPENDENT_DOCTOR ||
      role === UserRole.AFFILIATED_DOCTOR;
    const admin = role === UserRole.ESTABLISHMENT_ADMIN;
    return {
      canViewPrescriptions: physician || admin,
      canCreatePrescription: physician,
      canEditPrescription: physician,
      canSignPrescription: physician,
      canCancelPrescription: physician,
      canPrintPrescription: physician || admin,
    };
  }

  assertPermission(
    user: AuthenticatedUserPayload,
    permission: PrescriptionPermission,
  ) {
    const capabilities = this.capabilities(user.role);
    const allowed = {
      VIEW: capabilities.canViewPrescriptions,
      CREATE: capabilities.canCreatePrescription,
      EDIT: capabilities.canEditPrescription,
      SIGN: capabilities.canSignPrescription,
      CANCEL: capabilities.canCancelPrescription,
      PRINT: capabilities.canPrintPrescription,
    }[permission];
    if (!allowed) {
      throw prescriptionForbidden(
        'PRESCRIPTION_PERMISSION_DENIED',
        "Vous n'êtes pas autorisé à effectuer cette action sur les ordonnances.",
      );
    }
  }

  async resolveWorkspace(
    user: AuthenticatedUserPayload,
  ): Promise<ResolvedWorkspaceContext> {
    this.assertPermission(user, 'VIEW');
    return this.workspaceContext.resolveWorkspaceForUser({
      userId: user.sub,
      role: user.role,
    });
  }

  async resolvePrescriber(
    user: AuthenticatedUserPayload,
    operation: 'CREATE' | 'SIGN' | 'EDIT' | 'CANCEL',
  ): Promise<{
    workspace: ResolvedWorkspaceContext;
    identity: PrescriberIdentity;
  }> {
    this.assertPermission(user, operation);
    const workspace = await this.workspaceContext.resolveWorkspaceForUser({
      userId: user.sub,
      role: user.role,
    });
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        accountStatus: true,
        fullName: true,
        phone: true,
        doctorProfile: {
          select: {
            id: true,
            speciality: true,
            professionalAddress: true,
            wilaya: true,
            isIndependent: true,
            verificationStatus: true,
            establishment: {
              select: {
                id: true,
                name: true,
                address: true,
                wilaya: true,
                phone: true,
              },
            },
            verificationRequest: {
              select: {
                doctorData: {
                  select: {
                    orderRegistrationNumber: true,
                    regionalCouncil: true,
                    registrationWilaya: true,
                    cabinetName: true,
                    cabinetAddress: true,
                    cabinetWilaya: true,
                    cabinetPhone: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const profile = account?.doctorProfile;
    if (!account || account.accountStatus !== AccountStatus.ACTIVE) {
      throw prescriptionForbidden(
        'PRESCRIBER_REQUIRED',
        'Un compte médecin actif est requis.',
      );
    }
    if (!profile || profile.id !== workspace.doctorProfileId) {
      throw prescriptionForbidden(
        'PRESCRIBER_REQUIRED',
        'Un profil médecin actif dans ce workspace est requis.',
      );
    }
    if (profile.verificationStatus !== VerificationStatus.VERIFIED) {
      throw prescriptionForbidden(
        'PRESCRIBER_NOT_VERIFIED',
        'Le profil du prescripteur doit être vérifié.',
      );
    }
    // The subscription of the workspace the doctor works in: their own for an
    // independent doctor, the establishment's for an affiliated one. A trial
    // counts; a lapsed subscription does not, even before the hourly job has
    // marked it expired.
    const subscription = await this.entitlements.getEntitlements(
      workspace.workspaceId,
    );
    if (subscription.readOnly) {
      throw prescriptionForbidden(
        'PRESCRIBER_SUBSCRIPTION_INACTIVE',
        profile.isIndependent
          ? "L'abonnement du prescripteur indépendant doit être actif."
          : "L'abonnement de l'établissement doit être actif.",
      );
    }
    if (!profile.isIndependent) {
      const membership = await this.prisma.workspaceMembership.findFirst({
        where: {
          userId: user.sub,
          workspaceId: workspace.workspaceId,
          status: WorkspaceMembershipStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!membership) {
        throw prescriptionForbidden(
          'PRESCRIBER_REQUIRED',
          "Le médecin n'est pas actif dans cet établissement.",
        );
      }
    }

    const verification = profile.verificationRequest?.doctorData;
    const organization = profile.establishment
      ? profile.establishment
      : {
          id: null,
          name:
            verification?.cabinetName ?? `Cabinet du Dr ${account.fullName}`,
          address: verification?.cabinetAddress ?? profile.professionalAddress,
          wilaya: verification?.cabinetWilaya ?? profile.wilaya,
          phone: verification?.cabinetPhone ?? account.phone,
        };
    const identity: PrescriberIdentity = {
      doctorProfileId: profile.id,
      fullName: account.fullName,
      speciality: profile.speciality,
      registrationNumber: verification?.orderRegistrationNumber ?? null,
      regionalCouncil: verification?.regionalCouncil ?? null,
      registrationWilaya: verification?.registrationWilaya ?? null,
      professionalAddress: profile.professionalAddress,
      professionalPhone: verification?.cabinetPhone ?? account.phone,
      organization,
      credentialsComplete: Boolean(
        account.fullName &&
        profile.speciality &&
        profile.professionalAddress &&
        verification?.orderRegistrationNumber &&
        verification.regionalCouncil,
      ),
    };
    if (operation === 'SIGN' && !identity.credentialsComplete) {
      throw prescriptionConflict(
        'PRESCRIBER_CREDENTIALS_INCOMPLETE',
        "Le numéro d'Ordre, le conseil régional et l'adresse professionnelle du prescripteur doivent être renseignés avant validation.",
      );
    }
    return { workspace, identity };
  }
}
