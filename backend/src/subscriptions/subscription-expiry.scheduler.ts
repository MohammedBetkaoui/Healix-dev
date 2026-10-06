import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class SubscriptionExpiryScheduler {
  private readonly logger = new Logger(SubscriptionExpiryScheduler.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // A failed run is logged and retried on the next tick (the expiry is
  // idempotent); it must never reject and take the process down.
  @Cron(CronExpression.EVERY_HOUR)
  async expireDueSubscriptions(): Promise<void> {
    try {
      const expiredCount =
        await this.subscriptionsService.expireDueSubscriptions();

      if (expiredCount > 0) {
        this.logger.log(`${expiredCount} subscription(s) expired.`);
      }
    } catch (error) {
      this.logger.error(
        'Subscription expiry run failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
