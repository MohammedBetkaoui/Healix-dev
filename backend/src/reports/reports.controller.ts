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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Response } from 'express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { CancelReportDto } from './dto/cancel-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ImportReportDto } from './dto/import-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ListReportsQueryDto,
  ) {
    return this.reports.list(user, query);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.reports.stats(user);
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.reports.capabilities(user);
  }

  @Get('patients/:patientId')
  patientReports(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('patientId') patientId: string,
  ) {
    return this.reports.patientReports(user, patientId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateReportDto,
  ) {
    return this.reports.create(user, dto);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  importDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: ImportReportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.reports.importDocument(user, dto, file);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.reports.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.reports.update(user, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.reports.remove(user, id);
  }

  @Post(':id/finalize')
  finalize(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.reports.finalize(user, id);
  }

  @Post(':id/amend')
  amend(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.reports.amend(user, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: CancelReportDto,
  ) {
    return this.reports.cancel(user, id, dto);
  }

  @Get(':id/history')
  history(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.reports.history(user, id);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const document = await this.reports.getPdf(user, id);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Length', String(document.file.length));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.fileName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(document.file);
  }
}
