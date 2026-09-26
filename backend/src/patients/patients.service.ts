import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Patient, type Prisma } from '@prisma/client';

import {
  createPaginationMeta,
  getPagination,
} from '../admin/shared/admin-pagination.util';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from '../common/utils/sanitize';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

type PatientOwnerScope = {
  establishmentId: string | null;
  doctorProfileId: string | null;
};

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUserPayload, dto: CreatePatientDto) {
    const scope = await this.resolveOwnerScope(user);

    const patient = await this.prisma.patient.create({
      data: {
        firstName: sanitizeTextInput(dto.firstName),
        firstNameAr: sanitizeTextInput(dto.firstNameAr),
        lastName: sanitizeTextInput(dto.lastName),
        lastNameAr: sanitizeTextInput(dto.lastNameAr),
        gender: dto.gender,
        birthDate: new Date(dto.birthDate),
        nationalId: sanitizeTextInput(dto.nationalId),
        bloodGroup: dto.bloodGroup,
        phone: sanitizePhone(dto.phone),
        email: dto.email ? normalizeEmail(dto.email) : undefined,
        address: sanitizeTextInput(dto.address),
        wilaya: sanitizeTextInput(dto.wilaya),
        commune: sanitizeTextInput(dto.commune),
        emergencyContactName: sanitizeTextInput(dto.emergencyContactName),
        emergencyContactPhone: sanitizePhone(dto.emergencyContactPhone),
        insurance: dto.insurance,
        insuredNumber: dto.insuredNumber
          ? sanitizeTextInput(dto.insuredNumber)
          : undefined,
        sector: dto.sector,
        hospitalRecordNumber: dto.hospitalRecordNumber
          ? sanitizeTextInput(dto.hospitalRecordNumber)
          : undefined,
        smsEnabled: dto.smsEnabled ?? true,
        establishmentId: scope.establishmentId ?? undefined,
        doctorProfileId: scope.doctorProfileId ?? undefined,
      },
    });

    return this.toPatientResponse(patient);
  }

  async list(user: AuthenticatedUserPayload, query: ListPatientsQueryDto) {
    const scope = await this.resolveOwnerScope(user);
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where = this.buildWhere(scope, query);

    const [total, patients] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: patients.map((patient) => this.toPatientResponse(patient)),
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async findOne(user: AuthenticatedUserPayload, id: string) {
    const scope = await this.resolveOwnerScope(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id, ...this.scopeToWhere(scope) },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable.');
    }

    return this.toPatientResponse(patient);
  }

  async update(
    user: AuthenticatedUserPayload,
    id: string,
    dto: UpdatePatientDto,
  ) {
    const scope = await this.resolveOwnerScope(user);
    const existing = await this.prisma.patient.findFirst({
      where: { id, ...this.scopeToWhere(scope) },
    });

    if (!existing) {
      throw new NotFoundException('Patient introuvable.');
    }

    const patient = await this.prisma.patient.update({
      where: { id: existing.id },
      data: this.toUpdateInput(dto),
    });

    return this.toPatientResponse(patient);
  }

  private async resolveOwnerScope(
    user: AuthenticatedUserPayload,
  ): Promise<PatientOwnerScope> {
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
          "Vous n'êtes pas autorisé à accéder aux patients.",
        );
    }
  }

  private scopeToWhere(scope: PatientOwnerScope): Prisma.PatientWhereInput {
    return scope.establishmentId
      ? { establishmentId: scope.establishmentId }
      : { doctorProfileId: scope.doctorProfileId };
  }

  private buildWhere(
    scope: PatientOwnerScope,
    query: ListPatientsQueryDto,
  ): Prisma.PatientWhereInput {
    const where: Prisma.PatientWhereInput = { ...this.scopeToWhere(scope) };

    if (query.search) {
      const search = sanitizeTextInput(query.search);
      where.OR = [
        { firstName: { contains: search } },
        { firstNameAr: { contains: search } },
        { lastName: { contains: search } },
        { lastNameAr: { contains: search } },
        { nationalId: { contains: search } },
        { phone: { contains: search } },
        { hospitalRecordNumber: { contains: search } },
      ];
    }

    if (query.gender) {
      where.gender = query.gender;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.administrativeStatus) {
      where.administrativeStatus = query.administrativeStatus;
    }

    if (query.insurance) {
      where.insurance = query.insurance;
    }

    if (query.sector) {
      where.sector = query.sector;
    }

    if (query.bloodGroup) {
      where.bloodGroup = query.bloodGroup;
    }

    if (query.wilaya) {
      where.wilaya = sanitizeTextInput(query.wilaya);
    }

    return where;
  }

  private toUpdateInput(dto: UpdatePatientDto): Prisma.PatientUpdateInput {
    return {
      firstName: this.sanitizeOptional(dto.firstName),
      firstNameAr: this.sanitizeOptional(dto.firstNameAr),
      lastName: this.sanitizeOptional(dto.lastName),
      lastNameAr: this.sanitizeOptional(dto.lastNameAr),
      gender: dto.gender,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      nationalId: this.sanitizeOptional(dto.nationalId),
      bloodGroup: dto.bloodGroup,
      phone: dto.phone ? sanitizePhone(dto.phone) : undefined,
      email: dto.email ? normalizeEmail(dto.email) : undefined,
      address: this.sanitizeOptional(dto.address),
      wilaya: this.sanitizeOptional(dto.wilaya),
      commune: this.sanitizeOptional(dto.commune),
      emergencyContactName: this.sanitizeOptional(dto.emergencyContactName),
      emergencyContactPhone: dto.emergencyContactPhone
        ? sanitizePhone(dto.emergencyContactPhone)
        : undefined,
      insurance: dto.insurance,
      insuredNumber: this.sanitizeOptional(dto.insuredNumber),
      sector: dto.sector,
      hospitalRecordNumber: this.sanitizeOptional(dto.hospitalRecordNumber),
      status: dto.status,
      administrativeStatus: dto.administrativeStatus,
      smsEnabled: dto.smsEnabled,
    };
  }

  private sanitizeOptional(value: string | undefined): string | undefined {
    return value === undefined ? undefined : sanitizeTextInput(value);
  }

  private toPatientResponse(patient: Patient) {
    return {
      id: patient.id,
      firstName: patient.firstName,
      firstNameAr: patient.firstNameAr,
      lastName: patient.lastName,
      lastNameAr: patient.lastNameAr,
      gender: patient.gender,
      birthDate: patient.birthDate,
      nationalId: patient.nationalId,
      bloodGroup: patient.bloodGroup,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      wilaya: patient.wilaya,
      commune: patient.commune,
      emergencyContactName: patient.emergencyContactName,
      emergencyContactPhone: patient.emergencyContactPhone,
      insurance: patient.insurance,
      insuredNumber: patient.insuredNumber,
      sector: patient.sector,
      hospitalRecordNumber: patient.hospitalRecordNumber,
      status: patient.status,
      administrativeStatus: patient.administrativeStatus,
      smsEnabled: patient.smsEnabled,
      establishmentId: patient.establishmentId,
      doctorProfileId: patient.doctorProfileId,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }
}
