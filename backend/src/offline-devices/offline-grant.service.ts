import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';

import { type UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';
import {
  type OfflineCapabilities,
  type OfflineGrantClaims,
  type OfflineScope,
} from './offline-device.types';

type SigningKeys = { privateKey: string; publicKey: string };

const decodePem = (value: string | undefined) => {
  if (!value) return undefined;
  if (value.includes('BEGIN ')) return value.replaceAll('\\n', '\n');
  return Buffer.from(value, 'base64').toString('utf8');
};

@Injectable()
export class OfflineGrantService {
  private readonly lifetimeHours: number;
  private readonly keys: SigningKeys;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.lifetimeHours = this.readLifetimeHours(
      config.get<string>('OFFLINE_GRANT_LIFETIME_HOURS'),
    );
    const privateKey = decodePem(
      config.get<string>('OFFLINE_GRANT_PRIVATE_KEY'),
    );
    const publicKey = decodePem(config.get<string>('OFFLINE_GRANT_PUBLIC_KEY'));
    if (privateKey && publicKey) {
      this.keys = { privateKey, publicKey };
    } else if (config.get<string>('NODE_ENV') === 'production') {
      throw new InternalServerErrorException(
        'Les clés de signature offline sont requises en production.',
      );
    } else {
      const generated = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.keys = generated;
    }
  }

  publicKey() {
    return this.keys.publicKey;
  }

  async issue(input: {
    deviceId: string;
    userId: string;
    workspaceId: string;
    role: UserRole;
    capabilities: OfflineCapabilities;
    scope: OfflineScope;
  }) {
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.lifetimeHours * 60 * 60 * 1000,
    );
    const grant = await this.prisma.offlineAccessGrant.create({
      data: {
        deviceId: input.deviceId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        role: input.role,
        offlineCapabilities: input.capabilities,
        offlineScope: input.scope,
        issuedAt,
        expiresAt,
      },
    });
    const claims: OfflineGrantClaims = {
      tokenType: 'offline-grant',
      grantId: grant.id,
      userId: input.userId,
      deviceId: input.deviceId,
      workspaceId: input.workspaceId,
      role: input.role,
      offlineCapabilities: input.capabilities,
      offlineScope: input.scope,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      iss: 'healixdz-api',
      aud: 'healixdz-desktop',
    };
    const token = await this.jwt.signAsync(claims, {
      algorithm: 'RS256',
      privateKey: this.keys.privateKey,
    });
    return { grant, token, publicKey: this.keys.publicKey };
  }

  verify(token: string) {
    return this.jwt.verifyAsync<OfflineGrantClaims>(token, {
      algorithms: ['RS256'],
      publicKey: this.keys.publicKey,
      issuer: 'healixdz-api',
      audience: 'healixdz-desktop',
    });
  }

  private readLifetimeHours(value: string | undefined) {
    const parsed = Number(value ?? '24');
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 168) return 24;
    return parsed;
  }
}
