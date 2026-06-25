import { Injectable } from '@nestjs/common';

import { type Establishment, type Prisma } from '@prisma/client';
import { type EstablishmentType } from '../common/enums/establishment-type.enum';
import { type SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { type VerificationStatus } from '../common/enums/verification-status.enum';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CreateEstablishmentInput = {
  name: string;
  type: EstablishmentType;
  wilaya: string;
  address: string;
  professionalEmail: string;
  phone: string;
  managerFullName: string;
  verificationStatus: VerificationStatus;
  subscriptionStatus: SubscriptionStatus;
  ownerId: string;
};

@Injectable()
export class EstablishmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createEstablishment(
    input: CreateEstablishmentInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<Establishment> {
    return client.establishment.create({
      data: {
        name: input.name,
        type: input.type,
        wilaya: input.wilaya,
        address: input.address,
        professionalEmail: input.professionalEmail,
        phone: input.phone,
        managerFullName: input.managerFullName,
        verificationStatus: input.verificationStatus,
        subscriptionStatus: input.subscriptionStatus,
        owner: {
          connect: {
            id: input.ownerId,
          },
        },
      },
    });
  }
}
