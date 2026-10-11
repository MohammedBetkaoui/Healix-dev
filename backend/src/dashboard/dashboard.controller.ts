import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { DashboardOverviewQueryDto } from './dashboard-overview.dto';
import { DashboardService } from './dashboard.service';

// The figures of the doctor and establishment dashboards, within the user's
// own workspace; an unverified account gets VERIFICATION_REQUIRED.
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
@Roles(
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.INDEPENDENT_DOCTOR,
  UserRole.AFFILIATED_DOCTOR,
)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  overview(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: DashboardOverviewQueryDto,
  ) {
    return this.dashboardService.getOverview(user, query.days);
  }
}
