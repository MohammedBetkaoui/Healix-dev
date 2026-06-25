import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { type Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { type AuthenticatedUserPayload } from '../types/authenticated-request.type';

function extractRefreshToken(request: Request): string | null {
  if (!request.cookies || typeof request.cookies.refresh_token !== 'string') {
    return null;
  }

  return request.cookies.refresh_token;
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractRefreshToken(request),
      ]),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: refreshSecret,
    });
  }

  validate(
    request: Request,
    payload: AuthenticatedUserPayload,
  ): AuthenticatedUserPayload {
    const refreshToken = extractRefreshToken(request);

    if (!refreshToken || payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Token de rafraichissement invalide.');
    }

    return {
      ...payload,
      refreshToken,
    };
  }
}
