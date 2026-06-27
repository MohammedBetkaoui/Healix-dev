import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogsController } from './audit/admin-audit-logs.controller';
import { AdminAuditLogsService } from './audit/admin-audit-logs.service';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminVerificationsController } from './verifications/admin-verifications.controller';
import { AdminVerificationsService } from './verifications/admin-verifications.service';

@Module({
  imports: [ConfigModule, PrismaModule, AuditLogsModule],
  controllers: [
    AdminAuditLogsController,
    AdminDashboardController,
    AdminUsersController,
    AdminVerificationsController,
  ],
  providers: [
    AdminAuditLogsService,
    AdminDashboardService,
    AdminUsersService,
    AdminVerificationsService,
  ],
})
export class AdminModule {}
