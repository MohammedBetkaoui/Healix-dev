import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Request, type Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ThrottlePerUser } from '../common/guards/app-throttler.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { getRequestContext } from '../common/utils/request-context';
import { CaseRecordService } from './case-record.service';
import {
  EditMessageDto,
  FileToRecordDto,
  ListMessagesQueryDto,
  MarkReadDto,
  SendMessageDto,
} from './dto/messages.dto';
import { MessagesService } from './messages.service';
import { MESSAGING_ROLES } from './messaging-rules';

// Messages, read positions and the unread badge (docs/messaging-design.md,
// section 5). Plain text only; the client renders it, links included.
@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
@Roles(...MESSAGING_ROLES)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly caseRecordService: CaseRecordService,
  ) {}

  @Get('conversations/:id/messages')
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messagesService.list(user, id, query);
  }

  // 201 with the new message, 200 with the one its clientMessageId already
  // sent. 30 messages per minute and per user.
  @Post('conversations/:id/messages')
  @ThrottlePerUser({ limit: 30, ttl: 60_000 })
  async send(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { message, created } = await this.messagesService.send(user, id, dto);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return message;
  }

  // "Is typing": 204, sent to the other participants at most every 3 s.
  @Post('conversations/:id/typing')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ThrottlePerUser({ limit: 20, ttl: 60_000 })
  typing(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.messagesService.typing(user, id);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.messagesService.markRead(user, id, dto.seq);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.messagesService.unreadCount(user);
  }

  @Patch('messages/:id')
  edit(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
    @Req() request: Request,
  ) {
    return this.messagesService.edit(user, id, dto, getRequestContext(request));
  }

  @Delete('messages/:id')
  remove(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.messagesService.remove(user, id, getRequestContext(request));
  }

  // Who saw a message, and when (reciprocal read receipts); the sender is
  // not listed.
  @Get('messages/:id/readers')
  readers(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.messagesService.readers(user, id);
  }

  // The acknowledgement of an urgent message, by a recipient; idempotent.
  @Post('messages/:id/ack')
  @HttpCode(HttpStatus.OK)
  ack(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.messagesService.ack(user, id, getRequestContext(request));
  }

  // CASE: the message copied to the patient record. 201 with the new note,
  // 200 with the one this message already gave.
  @Post('messages/:id/file-to-record')
  async fileToRecord(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: FileToRecordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { note, created } = await this.caseRecordService.fileToRecord(
      user,
      id,
      dto.comment,
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return note;
  }
}
