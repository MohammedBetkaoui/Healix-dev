import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { getRequestContext } from '../common/utils/request-context';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateOpeningHoursDto } from './dto/update-opening-hours.dto';
import { actorOf } from './organization-authorization.service';
import { OrganizationService } from './organization.service';

// No VerifiedAccountGuard here on purpose: the workspace authorization below
// already resolves the ACTIVE establishment membership, and a DOCTOR member
// whose profile is still DRAFT must be able to read the basic identity of
// where they work. Verification gating stays on the clinical endpoints.
@Controller('establishment/organization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @Roles(UserRole.ESTABLISHMENT_ADMIN, UserRole.AFFILIATED_DOCTOR)
  async getOrganization(
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return this.organizationService.getOrganization(actorOf(user));
  }

  // Professional contacts, default appointment duration and DPO contact.
  @Patch()
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async updateOrganization(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateOrganizationDto,
    @Req() request: Request,
  ) {
    return this.organizationService.updateOrganization(
      actorOf(user),
      dto,
      getRequestContext(request),
    );
  }

  // The weekly schedule: its own endpoint, its own validation.
  @Patch('opening-hours')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async updateOpeningHours(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateOpeningHoursDto,
    @Req() request: Request,
  ) {
    return this.organizationService.updateOpeningHours(
      actorOf(user),
      dto,
      getRequestContext(request),
    );
  }
}
