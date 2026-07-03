import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AccountType } from '../common/enums/account-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionPlansService } from './plans/subscription-plans.service';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ESTABLISHMENT_ADMIN, UserRole.INDEPENDENT_DOCTOR)
export class SubscriptionsController {
  constructor(
    private readonly plansService: SubscriptionPlansService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('plans')
  async listPlans(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query('accountType') accountType?: AccountType,
  ) {
    const resolvedAccountType =
      accountType ?? this.plansService.mapRoleToAccountType(user.role);
    const plans = await this.plansService.listPlans(resolvedAccountType);

    return {
      data: plans.map((plan) => this.plansService.toPublicPlan(plan)),
    };
  }

  @Get('me')
  getMySubscription(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.subscriptionsService.getMySubscription(user.sub);
  }
}
