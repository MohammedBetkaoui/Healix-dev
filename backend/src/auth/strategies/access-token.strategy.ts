import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { type Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { type AuthenticatedUserPayload } from '../types/authenticated-request.type';

function extractAccessToken(request: Request): string | null {
  if (!request.cookies || typeof request.cookies.access_token !== 'string') {
    return null;
  }

  return request.cookies.access_token;
}

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(configService: ConfigService) {
    const accessSecret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is not configured.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractAccessToken(request),
      ]),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  validate(payload: AuthenticatedUserPayload): AuthenticatedUserPayload {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException("Token d'acces invalide.");
    }

    return payload;
  }
}
