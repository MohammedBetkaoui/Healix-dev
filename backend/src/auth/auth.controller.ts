import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { AuthGuard } from '@nestjs/passport';

import { getRequestContext } from '../common/utils/request-context';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterEstablishmentDto } from './dto/register-establishment.dto';
import { RegisterIndependentDoctorDto } from './dto/register-independent-doctor.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { type AuthenticatedRequest } from './types/authenticated-request.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(dto, response, getRequestContext(request));
  }

  @Post('register-establishment')
  registerEstablishment(
    @Body() dto: RegisterEstablishmentDto,
    @Req() request: Request,
  ) {
    return this.authService.registerEstablishment(
      dto,
      getRequestContext(request),
    );
  }

  @Post('register-independent-doctor')
  registerIndependentDoctor(
    @Body() dto: RegisterIndependentDoctorDto,
    @Req() request: Request,
  ) {
    return this.authService.registerIndependentDoctor(
      dto,
      getRequestContext(request),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.user.sub);
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.refreshSession(
      request.user,
      response,
      getRequestContext(request),
    );
  }

  @Post('logout')
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(request, response, getRequestContext(request));
  }
}
