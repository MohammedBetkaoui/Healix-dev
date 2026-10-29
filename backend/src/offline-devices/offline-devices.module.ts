import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { SyncController } from '../sync/sync.controller';
import { OfflineScopeService } from '../sync/offline-scope.service';
import { PrescriptionSyncService } from '../sync/prescription-sync.service';
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
    // Prescription drafts reuse the domain rules (prepareSyncDraft facade);
    // the module exports the service that owns them.
    PrescriptionsModule,
  ],
  controllers: [OfflineDevicesController, SyncController],
  providers: [
    OfflineDevicesService,
    OfflineGrantService,
    OfflineGrantGuard,
    DeviceProofGuard,
    OfflineScopeService,
    SyncService,
    PrescriptionSyncService,
    JwtAuthGuard,
  ],
  exports: [OfflineGrantService, DeviceProofGuard],
})
export class OfflineDevicesModule {}
