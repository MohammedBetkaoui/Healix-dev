import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { PatientFileStorageService } from './documents/patient-file-storage.service';
import { PatientFileValidator } from './documents/patient-file-validator';
import { PatientAuditService } from './patient-audit.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [
    PrismaModule,
    AuditLogsModule,
    WorkspaceModule,
    SubscriptionsModule,
  ],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    JwtAuthGuard,
    RolesGuard,
    PatientFileValidator,
    PatientFileStorageService,
    PatientAuditService,
  ],
  // Scope/consent checks, file storage and audit for the AI analysis runs.
  exports: [
    PatientsService,
    PatientFileStorageService,
    PatientFileValidator,
    PatientAuditService,
  ],
})
export class PatientsModule {}
