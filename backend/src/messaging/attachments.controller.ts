import { pipeline } from 'node:stream';

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { Roles } from '../common/decorators/roles.decorator';
import { ThrottlePerUser } from '../common/guards/app-throttler.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { AttachmentsService } from './attachments.service';
import { AttachmentFromRecordDto } from './dto/attachments.dto';
import { ATTACHMENT_MAX_BYTES, MESSAGING_ROLES } from './messaging-rules';

// The files of the messaging (docs/messaging-design.md, lot 4): uploaded
// before the message that sends them, downloaded by the participants only.
@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
@Roles(...MESSAGING_ROLES)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // Multipart, field "file". One byte over 10 MB still reaches the service,
  // which answers ATTACHMENT_TOO_LARGE; beyond, multer stops the upload.
  @Post('conversations/:id/attachments')
  @ThrottlePerUser({ limit: 10, ttl: 60_000 })
  @UseInterceptors(
    FileInterceptor('file', {
      defParamCharset: 'utf8',
      limits: { fileSize: ATTACHMENT_MAX_BYTES + 1, files: 1 },
      storage: memoryStorage(),
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.attachmentsService.upload(user, id, file);
  }

  // CASE: a document of the patient record, shared without copy.
  @Post('conversations/:id/attachments/from-record')
  @ThrottlePerUser({ limit: 10, ttl: 60_000 })
  fromRecord(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: AttachmentFromRecordDto,
  ) {
    return this.attachmentsService.fromRecord(user, id, dto.patientDocumentId);
  }

  // Always a download (never shown inline by the browser), never cached.
  @Get('attachments/:id')
  async download(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.attachmentsService.download(user, id);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    // A failure while streaming (altered file, checksum) cuts the response:
    // the browser never gets a complete, wrong file.
    pipeline(file.stream, response, (error) => {
      if (!error) return;
      if (!response.headersSent) {
        response.status(404).end();
      } else {
        response.destroy();
      }
    });
  }
}
