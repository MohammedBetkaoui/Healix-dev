import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { type Request } from 'express';

import { ThrottlePerIp } from '../common/guards/app-throttler.guard';
import { getRequestContext } from '../common/utils/request-context';
import { AcceptTeamInvitationDto } from './dto/accept-team-invitation.dto';
import { TeamInvitationService } from './team-invitation.service';

// The public end of an invitation link, right after /forgot-password in
// spirit: anonymous on purpose (the invitation e-mail is the sign-in for
// people who have no account yet), rate limited because a public token end
// point that seats a new member should not be free to hammer.
// No authentication guard is attached: JwtAuthGuard is applied per
// controller in this codebase, never globally.
@Controller('team-invitations')
export class TeamInvitationsPublicController {
  constructor(private readonly teamInvitationService: TeamInvitationService) {}

  // What the invitation is before the invitee commits: the workspace name,
  // the role, the expiry, and whether it is still usable.
  @Get('inspect')
  @ThrottlePerIp({ limit: 30, ttl: 60_000 })
  inspect(@Query('token') token: string) {
    return this.teamInvitationService.inspectInvitation(token ?? '');
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ThrottlePerIp({ limit: 10, ttl: 60_000 })
  accept(@Body() dto: AcceptTeamInvitationDto, @Req() request: Request) {
    return this.teamInvitationService.acceptInvitation(
      dto,
      getRequestContext(request),
    );
  }
}
