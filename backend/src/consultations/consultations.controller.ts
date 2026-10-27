import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { ConsultationsService } from './consultations.service';
import { CancelConsultationDto } from './dto/cancel-consultation.dto';
import { CreateConsultationAddendumDto } from './dto/create-consultation-addendum.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { ListConsultationsQueryDto } from './dto/list-consultations-query.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

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

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateConsultationDto,
  ) {
    return this.consultations.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConsultationDto,
  ) {
    return this.consultations.update(user, id, dto);
  }

  @Post(':id/start')
  start(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.consultations.start(user, id);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.consultations.complete(user, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: CancelConsultationDto,
  ) {
    return this.consultations.cancel(user, id, dto);
  }

  @Post(':id/addenda')
  addAddendum(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateConsultationAddendumDto,
  ) {
    return this.consultations.addAddendum(user, id, dto);
  }

  @Get(':id/clinical-context')
  clinicalContext(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.consultations.clinicalContext(user, id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.consultations.findOne(user, id);
  }
}
