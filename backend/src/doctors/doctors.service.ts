import { Injectable } from '@nestjs/common';
import {
  SubscriptionStatus,
  type DoctorProfile,
  type Prisma,
} from '@prisma/client';

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

// The one piece the registration flow needs: the doctor profile of a
// self-registered doctor. Affiliated doctors no longer live here — they are
// invited (workspace invitations), their profile starts DRAFT and goes
// through the professional verification flow. Nothing here ever invents a
// password for somebody, and nothing here is an admin endpoint any more.
@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  createIndependentDoctorProfile(
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
