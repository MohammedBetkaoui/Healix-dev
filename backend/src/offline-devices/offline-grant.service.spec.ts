import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UserRole } from '../common/enums/user-role.enum';
import { type PrismaService } from '../prisma/prisma.service';
import {
  OFFLINE_CAPABILITIES,
  type OfflineScope,
} from './offline-device.types';
import { OfflineGrantService } from './offline-grant.service';

describe('OfflineGrantService', () => {
  it('issues an asymmetric, locally verifiable and expiring grant', async () => {
    const grant = {
      id: 'grant-1',
      deviceId: 'device-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    const prisma = {
      offlineAccessGrant: {
        create: jest.fn().mockResolvedValue(grant),
      },
    } as unknown as PrismaService;
    const config = new ConfigService({
      NODE_ENV: 'test',
      OFFLINE_GRANT_LIFETIME_HOURS: '24',
    });
    const service = new OfflineGrantService(prisma, new JwtService(), config);
    const scope: OfflineScope = {
      policy: 'PRIVATE_PRACTICE_ACTIVE',
      recentConsultationDays: 90,
      upcomingAppointmentDays: 30,
    };

    const issued = await service.issue({
      deviceId: grant.deviceId,
      userId: grant.userId,
      workspaceId: grant.workspaceId,
      role: UserRole.INDEPENDENT_DOCTOR,
      capabilities: OFFLINE_CAPABILITIES,
      scope,
    });
    const claims = await service.verify(issued.token);

    expect(issued.token.split('.')).toHaveLength(3);
    expect(issued.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(claims).toMatchObject({
      tokenType: 'offline-grant',
      grantId: grant.id,
      deviceId: grant.deviceId,
      workspaceId: grant.workspaceId,
      offlineScope: scope,
    });
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });
});
