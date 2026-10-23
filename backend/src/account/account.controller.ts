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
  Req,
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { ThrottlePerIp } from '../common/guards/app-throttler.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { getRequestContext } from '../common/utils/request-context';
import { AccountSessionsService } from './account-sessions.service';
import { AccountService } from './account.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto';

// The refresh token of the request: what ties it to one of the sessions.
function readRefreshToken(request: Request): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.refresh_token;
  return typeof token === 'string' && token ? token : null;
}

// The caller's own account. No VerifiedAccountGuard: an account being
// verified must be able to change its password and close sessions.
@Controller('account')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.INDEPENDENT_DOCTOR,
  UserRole.AFFILIATED_DOCTOR,
)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: AccountSessionsService,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.account.getProfile(user.sub);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateAccountProfileDto,
    @Req() request: Request,
  ) {
    return this.account.updateProfile(
      user.sub,
      dto,
      getRequestContext(request),
    );
  }

  // The limit of the login: the current password can be guessed here too.
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ThrottlePerIp({ limit: 5, ttl: 60_000 })
  changePassword(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ) {
    return this.account.changePassword(
      user.sub,
      dto,
      readRefreshToken(request),
      getRequestContext(request),
    );
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Req() request: Request,
  ) {
    return this.sessions.list(user.sub, readRefreshToken(request));
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  revokeOtherSessions(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Req() request: Request,
  ) {
    return this.sessions.revokeOthers(
      user.sub,
      readRefreshToken(request),
      getRequestContext(request),
    );
  }

  @Delete('sessions/:id')
  revokeSession(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.sessions.revoke(
      user.sub,
      id,
      readRefreshToken(request),
      getRequestContext(request),
    );
  }
}
