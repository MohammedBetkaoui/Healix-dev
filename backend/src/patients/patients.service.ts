import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Patient,
  type PatientConsent,
  type Prisma,
} from '@prisma/client';

import {
  createPaginationMeta,
  getPagination,
} from '../admin/shared/admin-pagination.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PatientConsentType } from '../common/enums/patient-consent-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from '../common/utils/sanitize';
import { PrismaService } from '../prisma/prisma.service';
import { CheckPatientDuplicateQueryDto } from './dto/check-patient-duplicate-query.dto';
import { CreatePatientConsultationDto } from './dto/create-patient-consultation.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpsertPatientConsentDto } from './dto/upsert-patient-consent.dto';
import { findPatientMatches } from './patient-matching.util';

type PatientOwnerScope = {
  establishmentId: string | null;
  doctorProfileId: string | null;
};

type PatientConsultationWithDoctor = Prisma.PatientConsultationGetPayload<{
  include: {
    doctorProfile: { include: { user: { select: { fullName: true } } } };
  };
}>;

const consultationDoctorInclude = {
  doctorProfile: { include: { user: { select: { fullName: true } } } },
} as const;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

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

    if (dto.duplicateOverrideReason) {
      await this.logDuplicateOverride(user, scope, dto, patient.id);
    }

    return this.toPatientResponse(patient);
  }

  async checkDuplicate(
    user: AuthenticatedUserPayload,
    query: CheckPatientDuplicateQueryDto,
  ) {
    const scope = await this.resolveOwnerScope(user);
    const candidates = await this.prisma.patient.findMany({
      where: this.scopeToWhere(scope),
    });

    const matches = findPatientMatches(query, candidates);

    return {
      matches: matches.map((match) => ({
        patient: this.toPatientResponse(match.patient),
        reasons: match.reasons,
      })),
    };
  }

  private async logDuplicateOverride(
    user: AuthenticatedUserPayload,
    scope: PatientOwnerScope,
    dto: CreatePatientDto,
    createdPatientId: string,
  ): Promise<void> {
    const otherPatients = await this.prisma.patient.findMany({
      where: { ...this.scopeToWhere(scope), id: { not: createdPatientId } },
    });
    const matchedPatientIds = findPatientMatches(dto, otherPatients).map(
      (match) => match.patient.id,
    );

    await this.auditLogsService.createAuditLog({
      userId: user.sub,
      action: 'PATIENT_CREATED_WITH_DUPLICATE_OVERRIDE',
      entityType: 'Patient',
      entityId: createdPatientId,
      metadata: {
        justification: dto.duplicateOverrideReason,
        matchedPatientIds,
      },
    });
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
    const patient = await this.getPatientInScope(user, id);
    return this.toPatientResponse(patient);
  }

  async update(
    user: AuthenticatedUserPayload,
    id: string,
    dto: UpdatePatientDto,
  ) {
    const existing = await this.getPatientInScope(user, id);

    const patient = await this.prisma.patient.update({
      where: { id: existing.id },
      data: this.toUpdateInput(dto),
    });

    return this.toPatientResponse(patient);
  }

  async listConsents(user: AuthenticatedUserPayload, patientId: string) {
    await this.getPatientInScope(user, patientId);

    const consents = await this.prisma.patientConsent.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
    });

    return consents.map((consent) => this.toConsentResponse(consent));
  }

  async upsertConsent(
    user: AuthenticatedUserPayload,
    patientId: string,
    type: string,
    dto: UpsertPatientConsentDto,
  ) {
    await this.getPatientInScope(user, patientId);
    this.assertValidConsentType(type);

    const consentType = type as PatientConsentType;
    const documentName = dto.documentName
      ? sanitizeTextInput(dto.documentName)
      : null;

    const consent = await this.prisma.patientConsent.upsert({
      where: { patientId_type: { patientId, type: consentType } },
      create: {
        patientId,
        type: consentType,
        status: dto.status,
        documentName,
        recordedAt: new Date(),
        recordedById: user.sub,
      },
      update: {
        status: dto.status,
        documentName,
        recordedAt: new Date(),
        recordedById: user.sub,
      },
    });

    return this.toConsentResponse(consent);
  }

  async listConsultations(user: AuthenticatedUserPayload, patientId: string) {
    await this.getPatientInScope(user, patientId);

    const consultations = await this.prisma.patientConsultation.findMany({
      where: { patientId },
      include: consultationDoctorInclude,
      orderBy: { date: 'desc' },
    });

    return consultations.map((consultation) =>
      this.toConsultationResponse(consultation),
    );
  }

  async createConsultation(
    user: AuthenticatedUserPayload,
    patientId: string,
    dto: CreatePatientConsultationDto,
  ) {
    await this.getPatientInScope(user, patientId);
    this.assertCanCreateConsultation(user.role);

    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: user.sub },
    });

    if (!doctorProfile) {
      throw new NotFoundException('Profil médecin introuvable.');
    }

    const consultation = await this.prisma.patientConsultation.create({
      data: {
        patientId,
        doctorProfileId: doctorProfile.id,
        date: new Date(dto.date),
        reason: sanitizeTextInput(dto.reason),
        diagnosis: sanitizeTextInput(dto.diagnosis),
        treatment: sanitizeTextInput(dto.treatment),
      },
      include: consultationDoctorInclude,
    });

    return this.toConsultationResponse(consultation);
  }

  private assertCanCreateConsultation(role: UserRole): void {
    if (
      role !== UserRole.AFFILIATED_DOCTOR &&
      role !== UserRole.INDEPENDENT_DOCTOR
    ) {
      throw new ForbiddenException(
        "Seul un médecin peut créer une consultation.",
      );
    }
  }

  private toConsultationResponse(consultation: PatientConsultationWithDoctor) {
    return {
      id: consultation.id,
      patientId: consultation.patientId,
      date: consultation.date,
      reason: consultation.reason,
      diagnosis: consultation.diagnosis,
      treatment: consultation.treatment,
      doctor: consultation.doctorProfile?.user.fullName ?? '',
      createdAt: consultation.createdAt,
      updatedAt: consultation.updatedAt,
    };
  }

  private async getPatientInScope(
    user: AuthenticatedUserPayload,
    id: string,
  ): Promise<Patient> {
    const scope = await this.resolveOwnerScope(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id, ...this.scopeToWhere(scope) },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable.');
    }

    return patient;
  }

  private assertValidConsentType(type: string): void {
    if (
      !Object.values(PatientConsentType).includes(
        type as PatientConsentType,
      )
    ) {
      throw new BadRequestException('Type de consentement invalide.');
    }
  }

  private toConsentResponse(consent: PatientConsent) {
    return {
      id: consent.id,
      patientId: consent.patientId,
      type: consent.type,
      status: consent.status,
      documentName: consent.documentName,
      recordedAt: consent.recordedAt,
      recordedById: consent.recordedById,
      createdAt: consent.createdAt,
      updatedAt: consent.updatedAt,
    };
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
