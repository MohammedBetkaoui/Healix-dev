import { Transform } from 'class-transformer';
import { IsIn, IsEmail, IsString, MaxLength } from 'class-validator';

import { normalizeEmail } from '../../common/utils/sanitize';
import { WorkspaceMembershipRole } from '@prisma/client';

// What an admin sends when inviting: which inbox and which role. RECEPTIONIST
// exists in the schema but is not exposed in the interface yet, and OWNER is
// never invited: the owner exists by definition of the workspace.
export class CreateTeamInvitationDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsString({ message: 'Email invalide.' })
  @IsEmail({}, { message: 'Email invalide.' })
  @MaxLength(191, { message: 'Maximum 191 caractères.' })
  email!: string;

  @IsIn([WorkspaceMembershipRole.DOCTOR, WorkspaceMembershipRole.ADMIN], {
    message: 'Le rôle doit être DOCTOR ou ADMIN.',
  })
  role!: WorkspaceMembershipRole;
}
