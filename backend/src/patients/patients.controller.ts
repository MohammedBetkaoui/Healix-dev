import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  Res,
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
import { CheckPatientDuplicateQueryDto } from './dto/check-patient-duplicate-query.dto';
import { CreatePatientAiAnalysisDto } from './dto/create-patient-ai-analysis.dto';
import { CreatePatientConsultationDto } from './dto/create-patient-consultation.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UploadPatientDocumentDto } from './dto/upload-patient-document.dto';
import { UpsertPatientConsentDto } from './dto/upsert-patient-consent.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
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

  @Get(':id/consultations')
  listConsultations(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.patientsService.listConsultations(user, id);
  }

  @Post(':id/consultations')
  createConsultation(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: CreatePatientConsultationDto,
  ) {
    return this.patientsService.createConsultation(user, id, dto);
  }

  @Get(':id/documents')
  listDocuments(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.patientsService.listDocuments(user, id);
  }

  // Streams the file inline for the clinical viewer; each consultation is
  // audited (DOCUMENT_VIEWED).
  @Get(':id/documents/:documentId/view')
  async viewDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    const document = await this.patientsService.getDocumentStream(
      user,
      id,
      documentId,
    );

    // A .dcm upload may have no browser-provided MIME type: it is stored
    // empty, so the file is served as opaque bytes (never sniffed).
    response.setHeader(
      'Content-Type',
      document.mimeType || 'application/octet-stream',
    );
    response.setHeader('Content-Length', String(document.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.originalName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    // Without a listener, a read error (file removed mid-stream) would be an
    // unhandled 'error' event and stop the process.
    document.stream.on('error', () => {
      if (!response.headersSent) {
        response.status(404).end();
      } else {
        response.destroy();
      }
    });
    document.stream.pipe(response);
  }

  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UploadPatientDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.patientsService.uploadDocument(user, id, dto, file);
  }

  @Get(':id/ai-analyses')
  listAiAnalyses(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.patientsService.listAiAnalyses(user, id);
  }

  @Post(':id/ai-analyses')
  createAiAnalysis(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: CreatePatientAiAnalysisDto,
  ) {
    return this.patientsService.createAiAnalysis(user, id, dto);
  }

  @Get(':id/audit-log')
  listAuditLog(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.patientsService.listAuditLog(user, id);
  }
}
