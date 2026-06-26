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
import { EstablishmentVerificationService } from './establishment/establishment-verification.service';
import { SubmitEstablishmentVerificationDto } from './establishment/dto/submit-establishment-verification.dto';
import { UpdateEstablishmentVerificationDto } from './establishment/dto/update-establishment-verification.dto';
import { UploadEstablishmentDocumentDto } from './establishment/dto/upload-establishment-document.dto';

@Controller('verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ESTABLISHMENT_ADMIN)
export class VerificationController {
  constructor(
    private readonly establishmentVerificationService: EstablishmentVerificationService,
  ) {}

  @Get('establishment/prefill')
  getEstablishmentPrefill(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.establishmentVerificationService.getPrefill(user.sub);
  }

  @Get('establishment/status')
  getEstablishmentStatus(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.establishmentVerificationService.getStatus(user.sub);
  }

  @Get('establishment/request')
  getEstablishmentRequest(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.establishmentVerificationService.getRequest(user.sub);
  }

  @Post('establishment/draft')
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
}
