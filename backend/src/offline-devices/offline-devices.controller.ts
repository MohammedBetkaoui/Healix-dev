import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import { RegisterOfflineDeviceDto } from './dto/register-offline-device.dto';
import { OfflineDevicesService } from './offline-devices.service';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class OfflineDevicesController {
  constructor(private readonly devices: OfflineDevicesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.devices.list(request.user);
  }

  @Post('register')
  register(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegisterOfflineDeviceDto,
  ) {
    return this.devices.register(request.user, dto);
  }

  @Post(':deviceId/grant')
  renew(
    @Req() request: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.renew(request.user, deviceId);
  }

  @Post(':deviceId/revoke')
  revoke(
    @Req() request: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.revoke(request.user, deviceId);
  }
}
