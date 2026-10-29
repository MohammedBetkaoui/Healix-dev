import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  VerificationStatus,
  WorkspaceType,
} from '@prisma/client';
import { createPublicKey } from 'node:crypto';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import { RegisterOfflineDeviceDto } from './dto/register-offline-device.dto';
import {
  OFFLINE_CAPABILITIES,
  type OfflineScope,
} from './offline-device.types';
import { OfflineGrantService } from './offline-grant.service';

@Injectable()
export class OfflineDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly grants: OfflineGrantService,
  ) {}

  async register(
    user: AuthenticatedUserPayload,
    dto: RegisterOfflineDeviceDto,
  ) {
    const clinical = await this.resolveClinicalContext(user);
    this.assertValidPublicKey(dto.publicKey);
    const existing = await this.prisma.offlineDevice.findUnique({
      where: {
        userId_workspaceId_installationId: {
          userId: user.sub,
          workspaceId: clinical.workspaceId,
          installationId: dto.installationId,
        },
      },
    });
    if (existing?.revokedAt) {
      // Re-registration never resurrects a device the user explicitly
      // revoked: it would silently hand back a key the deployer considers
      // compromised. A deliberate call to reauthorize() does.
      throw new ForbiddenException(
        'Appareil révoqué; une réautorisation explicite est requise.',
      );
    }
    if (existing && existing.publicKey !== dto.publicKey.trim()) {
      // Same installation but a different key: treat that as a key rotation,
      // never a silent swap. The active grants of the device are revoked (they
      // authenticate a key that no longer exists), the key is updated, and a
      // fresh grant is issued against the rotated key.
      const rotatedAt = new Date();
      const [, device] = await this.prisma.$transaction([
        this.prisma.offlineAccessGrant.updateMany({
          where: { deviceId: existing.id, revokedAt: null },
          data: { revokedAt: rotatedAt },
        }),
        this.prisma.offlineDevice.update({
          where: { id: existing.id },
          data: {
            deviceName: dto.deviceName.trim(),
            platform: dto.platform,
            publicKey: dto.publicKey.trim(),
            revokedAt: null,
          },
        }),
      ]);
      const issued = await this.issueGrant(user, device.id, clinical);
      return {
        device: this.toPublicDevice(device),
        offlineAccessGrant: issued.token,
        grantExpiresAt: issued.grant.expiresAt,
        grantVerificationPublicKey: issued.publicKey,
        offlineCapabilities: OFFLINE_CAPABILITIES,
        offlineScope: clinical.scope,
        keyRotated: true,
      };
    }
    const device = await this.prisma.offlineDevice.upsert({
      where: {
        userId_workspaceId_installationId: {
          userId: user.sub,
          workspaceId: clinical.workspaceId,
          installationId: dto.installationId,
        },
      },
      create: {
        installationId: dto.installationId,
        userId: user.sub,
        workspaceId: clinical.workspaceId,
        deviceName: dto.deviceName.trim(),
        platform: dto.platform,
        publicKey: dto.publicKey.trim(),
      },
      update: {
        deviceName: dto.deviceName.trim(),
        platform: dto.platform,
        lastSeenAt: new Date(),
      },
    });
    const issued = await this.issueGrant(user, device.id, clinical);
    return {
      device: this.toPublicDevice(device),
      offlineAccessGrant: issued.token,
      grantExpiresAt: issued.grant.expiresAt,
      grantVerificationPublicKey: issued.publicKey,
      offlineCapabilities: OFFLINE_CAPABILITIES,
      offlineScope: clinical.scope,
    };
  }

  // Explicit re-authorization of an explicitly revoked device: the owner
  // decides on purpose, the stale grants are already gone, and a fresh one
  // is issued only afterwards.
  async reauthorize(user: AuthenticatedUserPayload, deviceId: string) {
    const clinical = await this.resolveClinicalContext(user);
    const device = await this.prisma.offlineDevice.findFirst({
      where: {
        id: deviceId,
        userId: user.sub,
        workspaceId: clinical.workspaceId,
      },
    });
    if (!device) throw new NotFoundException('Appareil introuvable.');
    if (!device.revokedAt) {
      throw new BadRequestException(
        'Cet appareil n’est pas révoqué; utilisez le renouvellement de grant.',
      );
    }
    const now = new Date();
    const restored = await this.prisma.offlineDevice.update({
      where: { id: device.id },
      data: { revokedAt: null },
    });
    const issued = await this.issueGrant(user, device.id, clinical);
    return {
      device: this.toPublicDevice(restored),
      offlineAccessGrant: issued.token,
      grantExpiresAt: issued.grant.expiresAt,
      grantVerificationPublicKey: issued.publicKey,
      offlineCapabilities: OFFLINE_CAPABILITIES,
      offlineScope: clinical.scope,
      reauthorizedAt: now,
    };
  }

  async list(user: AuthenticatedUserPayload) {
    const devices = await this.prisma.offlineDevice.findMany({
      where: { userId: user.sub },
      orderBy: [{ revokedAt: 'asc' }, { lastSeenAt: 'desc' }],
    });
    return { data: devices.map((device) => this.toPublicDevice(device)) };
  }

  async renew(user: AuthenticatedUserPayload, deviceId: string) {
    const clinical = await this.resolveClinicalContext(user);
    const device = await this.prisma.offlineDevice.findFirst({
      where: {
        id: deviceId,
        userId: user.sub,
        workspaceId: clinical.workspaceId,
        revokedAt: null,
      },
    });
    if (!device) throw new NotFoundException('Appareil autorisé introuvable.');
    const issued = await this.issueGrant(user, device.id, clinical);
    return {
      offlineAccessGrant: issued.token,
      grantExpiresAt: issued.grant.expiresAt,
      grantVerificationPublicKey: issued.publicKey,
      offlineCapabilities: OFFLINE_CAPABILITIES,
      offlineScope: clinical.scope,
    };
  }

  async revoke(user: AuthenticatedUserPayload, deviceId: string) {
    const device = await this.prisma.offlineDevice.findFirst({
      where: { id: deviceId, userId: user.sub },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Appareil introuvable.');
    const revokedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.offlineDevice.update({
        where: { id: device.id },
        data: { revokedAt },
      }),
      this.prisma.offlineAccessGrant.updateMany({
        where: { deviceId: device.id, revokedAt: null },
        data: { revokedAt },
      }),
    ]);
    return { message: 'Appareil révoqué.', revokedAt };
  }

  private async resolveClinicalContext(user: AuthenticatedUserPayload) {
    if (
      user.role !== UserRole.INDEPENDENT_DOCTOR &&
      user.role !== UserRole.AFFILIATED_DOCTOR
    ) {
      throw new ForbiddenException(
        "L'accès offline V1 est réservé aux médecins actifs.",
      );
    }
    const workspace = await this.workspaceContext.resolveWorkspaceForUser({
      userId: user.sub,
      role: user.role,
    });
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        accountStatus: true,
        doctorProfile: { select: { id: true, verificationStatus: true } },
      },
    });
    if (
      !account?.doctorProfile ||
      account.accountStatus !== AccountStatus.ACTIVE ||
      account.doctorProfile.verificationStatus !==
        VerificationStatus.VERIFIED ||
      account.doctorProfile.id !== workspace.doctorProfileId
    ) {
      throw new ForbiddenException('Profil médecin actif et vérifié requis.');
    }
    const scope: OfflineScope = {
      policy:
        workspace.workspaceType === WorkspaceType.PRIVATE_PRACTICE
          ? 'PRIVATE_PRACTICE_ACTIVE'
          : 'ASSIGNED_CLINICAL_RELATIONSHIP',
      recentConsultationDays: 90,
      upcomingAppointmentDays: 30,
    };
    return {
      ...workspace,
      doctorProfileId: account.doctorProfile.id,
      scope,
    };
  }

  private issueGrant(
    user: AuthenticatedUserPayload,
    deviceId: string,
    clinical: Awaited<
      ReturnType<OfflineDevicesService['resolveClinicalContext']>
    >,
  ) {
    return this.grants.issue({
      deviceId,
      userId: user.sub,
      workspaceId: clinical.workspaceId,
      role: user.role,
      capabilities: OFFLINE_CAPABILITIES,
      scope: clinical.scope,
    });
  }

  private assertValidPublicKey(publicKey: string) {
    try {
      createPublicKey(publicKey);
    } catch {
      throw new BadRequestException(
        "La clé publique de l'appareil est invalide.",
      );
    }
  }

  private toPublicDevice(device: {
    id: string;
    installationId: string;
    deviceName: string;
    platform: string;
    registeredAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
  }) {
    return {
      id: device.id,
      installationId: device.installationId,
      deviceName: device.deviceName,
      platform: device.platform,
      registeredAt: device.registeredAt,
      lastSeenAt: device.lastSeenAt,
      revokedAt: device.revokedAt,
    };
  }
}
