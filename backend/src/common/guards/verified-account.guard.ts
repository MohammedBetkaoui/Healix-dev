import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceType,
} from '@prisma/client';

import { type AuthenticatedRequest } from '../../auth/types/authenticated-request.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountStatus } from '../enums/account-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { VerificationStatus } from '../enums/verification-status.enum';

export const VERIFICATION_REQUIRED_CODE = 'VERIFICATION_REQUIRED';

// Relation holding the role's professional verification. Unlike
// SubscriptionsService.getAccountContextFromUser (payment semantics: rejects
// affiliated doctors, 404 on a missing profile), affiliated doctors are
// covered: their profile is created VERIFIED by DoctorsService.
function getVerificationProfileRelation(
  role: string,
): 'doctorProfile' | 'establishment' | null {
  if (role === UserRole.ESTABLISHMENT_ADMIN) {
    return 'establishment';
  }

  if (
    role === UserRole.INDEPENDENT_DOCTOR ||
    role === UserRole.AFFILIATED_DOCTOR
  ) {
    return 'doctorProfile';
  }

  return null;
}

// The account behind a token, read again: its professional profile is
// VERIFIED and it is neither suspended nor rejected. The JWT is not checked
// against the database: a suspended account keeps a valid access token until
// it expires, so its status is re-read here. Roles without a professional
// profile (SUPER_ADMIN, ADMIN_VERIFICATION) are not gated: RolesGuard scopes
// them. Also applied to the real-time connections (RealtimeAuthenticator).
//
// Membership-aware for establishment admins: a second administrator invited
// to a verified establishment owns no establishment row of their own — they
// are verified through their active OWNER/ADMIN membership in a workspace
// whose establishment is VERIFIED. The INVITER's verification, not the
// invitee's paperwork, vouches for the account.
export async function isVerifiedAccount(
  prisma: PrismaService,
  user: { sub: string; role: string },
): Promise<boolean> {
  const profileRelation = getVerificationProfileRelation(user.role);

  if (!profileRelation) {
    return true;
  }

  const account = await prisma.user.findUnique({
    select: {
      accountStatus: true,
      doctorProfile: { select: { verificationStatus: true } },
      establishment: { select: { verificationStatus: true } },
      // Only meaningful for the establishment branch (secondary admins);
      // harmless to read for the others.
      workspaceMemberships: {
        select: {
          workspace: {
            select: {
              establishment: { select: { verificationStatus: true } },
            },
          },
        },
        take: 1,
        where: {
          role: {
            in: [WorkspaceMembershipRole.OWNER, WorkspaceMembershipRole.ADMIN],
          },
          status: WorkspaceMembershipStatus.ACTIVE,
          workspace: {
            type: WorkspaceType.ESTABLISHMENT,
            establishment: {
              verificationStatus: VerificationStatus.VERIFIED,
            },
          },
        },
      },
    },
    where: { id: user.sub },
  });

  const isVerified =
    account?.[profileRelation]?.verificationStatus ===
      VerificationStatus.VERIFIED ||
    // A verified establishment membership also carries the establishment
    // admin: the nested path exists exactly when such a membership exists.
    (account?.workspaceMemberships?.[0]?.workspace.establishment
      ?.verificationStatus === VerificationStatus.VERIFIED &&
      user.role === UserRole.ESTABLISHMENT_ADMIN);
  const isBlocked =
    account?.accountStatus === AccountStatus.SUSPENDED ||
    account?.accountStatus === AccountStatus.REJECTED;

  return Boolean(account) && isVerified && !isBlocked;
}

// Real medical features (patients, appointments, affiliated doctors) require a
// professionally VERIFIED account; no subscription is required. Must run after
// JwtAuthGuard, which sets request.user.
@Injectable()
export class VerifiedAccountGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user || !(await isVerifiedAccount(this.prisma, user))) {
      throw this.verificationRequired();
    }

    return true;
  }

  // An object body is sent as-is by Nest's default exception filter (there is
  // no global filter), so the frontend can read response.data.code.
  private verificationRequired() {
    return new ForbiddenException({
      code: VERIFICATION_REQUIRED_CODE,
      message:
        'Votre compte doit être vérifié pour accéder à cette fonctionnalité.',
    });
  }
}
