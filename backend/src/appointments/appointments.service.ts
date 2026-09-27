import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { AppointmentStatus } from '../common/enums/appointment-status.enum';
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

const appointmentInclude = {
  patient: {
    select: {
      firstName: true,
      lastName: true,
      firstNameAr: true,
      lastNameAr: true,
    },
  },
  doctorProfile: { select: { user: { select: { fullName: true } } } },
} as const;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

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

    const scheduledAt = new Date(dto.scheduledAt);
    const durationMinutes = dto.durationMinutes ?? 30;
    await this.assertNoOverlap(doctorProfileId, scheduledAt, durationMinutes);

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        doctorProfileId,
        scheduledAt,
        durationMinutes,
        reason: sanitizeTextInput(dto.reason),
        createdById: user.sub,
      },
      include: appointmentInclude,
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
      include: appointmentInclude,
      orderBy: { scheduledAt: 'asc' },
    });

    return appointments.map((appointment) =>
      this.toAppointmentResponse(appointment),
    );
  }

  // Doctors the caller may book with: the whole establishment for
  // ESTABLISHMENT_ADMIN / AFFILIATED_DOCTOR, only themselves for
  // INDEPENDENT_DOCTOR — same scope rule create() enforces.
  async listDoctors(user: AuthenticatedUserPayload) {
    const scope = await this.resolveOwnerScope(user);

    const doctorProfiles = await this.prisma.doctorProfile.findMany({
      where: scope.establishmentId
        ? { establishmentId: scope.establishmentId }
        : { id: scope.doctorProfileId as string },
      select: {
        id: true,
        speciality: true,
        user: { select: { fullName: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });

    return doctorProfiles.map((doctorProfile) => ({
      id: doctorProfile.id,
      fullName: doctorProfile.user.fullName,
      speciality: doctorProfile.speciality,
    }));
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

    // doctorProfileId is never part of UpdateAppointmentDto (not reassignable
    // from this endpoint), so existing.doctorProfileId is always the right
    // doctor to re-check against.
    if (dto.scheduledAt !== undefined || dto.durationMinutes !== undefined) {
      const scheduledAt = dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : existing.scheduledAt;
      const durationMinutes = dto.durationMinutes ?? existing.durationMinutes;
      await this.assertNoOverlap(
        existing.doctorProfileId,
        scheduledAt,
        durationMinutes,
        existing.id,
      );
    }

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
      include: appointmentInclude,
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

  // MySQL/Prisma can't express interval-overlap arithmetic in a `where`
  // clause, so this pulls the doctor's active appointments within a generous
  // ±12h window of the target slot and filters the classic overlap test
  // (existing.start < newEnd AND existing.end > newStart) in memory.
  // CANCELED/NO_SHOW appointments never block a slot.
  private async assertNoOverlap(
    doctorProfileId: string,
    scheduledAt: Date,
    durationMinutes: number,
    excludeAppointmentId?: string,
  ): Promise<void> {
    const newStart = scheduledAt;
    const newEnd = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
    const windowStart = new Date(scheduledAt.getTime() - 12 * 60 * 60_000);
    const windowEnd = new Date(scheduledAt.getTime() + 12 * 60 * 60_000);

    const candidates = await this.prisma.appointment.findMany({
      where: {
        doctorProfileId,
        status: {
          notIn: [AppointmentStatus.CANCELED, AppointmentStatus.NO_SHOW],
        },
        scheduledAt: { gte: windowStart, lte: windowEnd },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
    });

    const hasOverlap = candidates.some((candidate) => {
      const candidateStart = candidate.scheduledAt;
      const candidateEnd = new Date(
        candidateStart.getTime() + candidate.durationMinutes * 60_000,
      );
      return candidateStart < newEnd && candidateEnd > newStart;
    });

    if (hasOverlap) {
      throw new ConflictException(
        'Ce créneau chevauche un autre rendez-vous du même médecin.',
      );
    }
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
  ): Promise<AppointmentWithRelations> {
    const scope = await this.resolveOwnerScope(user);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, ...this.scopeToWhere(scope) },
      include: appointmentInclude,
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

  private toAppointmentResponse(appointment: AppointmentWithRelations) {
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
      patientFirstName: appointment.patient.firstName,
      patientLastName: appointment.patient.lastName,
      patientFirstNameAr: appointment.patient.firstNameAr,
      patientLastNameAr: appointment.patient.lastNameAr,
      doctorFullName: appointment.doctorProfile.user.fullName,
    };
  }
}
