import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogsController } from './audit/admin-audit-logs.controller';
import { AdminAuditLogsService } from './audit/admin-audit-logs.service';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminPatientsController } from './patients/admin-patients.controller';
import { AdminPatientsService } from './patients/admin-patients.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminVerificationsController } from './verifications/admin-verifications.controller';
import { AdminVerificationsService } from './verifications/admin-verifications.service';

@Module({
  imports: [ConfigModule, PrismaModule, AuditLogsModule],
  controllers: [
    AdminAuditLogsController,
    AdminDashboardController,
    AdminPatientsController,
    AdminUsersController,
    AdminVerificationsController,
  ],
  providers: [
    AdminAuditLogsService,
    AdminDashboardService,
    AdminPatientsService,
    AdminUsersService,
    AdminVerificationsService,
  ],
})
export class AdminModule {}
