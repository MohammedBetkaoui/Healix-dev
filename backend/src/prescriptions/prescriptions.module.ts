import { Module } from '@nestjs/common';

import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { PrescriptionAuthorizationService } from './prescription-authorization.service';
import { PrescriptionNumberService } from './prescription-number.service';
import { PrescriptionPdfService } from './prescription-pdf.service';
import { PrescriptionRegulatoryService } from './prescription-regulatory.service';
import { PrescriptionSafetyService } from './prescription-safety.service';
import { PrescriptionStorageService } from './prescription-storage.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  imports: [
    PrismaModule,
    PatientsModule,
    WorkspaceModule,
    AuditLogsModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [PrescriptionsController],
  providers: [
    PrescriptionsService,
    PrescriptionAuthorizationService,
    PrescriptionSafetyService,
    PrescriptionRegulatoryService,
    PrescriptionNumberService,
    PrescriptionPdfService,
    PrescriptionStorageService,
    AiReportRenderer,
    JwtAuthGuard,
    RolesGuard,
  ],
  // The authorization is shared with the reports (same physician checks).
  exports: [PrescriptionsService, PrescriptionAuthorizationService],
})
export class PrescriptionsModule {}
