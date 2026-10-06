import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionPlansService } from './plans/subscription-plans.service';
import { SubscriptionExpiryScheduler } from './subscription-expiry.scheduler';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionExpiryScheduler,
    SubscriptionPlansService,
    SubscriptionsService,
  ],
  exports: [SubscriptionPlansService, SubscriptionsService],
})
export class SubscriptionsModule {}
