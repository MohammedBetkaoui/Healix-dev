import { Module } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { ConsultationAuthorizationService } from './consultation-authorization.service';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

@Module({
  imports: [PrismaModule, WorkspaceModule, AuditLogsModule],
  controllers: [ConsultationsController],
  providers: [
    ConsultationsService,
    ConsultationAuthorizationService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
