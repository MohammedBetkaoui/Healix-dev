import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { type Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UserRole } from '../../common/enums/user-role.enum';
import { type AdminAuthenticatedUserPayload } from '../types/admin-authenticated-request.type';

function extractAdminAccessToken(request: Request): string | null {
  if (
    !request.cookies ||
    typeof request.cookies.admin_access_token !== 'string'
  ) {
    return null;
  }

  return request.cookies.admin_access_token;
}

@Injectable()
export class AdminAccessTokenStrategy extends PassportStrategy(
  Strategy,
  'admin-jwt-access',
) {
  constructor(configService: ConfigService) {
    const accessSecret = configService.get<string>('ADMIN_JWT_ACCESS_SECRET');

    if (!accessSecret) {
      throw new Error('ADMIN_JWT_ACCESS_SECRET is not configured.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractAdminAccessToken(request),
      ]),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  validate(
    payload: AdminAuthenticatedUserPayload,
  ): AdminAuthenticatedUserPayload {
    const isAdminRole =
      payload.role === UserRole.SUPER_ADMIN ||
      payload.role === UserRole.ADMIN_VERIFICATION;

    if (payload.tokenType !== 'admin-access' || !isAdminRole) {
      throw new UnauthorizedException('Session administrateur invalide.');
    }

    return payload;
  }
}
