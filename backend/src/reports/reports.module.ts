import { Module } from '@nestjs/common';

import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsModule } from '../patients/patients.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { ReportAuthorizationService } from './report-authorization.service';
import { ReportNumberService } from './report-number.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportStorageService } from './report-storage.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    PrismaModule,
    PatientsModule,
    PrescriptionsModule,
    WorkspaceModule,
    AuditLogsModule,
    NotificationsModule,
    StorageModule,
    SubscriptionsModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportAuthorizationService,
    ReportNumberService,
    ReportPdfService,
    ReportStorageService,
    AiReportRenderer,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
