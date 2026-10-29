import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { OfflineGrantGuard } from '../offline-devices/offline-grant.guard';
import { DeviceProofGuard } from '../offline-devices/device-proof.guard';
import { type OfflineAuthenticatedRequest } from '../offline-devices/offline-device.types';
import { SyncAckDto, SyncPullQueryDto, SyncPushDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@UseGuards(OfflineGrantGuard, DeviceProofGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('bootstrap')
  bootstrap(@Req() request: OfflineAuthenticatedRequest) {
    return this.sync.bootstrap(request.offlineActor);
  }

  @Post('reconcile')
  reconcile(@Req() request: OfflineAuthenticatedRequest) {
    return this.sync.reconcile(request.offlineActor);
  }

  @Get('medications')
  medications(@Req() request: OfflineAuthenticatedRequest) {
    return this.sync.medications(request.offlineActor);
  }

  @Post('push')
  push(@Req() request: OfflineAuthenticatedRequest, @Body() dto: SyncPushDto) {
    return this.sync.push(request.offlineActor, dto);
  }

  @Get('pull')
  pull(
    @Req() request: OfflineAuthenticatedRequest,
    @Query() query: SyncPullQueryDto,
  ) {
    return this.sync.pull(request.offlineActor, query.cursor);
  }

  @Post('ack')
  acknowledge(
    @Req() request: OfflineAuthenticatedRequest,
    @Body() dto: SyncAckDto,
  ) {
    return this.sync.acknowledge(request.offlineActor, dto.cursor);
  }
}
