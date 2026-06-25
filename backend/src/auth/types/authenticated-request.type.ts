import { type Request } from 'express';

import { type UserRole } from '../../common/enums/user-role.enum';

export type AuthenticatedUserPayload = {
  sub: string;
  email: string;
  role: UserRole;
  tokenType: 'access' | 'refresh';
  refreshToken?: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUserPayload;
};
