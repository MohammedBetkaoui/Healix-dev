import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionPlansService } from './plans/subscription-plans.service';
import { SubscriptionExpiryScheduler } from './subscription-expiry.scheduler';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

// The modules that carry @RequiresActiveSubscription() import this one: the
// SubscriptionGuard they use is built in their own context from the
// EntitlementsService it exports.
@Module({
  imports: [
    PrismaModule,
    AuditLogsModule,
    WorkspaceModule,
    NotificationsModule,
  ],
  controllers: [SubscriptionsController, EntitlementsController],
  providers: [
    EntitlementsService,
    SubscriptionExpiryScheduler,
    SubscriptionGuard,
    SubscriptionPlansService,
    SubscriptionsService,
  ],
  exports: [
    EntitlementsService,
    SubscriptionGuard,
    SubscriptionPlansService,
    SubscriptionsService,
  ],
})
export class SubscriptionsModule {}
