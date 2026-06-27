import { type Request } from 'express';
import { type UserRole } from '../../common/enums/user-role.enum';

export type AdminAuthenticatedUserPayload = {
  sub: string;
  email: string;
  role: UserRole;
  tokenType: 'admin-access' | 'admin-refresh';
  refreshToken?: string;
};

export type AdminAuthenticatedRequest = Request & {
  user: AdminAuthenticatedUserPayload;
};
