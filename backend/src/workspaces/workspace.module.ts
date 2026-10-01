import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceContextService } from './workspace-context.service';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [PrismaModule],
  providers: [
    WorkspaceContextService,
    WorkspaceMembershipService,
    WorkspaceService,
  ],
  exports: [
    WorkspaceContextService,
    WorkspaceMembershipService,
    WorkspaceService,
  ],
})
export class WorkspaceModule {}
