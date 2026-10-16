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
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { getRequestContext } from '../common/utils/request-context';
import { DirectoryService } from './directory.service';
import {
  DirectoryQueryDto,
  UpdateMessagingSettingsDto,
} from './dto/directory.dto';
import { MESSAGING_ROLES } from './messaging-rules';

// The directory of the verified professionals, the blocks, and the
// "reachable by professionals of other workspaces" setting.
@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
@Roles(...MESSAGING_ROLES)
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  @Get('directory')
  search(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: DirectoryQueryDto,
  ) {
    return this.directoryService.search(user, query);
  }

  @Get('blocks')
  listBlocks(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.directoryService.listBlocks(user);
  }

  // Idempotent: blocking twice changes nothing.
  @Post('blocks/:userId')
  @HttpCode(HttpStatus.OK)
  block(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('userId') userId: string,
    @Req() request: Request,
  ) {
    return this.directoryService.block(
      user,
      userId,
      getRequestContext(request),
    );
  }

  @Delete('blocks/:userId')
  unblock(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('userId') userId: string,
    @Req() request: Request,
  ) {
    return this.directoryService.unblock(
      user,
      userId,
      getRequestContext(request),
    );
  }

  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.directoryService.getSettings(user);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateMessagingSettingsDto,
  ) {
    return this.directoryService.updateSettings(user, dto);
  }
}
