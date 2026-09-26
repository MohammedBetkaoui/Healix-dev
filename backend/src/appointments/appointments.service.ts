import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Appointment, type Prisma } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentAuditService } from './appointment-audit.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

type AppointmentOwnerScope = {
  establishmentId: string | null;
  doctorProfileId: string | null;
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointmentAuditService: AppointmentAuditService,
  ) {}

  async create(user: AuthenticatedUserPayload, dto: CreateAppointmentDto) {
    const scope = await this.resolveOwnerScope(user);
    const doctorProfileId = await this.resolveCreateDoctorProfileId(
      scope,
      dto.doctorProfileId,
    );

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, ...this.patientScopeWhere(scope) },
    });

    if (!patient) {
      throw new ForbiddenException(
        "Ce patient n'appartient pas à votre périmètre.",
      );
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        doctorProfileId,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes ?? 30,
        reason: sanitizeTextInput(dto.reason),
        createdById: user.sub,
      },
    });

    await this.appointmentAuditService.log(
      user,
      'APPOINTMENT_CREATED',
      appointment.id,
      { patientId: appointment.patientId, doctorProfileId },
    );

    return this.toAppointmentResponse(appointment);
  }

  async list(user: AuthenticatedUserPayload, query: ListAppointmentsQueryDto) {
    const scope = await this.resolveOwnerScope(user);
    const where = this.buildWhere(scope, query);

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });

    return appointments.map((appointment) =>
      this.toAppointmentResponse(appointment),
    );
  }

  async findOne(user: AuthenticatedUserPayload, id: string) {
    const appointment = await this.getAppointmentInScope(user, id);
    return this.toAppointmentResponse(appointment);
  }

  async update(
    user: AuthenticatedUserPayload,
    id: string,
    dto: UpdateAppointmentDto,
  ) {
    const existing = await this.getAppointmentInScope(user, id);

    const appointment = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        durationMinutes: dto.durationMinutes,
        reason: dto.reason ? sanitizeTextInput(dto.reason) : undefined,
        status: dto.status,
        notes:
          dto.notes === undefined ? undefined : sanitizeTextInput(dto.notes),
      },
    });

    if (dto.status && dto.status !== existing.status) {
      await this.appointmentAuditService.log(
        user,
        'APPOINTMENT_STATUS_CHANGED',
        appointment.id,
        { from: existing.status, to: appointment.status },
      );
    }

    if (
      dto.scheduledAt &&
      new Date(dto.scheduledAt).getTime() !== existing.scheduledAt.getTime()
    ) {
      await this.appointmentAuditService.log(
        user,
        'APPOINTMENT_RESCHEDULED',
        appointment.id,
        { from: existing.scheduledAt, to: appointment.scheduledAt },
      );
    }

    return this.toAppointmentResponse(appointment);
  }

  private async resolveCreateDoctorProfileId(
    scope: AppointmentOwnerScope,
    requestedDoctorProfileId: string,
  ): Promise<string> {
    if (scope.doctorProfileId) {
      // INDEPENDENT_DOCTOR: never trust the client-supplied value.
      return scope.doctorProfileId;
    }

    const doctorProfile = await this.prisma.doctorProfile.findFirst({
      where: {
        id: requestedDoctorProfileId,
        establishmentId: scope.establishmentId,
      },
    });

    if (!doctorProfile) {
      throw new ForbiddenException(
        "Ce médecin n'appartient pas à votre établissement.",
      );
    }

    return doctorProfile.id;
  }

  private async getAppointmentInScope(
    user: AuthenticatedUserPayload,
    id: string,
  ): Promise<Appointment> {
    const scope = await this.resolveOwnerScope(user);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, ...this.scopeToWhere(scope) },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable.');
    }

    return appointment;
  }

  private async resolveOwnerScope(
    user: AuthenticatedUserPayload,
  ): Promise<AppointmentOwnerScope> {
    switch (user.role) {
      case UserRole.INDEPENDENT_DOCTOR: {
        const doctorProfile = await this.prisma.doctorProfile.findUnique({
          where: { userId: user.sub },
        });

        if (!doctorProfile) {
          throw new NotFoundException('Profil médecin introuvable.');
        }

        return { establishmentId: null, doctorProfileId: doctorProfile.id };
      }

      case UserRole.ESTABLISHMENT_ADMIN: {
        const establishment = await this.prisma.establishment.findUnique({
          where: { ownerId: user.sub },
        });

        if (!establishment) {
          throw new NotFoundException('Établissement introuvable.');
        }

        return { establishmentId: establishment.id, doctorProfileId: null };
      }

      case UserRole.AFFILIATED_DOCTOR: {
        const doctorProfile = await this.prisma.doctorProfile.findUnique({
          where: { userId: user.sub },
        });

        if (!doctorProfile?.establishmentId) {
          throw new NotFoundException(
            "Établissement d'affiliation introuvable.",
          );
        }

        return {
          establishmentId: doctorProfile.establishmentId,
          doctorProfileId: null,
        };
      }

      default:
        throw new ForbiddenException(
          "Vous n'êtes pas autorisé à accéder aux rendez-vous.",
        );
    }
  }

  // Appointment has no establishmentId column: an establishment-wide scope
  // (ESTABLISHMENT_ADMIN / AFFILIATED_DOCTOR) is filtered through the
  // doctorProfile relation instead — the full agenda of every doctor in the
  // establishment, consistent with the scope already used for Patient.
  private scopeToWhere(
    scope: AppointmentOwnerScope,
  ): Prisma.AppointmentWhereInput {
    // Appointment.doctorProfileId is never null (a doctor is always
    // required), unlike Patient.doctorProfileId — the scope invariant
    // guarantees this branch only runs when it is set.
    return scope.establishmentId
      ? { doctorProfile: { establishmentId: scope.establishmentId } }
      : { doctorProfileId: scope.doctorProfileId as string };
  }

  private patientScopeWhere(
    scope: AppointmentOwnerScope,
  ): Prisma.PatientWhereInput {
    return scope.establishmentId
      ? { establishmentId: scope.establishmentId }
      : { doctorProfileId: scope.doctorProfileId };
  }

  private buildWhere(
    scope: AppointmentOwnerScope,
    query: ListAppointmentsQueryDto,
  ): Prisma.AppointmentWhereInput {
    const where: Prisma.AppointmentWhereInput = {
      ...this.scopeToWhere(scope),
      scheduledAt: {
        gte: new Date(query.from),
        lte: new Date(query.to),
      },
    };

    if (query.patientId) {
      where.patientId = query.patientId;
    }

    if (query.doctorProfileId) {
      where.doctorProfileId = query.doctorProfileId;
    }

    if (query.status) {
      where.status = query.status;
    }

    return where;
  }

  private toAppointmentResponse(appointment: Appointment) {
    return {
      id: appointment.id,
      patientId: appointment.patientId,
      doctorProfileId: appointment.doctorProfileId,
      scheduledAt: appointment.scheduledAt,
      durationMinutes: appointment.durationMinutes,
      reason: appointment.reason,
      status: appointment.status,
      notes: appointment.notes,
      createdById: appointment.createdById,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    };
  }
}
