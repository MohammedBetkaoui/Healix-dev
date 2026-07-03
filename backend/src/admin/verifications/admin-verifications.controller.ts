import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { type AdminAuthenticatedRequest } from '../../admin-auth/types/admin-authenticated-request.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { getRequestContext } from '../../common/utils/request-context';
import { AdminVerificationsService } from './admin-verifications.service';
import { ApproveVerificationDto } from './dto/approve-verification.dto';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';
import { RejectVerificationDto } from './dto/reject-verification.dto';

@Controller('admin/verifications')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION)
export class AdminVerificationsController {
  constructor(
    private readonly verificationsService: AdminVerificationsService,
  ) {}

  @Get()
  listVerifications(@Query() query: ListVerificationsQueryDto) {
    return this.verificationsService.listVerifications(query);
  }

  @Get(':id')
  getVerificationById(
    @Param('id') id: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.verificationsService.getVerificationById(
      id,
      request.user.sub,
      getRequestContext(request),
    );
  }

  @Patch(':id/approve')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  approveVerification(
    @Param('id') id: string,
    @Body() dto: ApproveVerificationDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.verificationsService.approveVerification(
      id,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Patch(':id/reject')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  rejectVerification(
    @Param('id') id: string,
    @Body() dto: RejectVerificationDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.verificationsService.rejectVerification(
      id,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Get(':id/documents/:documentId/view')
  async viewDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() request: AdminAuthenticatedRequest,
    @Res() response: Response,
  ) {
    const document = await this.verificationsService.getDocumentStream(
      id,
      documentId,
      request.user.sub,
      'inline',
      getRequestContext(request),
    );

    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Length', String(document.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.originalName)}"`,
    );

    document.stream.pipe(response);
  }

  @Get(':id/documents/:documentId/download')
  async downloadDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() request: AdminAuthenticatedRequest,
    @Res() response: Response,
  ) {
    const document = await this.verificationsService.getDocumentStream(
      id,
      documentId,
      request.user.sub,
      'attachment',
      getRequestContext(request),
    );

    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Length', String(document.size));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.originalName)}"`,
    );

    document.stream.pipe(response);
  }
}
