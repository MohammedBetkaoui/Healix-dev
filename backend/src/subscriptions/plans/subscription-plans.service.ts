import { BadRequestException, Injectable } from '@nestjs/common';

import { type SubscriptionPlan } from '@prisma/client';
import { AccountType } from '../../common/enums/account-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(accountType: AccountType): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: {
        monthlyPrice: 'asc',
      },
      where: {
        accountType,
        active: true,
      },
    });
  }

  mapRoleToAccountType(role: UserRole): AccountType {
    if (role === UserRole.ESTABLISHMENT_ADMIN) {
      return AccountType.ESTABLISHMENT;
    }

    if (role === UserRole.INDEPENDENT_DOCTOR) {
      return AccountType.INDEPENDENT_DOCTOR;
    }

    throw new BadRequestException('Type de compte non pris en charge.');
  }

  toPublicPlan(plan: SubscriptionPlan) {
    return {
      id: plan.id,
      name: plan.name,
      code: plan.code,
      accountType: plan.accountType,
      description: plan.description,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      currency: plan.currency,
      features: plan.features,
      limits: plan.limits,
      recommended: plan.recommended,
      custom: plan.custom,
    };
  }
}
