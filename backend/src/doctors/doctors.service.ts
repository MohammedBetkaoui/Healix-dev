import { Injectable } from '@nestjs/common';

import { type DoctorProfile, type Prisma } from '@prisma/client';
import { type SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { type VerificationStatus } from '../common/enums/verification-status.enum';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CreateIndependentDoctorProfileInput = {
  userId: string;
  speciality: string;
  wilaya: string;
  professionalAddress: string;
  verificationStatus: VerificationStatus;
  subscriptionStatus: SubscriptionStatus;
};

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
