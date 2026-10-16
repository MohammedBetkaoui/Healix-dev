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
import { ConversationsService } from './conversations.service';
import {
  AddParticipantsDto,
  CreateConversationDto,
  ListConversationsQueryDto,
  UpdateConversationDto,
} from './dto/conversations.dto';
import { MESSAGING_ROLES } from './messaging-rules';

// Conversations of the verified professionals (docs/messaging-design.md,
// section 5). Anything about a conversation the caller is not in is a 404.
@Controller('messaging/conversations')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
@Roles(...MESSAGING_ROLES)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversationsService.list(user, query);
  }

  // 201 when created, 200 with the existing DIRECT conversation of the pair.
  @Post()
  @ThrottlePerUser({ limit: 20, ttl: 60 * 60_000 })
  async create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateConversationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { conversation, created } = await this.conversationsService.create(
      user,
      dto,
      getRequestContext(request),
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return conversation;
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.conversationsService.getOne(user, id);
  }

  // Title (GROUP, its OWNER), archiving, muting (the caller's own).
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(user, id, dto);
  }

  @Post(':id/participants')
  @HttpCode(HttpStatus.OK)
  addParticipants(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: AddParticipantsDto,
    @Req() request: Request,
  ) {
    return this.conversationsService.addParticipants(
      user,
      id,
      dto.userIds,
      getRequestContext(request),
    );
  }

  // The OWNER removes a member; with their own id, a member leaves.
  @Delete(':id/participants/:userId')
  removeParticipant(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() request: Request,
  ) {
    return this.conversationsService.removeParticipant(
      user,
      id,
      userId,
      getRequestContext(request),
    );
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.conversationsService.accept(user, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.conversationsService.decline(user, id);
  }
}
