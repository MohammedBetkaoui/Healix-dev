import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountStatus, WorkspaceMembershipStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  type OfflineAuthenticatedRequest,
  type OfflineCapabilities,
  type OfflineScope,
} from './offline-device.types';
import { OfflineGrantService } from './offline-grant.service';

@Injectable()
export class OfflineGrantGuard implements CanActivate {
  constructor(
    private readonly grants: OfflineGrantService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<OfflineAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';
    if (!token) throw new UnauthorizedException('Grant offline requis.');

    try {
      const claims = await this.grants.verify(token);
      if (claims.tokenType !== 'offline-grant') throw new Error('token type');
      const now = new Date();
      const grant = await this.prisma.offlineAccessGrant.findUnique({
        where: { id: claims.grantId },
        include: {
          device: true,
          user: { select: { accountStatus: true, role: true } },
        },
      });
      if (
        !grant ||
        grant.revokedAt ||
        grant.expiresAt <= now ||
        grant.device.revokedAt ||
        grant.user.accountStatus !== AccountStatus.ACTIVE ||
        grant.user.role !== claims.role ||
        grant.userId !== claims.userId ||
        grant.deviceId !== claims.deviceId ||
        grant.workspaceId !== claims.workspaceId
      ) {
        throw new Error('inactive grant');
      }
      const membership = await this.prisma.workspaceMembership.findFirst({
        where: {
          userId: grant.userId,
          workspaceId: grant.workspaceId,
          status: WorkspaceMembershipStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!membership) throw new Error('inactive membership');

      await this.prisma.offlineDevice.update({
        where: { id: grant.deviceId },
        data: { lastSeenAt: now },
      });
      request.offlineActor = {
        grantId: grant.id,
        userId: grant.userId,
        deviceId: grant.deviceId,
        workspaceId: grant.workspaceId,
        role: claims.role,
        offlineCapabilities: grant.offlineCapabilities as OfflineCapabilities,
        offlineScope: grant.offlineScope as OfflineScope,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Grant offline invalide ou expiré.');
    }
  }
}
