import { type User } from '@prisma/client';
import { type AccountStatus } from '../enums/account-status.enum';
import { type UserRole } from '../enums/user-role.enum';

export type PublicUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  accountStatus: AccountStatus;
};

export function toPublicUser(
  user: Pick<
    User,
    'id' | 'fullName' | 'email' | 'phone' | 'role' | 'accountStatus'
  >,
): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
  };
}
