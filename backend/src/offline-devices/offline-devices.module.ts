import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncController } from '../sync/sync.controller';
import { OfflineScopeService } from '../sync/offline-scope.service';
import { SyncService } from '../sync/sync.service';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { OfflineDevicesController } from './offline-devices.controller';
import { OfflineDevicesService } from './offline-devices.service';
import { DeviceProofGuard } from './device-proof.guard';
import { OfflineGrantGuard } from './offline-grant.guard';
import { OfflineGrantService } from './offline-grant.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    PrismaModule,
    WorkspaceModule,
  ],
  controllers: [OfflineDevicesController, SyncController],
  providers: [
    OfflineDevicesService,
    OfflineGrantService,
    OfflineGrantGuard,
    DeviceProofGuard,
    OfflineScopeService,
    SyncService,
    JwtAuthGuard,
  ],
  exports: [OfflineGrantService, DeviceProofGuard],
})
export class OfflineDevicesModule {}
