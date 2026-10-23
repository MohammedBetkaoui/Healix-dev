import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { CancelPrescriptionDto } from './dto/cancel-prescription.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { ListPrescriptionsQueryDto } from './dto/list-prescriptions-query.dto';
import { MedicationSearchQueryDto } from './dto/medication-search-query.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { PrescriptionsService } from './prescriptions.service';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ListPrescriptionsQueryDto,
  ) {
    return this.prescriptions.list(user, query);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.prescriptions.stats(user);
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.prescriptions.capabilities(user);
  }

  @Get('medications')
  medications(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: MedicationSearchQueryDto,
  ) {
    return this.prescriptions.medications(user, query);
  }

  @Get('prescriber-context')
  prescriberContext(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.prescriptions.prescriberContext(user);
  }

  @Get('patients/:patientId/context')
  patientContext(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('patientId') patientId: string,
  ) {
    return this.prescriptions.patientContext(user, patientId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.prescriptions.create(user, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.prescriptions.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    return this.prescriptions.update(user, id, dto);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.prescriptions.submit(user, id);
  }

  @Post(':id/validate')
  validate(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.prescriptions.validate(user, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: CancelPrescriptionDto,
  ) {
    return this.prescriptions.cancel(user, id, dto);
  }

  @Post(':id/renew')
  renew(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.prescriptions.renew(user, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.prescriptions.remove(user, id);
  }

  @Get(':id/history')
  history(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.prescriptions.history(user, id);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const document = await this.prescriptions.getPdf(user, id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(document.pdf.length));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.fileName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(document.pdf);
  }

  @Post(':id/printed')
  printed(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.prescriptions.markPrinted(user, id);
  }
}
