import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ListNotificationsQueryDto,
  ReadAllNotificationsQueryDto,
} from './dto/list-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(user.sub, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.notifications.unreadCount(user.sub);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.notifications.getPreferences(user.sub);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.sub, dto);
  }

  @Patch('read-all')
  readAll(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ReadAllNotificationsQueryDto,
  ) {
    return this.notifications.markAllRead(user.sub, query.category);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthenticatedUserPayload, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  @Patch(':id/unread')
  unread(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.notifications.markUnread(user.sub, id);
  }

  @Patch(':id/archive')
  archive(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.notifications.archive(user.sub, id);
  }
}
