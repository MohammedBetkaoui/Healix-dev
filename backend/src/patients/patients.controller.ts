import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CheckPatientDuplicateQueryDto } from './dto/check-patient-duplicate-query.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpsertPatientConsentDto } from './dto/upsert-patient-consent.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreatePatientDto,
  ) {
    return this.patientsService.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ListPatientsQueryDto,
  ) {
    return this.patientsService.list(user, query);
  }

  // Must stay above the ':id' route below, otherwise Nest would match
  // "check-duplicate" as an :id value.
  @Get('check-duplicate')
  checkDuplicate(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: CheckPatientDuplicateQueryDto,
  ) {
    return this.patientsService.checkDuplicate(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.patientsService.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(user, id, dto);
  }

  @Get(':id/consents')
  listConsents(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.patientsService.listConsents(user, id);
  }

  @Put(':id/consents/:type')
  upsertConsent(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('type') type: string,
    @Body() dto: UpsertPatientConsentDto,
  ) {
    return this.patientsService.upsertConsent(user, id, type, dto);
  }
}
