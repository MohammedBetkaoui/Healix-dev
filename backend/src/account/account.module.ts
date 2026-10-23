import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AccountSessionsService } from './account-sessions.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

// The settings of the signed-in user's own account: profile, password and
// sessions. The other settings keep their routes (notifications/preferences,
// messaging/settings).
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditLogsModule,
    MailModule,
    RealtimeModule,
  ],
  controllers: [AccountController],
  providers: [AccountService, AccountSessionsService, JwtAuthGuard, RolesGuard],
})
export class AccountModule {}
