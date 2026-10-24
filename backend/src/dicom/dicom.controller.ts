import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { type Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresActiveSubscription } from '../common/decorators/requires-active-subscription.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { DicomImportService } from './dicom-import.service';
import { DicomStudiesService } from './dicom-studies.service';
import {
  DICOM_UPLOAD_FIELD,
  DicomUploadDirInterceptor,
  dicomUploadLimits,
  dicomUploadStorage,
} from './dicom-upload';
import { DICOM_IMPORT_LIMITS } from './dicom-zip';
import { RenderDicomInstanceQueryDto } from './dto/render-dicom-instance-query.dto';
import { UploadDicomStudyDto } from './dto/upload-dicom-study.dto';

// DICOM studies of the patient records. Same guards as the patient record
// itself; importing and deleting are writes, so they need a live
// subscription, while reading keeps working on a read-only account.
@Controller('dicom')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard, SubscriptionGuard)
@Roles(
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.AFFILIATED_DOCTOR,
  UserRole.INDEPENDENT_DOCTOR,
)
export class DicomController {
  constructor(
    private readonly importService: DicomImportService,
    private readonly studies: DicomStudiesService,
  ) {}

  // Several .dcm files, or one .zip (field "files"), and the patientId. Up to
  // 512 MiB (Caddy lifts its usual 21 MiB limit for this route only).
  @Post('studies/upload')
  @RequiresActiveSubscription()
  @UseInterceptors(
    DicomUploadDirInterceptor,
    FilesInterceptor(DICOM_UPLOAD_FIELD, DICOM_IMPORT_LIMITS.maxFiles, {
      limits: dicomUploadLimits,
      storage: dicomUploadStorage,
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UploadDicomStudyDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.importService.import(user, dto.patientId, files ?? []);
  }

  @Get('patients/:patientId/studies')
  listForPatient(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('patientId') patientId: string,
  ) {
    return this.studies.listForPatient(user, patientId);
  }

  @Get('studies/:id')
  findOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.studies.findOne(user, id);
  }

  // The slice as an 8-bit PNG, rendered by Orthanc.
  @Get('instances/:orthancInstanceId/preview')
  async preview(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orthancInstanceId') orthancInstanceId: string,
    @Query() query: RenderDicomInstanceQueryDto,
    @Res() response: Response,
  ) {
    const png = await this.studies.renderInstance(user, orthancInstanceId, {
      windowCenter: query.windowCenter,
      windowWidth: query.windowWidth,
    });
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', String(png.length));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(png);
  }

  @Delete('studies/:id')
  @RequiresActiveSubscription()
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.studies.remove(user, id);
  }
}
