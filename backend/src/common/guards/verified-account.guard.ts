import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

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

// Real medical features (patients, appointments, affiliated doctors) require a
// professionally VERIFIED account; no subscription is required. Must run after
// JwtAuthGuard, which sets request.user.
@Injectable()
export class VerifiedAccountGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user) {
      throw this.verificationRequired();
    }

    const profileRelation = getVerificationProfileRelation(user.role);

    // Roles without a professional profile (SUPER_ADMIN, ADMIN_VERIFICATION)
    // are not gated here: RolesGuard already scopes these controllers.
    if (!profileRelation) {
      return true;
    }

    const account = await this.prisma.user.findUnique({
      select: {
        accountStatus: true,
        doctorProfile: { select: { verificationStatus: true } },
        establishment: { select: { verificationStatus: true } },
      },
      where: { id: user.sub },
    });

    const isVerified =
      account?.[profileRelation]?.verificationStatus ===
      VerificationStatus.VERIFIED;
    // The JWT is not checked against the database: a suspended account keeps
    // a valid access token until it expires, so its status is re-read here.
    const isBlocked =
      account?.accountStatus === AccountStatus.SUSPENDED ||
      account?.accountStatus === AccountStatus.REJECTED;

    if (!account || !isVerified || isBlocked) {
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
