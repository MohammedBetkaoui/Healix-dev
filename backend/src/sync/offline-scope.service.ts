import { ForbiddenException, Injectable } from '@nestjs/common';
import { PatientAdministrativeStatus } from '@prisma/client';

import { UserRole } from '../common/enums/user-role.enum';
import { type OfflineActor } from '../offline-devices/offline-device.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OfflineScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async doctorProfileId(actor: OfflineActor) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!profile) throw new ForbiddenException('Profil médecin introuvable.');
    return profile.id;
  }

  async patientIds(actor: OfflineActor) {
    const doctorProfileId = await this.doctorProfileId(actor);
    const affiliationFilter =
      actor.role === UserRole.AFFILIATED_DOCTOR
        ? {
            OR: [
              { consultations: { some: { doctorProfileId } } },
              { appointments: { some: { doctorProfileId } } },
            ],
          }
        : {};
    const rows = await this.prisma.patient.findMany({
      where: {
        workspaceId: actor.workspaceId,
        administrativeStatus: PatientAdministrativeStatus.ACTIVE,
        ...affiliationFilter,
      },
      select: { id: true },
    });
    return { doctorProfileId, patientIds: rows.map((row) => row.id) };
  }
}
