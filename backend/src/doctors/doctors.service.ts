import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type DoctorProfile, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { AccountStatus } from '../common/enums/account-status.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateAffiliatedDoctorDto } from './dto/create-affiliated-doctor.dto';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CreateIndependentDoctorProfileInput = {
  userId: string;
  speciality: string;
  wilaya: string;
  professionalAddress: string;
  verificationStatus: VerificationStatus;
  subscriptionStatus: SubscriptionStatus;
};

type CreateAffiliatedDoctorResponse = {
  doctorProfile: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    speciality: string;
    wilaya: string;
  };
  temporaryPassword: string;
};

type AffiliatedDoctorSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  speciality: string;
  wilaya: string;
  accountStatus: string;
};

@Injectable()
export class DoctorsService {
  private readonly saltRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    configService: ConfigService,
  ) {
    this.saltRounds = this.parseSaltRounds(
      configService.get<string>('BCRYPT_SALT_ROUNDS'),
    );
  }

  async createIndependentDoctorProfile(
    input: CreateIndependentDoctorProfileInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<DoctorProfile> {
    return client.doctorProfile.create({
      data: {
        userId: input.userId,
        speciality: input.speciality,
        wilaya: input.wilaya,
        professionalAddress: input.professionalAddress,
        isIndependent: true,
        establishmentId: null,
        verificationStatus: input.verificationStatus,
        subscriptionStatus: input.subscriptionStatus,
      },
    });
  }

  async createAffiliatedDoctor(
    establishmentId: string,
    dto: CreateAffiliatedDoctorDto,
  ): Promise<CreateAffiliatedDoctorResponse> {
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.hashPassword(temporaryPassword);

    const { user, doctorProfile } = await this.prisma.$transaction(
      async (transaction) => {
        await this.usersService.ensureEmailAndPhoneAvailable(
          dto.email,
          dto.phone,
          transaction,
        );

        const createdUser = await this.usersService.createUser(
          {
            fullName: dto.fullName,
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            role: UserRole.AFFILIATED_DOCTOR,
            accountStatus: AccountStatus.ACTIVE,
          },
          transaction,
        );

        const createdDoctorProfile = await transaction.doctorProfile.create({
          data: {
            userId: createdUser.id,
            speciality: dto.speciality,
            wilaya: dto.wilaya,
            professionalAddress: dto.professionalAddress,
            isIndependent: false,
            establishmentId,
            verificationStatus: VerificationStatus.VERIFIED,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
          },
        });

        return { user: createdUser, doctorProfile: createdDoctorProfile };
      },
    );

    return {
      doctorProfile: {
        id: doctorProfile.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        speciality: doctorProfile.speciality,
        wilaya: doctorProfile.wilaya,
      },
      temporaryPassword,
    };
  }

  async listAffiliatedDoctors(
    establishmentId: string,
  ): Promise<AffiliatedDoctorSummary[]> {
    const doctorProfiles = await this.prisma.doctorProfile.findMany({
      where: { establishmentId },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            phone: true,
            accountStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return doctorProfiles.map((doctorProfile) => ({
      id: doctorProfile.id,
      fullName: doctorProfile.user.fullName,
      email: doctorProfile.user.email,
      phone: doctorProfile.user.phone,
      speciality: doctorProfile.speciality,
      wilaya: doctorProfile.wilaya,
      accountStatus: doctorProfile.user.accountStatus,
    }));
  }

  async resetAffiliatedDoctorPassword(
    establishmentId: string,
    doctorProfileId: string,
  ): Promise<{ temporaryPassword: string }> {
    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorProfileId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    // Same message whether the profile is missing or belongs elsewhere, so
    // the endpoint never reveals doctors outside the caller's establishment.
    if (
      !doctorProfile ||
      doctorProfile.establishmentId !== establishmentId ||
      doctorProfile.isIndependent
    ) {
      throw new NotFoundException('Médecin introuvable.');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.hashPassword(temporaryPassword);

    // A password change must invalidate every existing session.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: doctorProfile.userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: doctorProfile.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { temporaryPassword };
  }

  // ~12 base64url characters, well above the 8-character minimum enforced
  // elsewhere on user-chosen passwords.
  private generateTemporaryPassword(): string {
    return randomBytes(9).toString('base64url');
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  private parseSaltRounds(value: string | undefined): number {
    const parsedValue = Number(value);

    if (Number.isInteger(parsedValue) && parsedValue >= 10) {
      return parsedValue;
    }

    return 12;
  }
}
