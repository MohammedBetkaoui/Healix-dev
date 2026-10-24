import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AppointmentAuditService } from './appointment-audit.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [
    PrismaModule,
    AuditLogsModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    JwtAuthGuard,
    RolesGuard,
    AppointmentAuditService,
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
