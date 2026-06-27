import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { type Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { DoctorVerificationService } from './doctor/doctor-verification.service';
import { SubmitDoctorVerificationDto } from './doctor/dto/submit-doctor-verification.dto';
import { UpdateDoctorVerificationDto } from './doctor/dto/update-doctor-verification.dto';
import { UploadDoctorDocumentDto } from './doctor/dto/upload-doctor-document.dto';
import { EstablishmentVerificationService } from './establishment/establishment-verification.service';
import { SubmitEstablishmentVerificationDto } from './establishment/dto/submit-establishment-verification.dto';
import { UpdateEstablishmentVerificationDto } from './establishment/dto/update-establishment-verification.dto';
import { UploadEstablishmentDocumentDto } from './establishment/dto/upload-establishment-document.dto';

@Controller('verification')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationController {
  constructor(
    private readonly establishmentVerificationService: EstablishmentVerificationService,
    private readonly doctorVerificationService: DoctorVerificationService,
  ) {}

  @Get('establishment/prefill')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  getEstablishmentPrefill(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.establishmentVerificationService.getPrefill(user.sub);
  }

  @Get('establishment/status')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  getEstablishmentStatus(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.establishmentVerificationService.getStatus(user.sub);
  }

  @Get('establishment/request')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  getEstablishmentRequest(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.establishmentVerificationService.getRequest(user.sub);
  }

  @Post('establishment/draft')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  createEstablishmentDraft(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateEstablishmentVerificationDto,
    @Req() request: Request,
  ) {
    return this.establishmentVerificationService.createDraft(user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch('establishment/draft')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  updateEstablishmentDraft(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateEstablishmentVerificationDto,
    @Req() request: Request,
  ) {
    return this.establishmentVerificationService.updateDraft(user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('establishment/upload-document')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadEstablishmentDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UploadEstablishmentDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
  ) {
    return this.establishmentVerificationService.uploadDocument(
      user.sub,
      {
        documentType: dto.documentType,
        file,
      },
      {
        ipAddress: request.ip,
        userAgent: request.get('user-agent') ?? null,
      },
    );
  }

  @Delete('establishment/document/:documentId')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  deleteEstablishmentDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('documentId') documentId: string,
    @Req() request: Request,
  ) {
    return this.establishmentVerificationService.deleteDocument(
      user.sub,
      documentId,
      {
        ipAddress: request.ip,
        userAgent: request.get('user-agent') ?? null,
      },
    );
  }

  @Post('establishment/submit')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  submitEstablishmentVerification(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: SubmitEstablishmentVerificationDto,
    @Req() request: Request,
  ) {
    return this.establishmentVerificationService.submit(user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Get('doctor/prefill')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  getDoctorPrefill(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.doctorVerificationService.getPrefill(user.sub);
  }

  @Get('doctor/status')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  getDoctorStatus(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.doctorVerificationService.getStatus(user.sub);
  }

  @Get('doctor/request')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  getDoctorRequest(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.doctorVerificationService.getRequest(user.sub);
  }

  @Post('doctor/draft')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  createDoctorDraft(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateDoctorVerificationDto,
    @Req() request: Request,
  ) {
    return this.doctorVerificationService.createDraft(user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch('doctor/draft')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  updateDoctorDraft(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateDoctorVerificationDto,
    @Req() request: Request,
  ) {
    return this.doctorVerificationService.updateDraft(user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('doctor/upload-document')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadDoctorDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UploadDoctorDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
  ) {
    return this.doctorVerificationService.uploadDocument(
      user.sub,
      {
        documentType: dto.documentType,
        file,
      },
      {
        ipAddress: request.ip,
        userAgent: request.get('user-agent') ?? null,
      },
    );
  }

  @Delete('doctor/document/:documentId')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  deleteDoctorDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('documentId') documentId: string,
    @Req() request: Request,
  ) {
    return this.doctorVerificationService.deleteDocument(user.sub, documentId, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('doctor/submit')
  @Roles(UserRole.INDEPENDENT_DOCTOR)
  submitDoctorVerification(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: SubmitDoctorVerificationDto,
    @Req() request: Request,
  ) {
    return this.doctorVerificationService.submit(user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }
}
