import {
  Body,
  Controller,
  Get,
  Param,
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
import { RolesGuard } from '../common/guards/roles.guard';
import { getRequestContext } from '../common/utils/request-context';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto';
import { TeamInvitationService } from './team-invitation.service';
import { TeamService } from './team.service';

// No VerifiedAccountGuard here: a newly accepted doctor is a DRAFT profile,
// and the team page is exactly where accepting the invitation leads. The
// workspace authorization (RolesGuard + the services' capability checks)
// decides what each role reads; a suspended account is stopped at the
// membership resolution, before any capability is checked.
@Controller('establishment/team')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly teamInvitationService: TeamInvitationService,
  ) {}

  @Get()
  @Roles(UserRole.ESTABLISHMENT_ADMIN, UserRole.AFFILIATED_DOCTOR)
  getTeam(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.teamService.getTeam(user);
  }

  // Invitations: create, resend, revoke. The role is re-checked in the
  // service: an ADMIN cannot invite admins, and may revoke only doctor
  // invitations.
  @Post('invitations')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  createInvitation(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateTeamInvitationDto,
    @Req() request: Request,
  ) {
    return this.teamInvitationService.createInvitation(
      user,
      dto,
      getRequestContext(request),
    );
  }

  @Post('invitations/:invitationId/resend')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  resendInvitation(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('invitationId') invitationId: string,
    @Req() request: Request,
  ) {
    return this.teamInvitationService.resendInvitation(
      user,
      invitationId,
      getRequestContext(request),
    );
  }

  @Post('invitations/:invitationId/revoke')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  revokeInvitation(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('invitationId') invitationId: string,
    @Req() request: Request,
  ) {
    return this.teamInvitationService.revokeInvitation(
      user,
      invitationId,
      getRequestContext(request),
    );
  }

  // Members: suspend, reactivate, and the self-service reset link (no
  // password is ever written or shown by an admin).
  @Post('members/:membershipId/suspend')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  suspendMember(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('membershipId') membershipId: string,
    @Req() request: Request,
  ) {
    return this.teamService.suspendMember(
      user,
      membershipId,
      getRequestContext(request),
    );
  }

  @Post('members/:membershipId/reactivate')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  reactivateMember(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('membershipId') membershipId: string,
    @Req() request: Request,
  ) {
    return this.teamService.reactivateMember(
      user,
      membershipId,
      getRequestContext(request),
    );
  }

  @Post('members/:membershipId/send-password-reset')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  sendPasswordReset(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('membershipId') membershipId: string,
    @Req() request: Request,
  ) {
    return this.teamService.sendPasswordReset(
      user,
      membershipId,
      getRequestContext(request),
    );
  }
}
