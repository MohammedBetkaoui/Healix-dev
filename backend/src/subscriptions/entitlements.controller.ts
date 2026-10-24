import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { EntitlementsService } from './entitlements.service';

// Open to the affiliated doctors too: they work under the subscription of
// their establishment, and the interface needs to know when it is read-only.
@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.INDEPENDENT_DOCTOR,
  UserRole.AFFILIATED_DOCTOR,
)
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  // canManage: the account that pays (an establishment, an independent
  // doctor) can choose a plan and pay; an affiliated doctor depends on the
  // subscription of their establishment and can only see it.
  @Get('entitlements')
  async getEntitlements(@CurrentUser() user: AuthenticatedUserPayload) {
    return {
      ...(await this.entitlements.getEntitlementsForUser(user)),
      canManage: user.role !== UserRole.AFFILIATED_DOCTOR,
    };
  }
}
