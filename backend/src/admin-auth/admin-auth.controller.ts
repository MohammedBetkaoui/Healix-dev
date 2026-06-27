import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';

import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { type AdminAuthenticatedRequest } from './types/admin-authenticated-request.type';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(
    @Body() dto: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.adminAuthService.login(dto, response, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  me(@Req() request: AdminAuthenticatedRequest) {
    return this.adminAuthService.getCurrentAdmin(request.user.sub);
  }

  @Post('refresh')
  @UseGuards(AuthGuard('admin-jwt-refresh'))
  refresh(
    @Req() request: AdminAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.adminAuthService.refreshSession(request.user, response, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('logout')
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.adminAuthService.logout(request, response, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }
}
