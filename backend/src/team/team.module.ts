import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { TeamInvitationsPublicController } from './team-invitations-public.controller';
import { TeamInvitationService } from './team-invitation.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    MailModule,
    NotificationsModule,
    OrganizationModule,
    PrismaModule,
    RealtimeModule,
    SubscriptionsModule,
    WorkspaceModule,
  ],
  controllers: [TeamController, TeamInvitationsPublicController],
  providers: [TeamService, TeamInvitationService],
})
export class TeamModule {}
