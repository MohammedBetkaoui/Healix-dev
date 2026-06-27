import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { type Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UserRole } from '../../common/enums/user-role.enum';
import { type AdminAuthenticatedUserPayload } from '../types/admin-authenticated-request.type';

function extractAdminRefreshToken(request: Request): string | null {
  if (
    !request.cookies ||
    typeof request.cookies.admin_refresh_token !== 'string'
  ) {
    return null;
  }

  return request.cookies.admin_refresh_token;
}

@Injectable()
export class AdminRefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'admin-jwt-refresh',
) {
  constructor(configService: ConfigService) {
    const refreshSecret = configService.get<string>('ADMIN_JWT_REFRESH_SECRET');

    if (!refreshSecret) {
      throw new Error('ADMIN_JWT_REFRESH_SECRET is not configured.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractAdminRefreshToken(request),
      ]),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: refreshSecret,
    });
  }

  validate(
    request: Request,
    payload: AdminAuthenticatedUserPayload,
  ): AdminAuthenticatedUserPayload {
    const refreshToken = extractAdminRefreshToken(request);
    const isAdminRole =
      payload.role === UserRole.SUPER_ADMIN ||
      payload.role === UserRole.ADMIN_VERIFICATION;

    if (!refreshToken || payload.tokenType !== 'admin-refresh' || !isAdminRole) {
      throw new UnauthorizedException('Session administrateur invalide.');
    }

    return {
      ...payload,
      refreshToken,
    };
  }
}
