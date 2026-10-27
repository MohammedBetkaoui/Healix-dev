import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  imports: [PrismaModule, WorkspaceModule, AuditLogsModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationAuthorizationService],
  // Team management relies on the same workspace authorization.
  exports: [OrganizationAuthorizationService, OrganizationService],
})
export class OrganizationModule {}
