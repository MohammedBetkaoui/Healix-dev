import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionPlansService } from './plans/subscription-plans.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionPlansService, SubscriptionsService],
  exports: [SubscriptionPlansService, SubscriptionsService],
})
export class SubscriptionsModule {}
