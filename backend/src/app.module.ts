import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountModule } from './account/account.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminModule } from './admin/admin.module';
import { AiAnalysisRunsModule } from './ai-analysis-runs/ai-analysis-runs.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { ConsultationsModule } from './consultations/consultations.module';
import {
  AppThrottlerGuard,
  DEFAULT_THROTTLE_ANON_LIMIT,
} from './common/guards/app-throttler.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { DicomModule } from './dicom/dicom.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';
import { PaymentsModule } from './payments/payments.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { ReportsModule } from './reports/reports.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { VerificationModule } from './verification/verification.module';
import { WorkspaceModule } from './workspaces/workspace.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // For AppThrottlerGuard, which passes the secret of each token it checks.
    JwtModule.register({}),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        // Replaced by AppThrottlerGuard: THROTTLE_USER_LIMIT for a caller
        // with a valid access token, THROTTLE_ANON_LIMIT for the others.
        limit: DEFAULT_THROTTLE_ANON_LIMIT,
      },
    ]),
    AdminAuthModule,
    AdminModule,
    AuthModule,
    SubscriptionsModule,
    PaymentsModule,
    VerificationModule,
    PatientsModule,
    DicomModule,
    AiAnalysisRunsModule,
    AppointmentsModule,
    DashboardModule,
    MessagingModule,
    NotificationsModule,
    PrescriptionsModule,
    ReportsModule,
    ConsultationsModule,
    AccountModule,
    WorkspaceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
