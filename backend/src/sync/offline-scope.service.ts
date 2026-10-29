import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConsultationStatus, PatientAdministrativeStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { UserRole } from '../common/enums/user-role.enum';
import { type OfflineActor } from '../offline-devices/offline-device.types';
import { PrismaService } from '../prisma/prisma.service';

// PrismaService satisfies Prisma.TransactionClient; resolve(actor) runs on
// the shared client and resolve(actor, tx) shares the caller's transaction,
// which is what keeps the bootstrap and its cursor snapshot-consistent.
export type PrismaExecutor = Prisma.TransactionClient;

const DAY_MS = 86_400_000;

// The authoritative offline scope, computed by the server (never by the
// desktop) at every bootstrap and reconciliation.
//
// - ASSIGNED_CLINICAL_RELATIONSHIP (AFFILIATED_DOCTOR): a patient enters the
//   scope only while at least one authorised condition holds for this exact
//   doctorProfileId:
//     1. a consultation of the doctor created within the last
//        recentConsultationDays days, or still open (DRAFT / IN_PROGRESS —
//        an old unfinished consultation stays editable offline);
//     2. an appointment of the doctor scheduled in the appointment window
//        (upcomingAppointmentDays days to the past and to the future).
//   Seeing a patient once years ago no longer grants permanent offline
//   access: `consultations.some({ doctorProfileId })` without a temporal
//   filter is the exact bug this service replaced.
//
// - PRIVATE_PRACTICE_ACTIVE (INDEPENDENT_DOCTOR): deliberate V1 policy — the
//   workspace is the doctor's own cabinet, so every administratively active
//   patient of that workspace is authorized. This is an authorization to
//   keep the cabinet directory cached (workspace patient scope), documented
//   here, NOT a permanent offline grant across workspaces: a doctor with
//   several workspaces only receives their current one.
export type OfflinePatientScope = {
  doctorProfileId: string;
  policy: OfflineActor['offlineScope']['policy'];
  consultationWindowFrom: Date;
  appointmentWindowFrom: Date;
  appointmentWindowTo: Date;
  patientIds: string[];
};

@Injectable()
export class OfflineScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async doctorProfileId(
    actor: OfflineActor,
    executor: PrismaExecutor = this.prisma,
  ) {
    const profile = await executor.doctorProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!profile) throw new ForbiddenException('Profil médecin introuvable.');
    return profile.id;
  }

  // Resolves the scope inside `executor` (a transaction when snapshot
  // consistency matters) against the windows of `actor.offlineScope`.
  async resolve(
    actor: OfflineActor,
    executor: PrismaExecutor = this.prisma,
    now = new Date(),
  ): Promise<OfflinePatientScope> {
    const doctorProfileId = await this.doctorProfileId(actor, executor);
    const consultationWindowFrom = new Date(
      now.getTime() - actor.offlineScope.recentConsultationDays * DAY_MS,
    );
    const appointmentWindowFrom = new Date(
      now.getTime() - actor.offlineScope.upcomingAppointmentDays * DAY_MS,
    );
    const appointmentWindowTo = new Date(
      now.getTime() + actor.offlineScope.upcomingAppointmentDays * DAY_MS,
    );
    const rows = await executor.patient.findMany({
      where: this.patientWhere(actor, doctorProfileId, {
        consultationWindowFrom,
        appointmentWindowFrom,
        appointmentWindowTo,
      }),
      select: { id: true },
    });
    return {
      doctorProfileId,
      policy: actor.offlineScope.policy,
      consultationWindowFrom,
      appointmentWindowFrom,
      appointmentWindowTo,
      patientIds: rows.map((row) => row.id),
    };
  }

  private patientWhere(
    actor: OfflineActor,
    doctorProfileId: string,
    windows: {
      consultationWindowFrom: Date;
      appointmentWindowFrom: Date;
      appointmentWindowTo: Date;
    },
  ): Prisma.PatientWhereInput {
    const base: Prisma.PatientWhereInput = {
      workspaceId: actor.workspaceId,
      administrativeStatus: PatientAdministrativeStatus.ACTIVE,
    };
    if (actor.role !== UserRole.AFFILIATED_DOCTOR) {
      return base;
    }
    return {
      ...base,
      OR: [
        {
          consultations: {
            some: {
              doctorProfileId,
              OR: [
                { createdAt: { gte: windows.consultationWindowFrom } },
                {
                  status: {
                    in: [
                      ConsultationStatus.DRAFT,
                      ConsultationStatus.IN_PROGRESS,
                    ],
                  },
                },
              ],
            },
          },
        },
        {
          appointments: {
            some: {
              doctorProfileId,
              scheduledAt: {
                gte: windows.appointmentWindowFrom,
                lte: windows.appointmentWindowTo,
              },
            },
          },
        },
      ],
    };
  }
}
