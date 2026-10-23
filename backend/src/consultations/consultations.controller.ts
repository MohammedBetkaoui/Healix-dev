import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { ConsultationsService } from './consultations.service';
import { ListConsultationsQueryDto } from './dto/list-consultations-query.dto';

// Read-only: consultations are recorded from the patient record
// (POST /patients/:id/consultations) and are not edited afterwards.
@Controller('consultations')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ListConsultationsQueryDto,
  ) {
    return this.consultations.list(user, query);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.consultations.stats(user);
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.consultations.capabilities(user);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.consultations.findOne(user, id);
  }
}
