import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PasswordResetService } from './password-reset.service';

@Injectable()
export class PasswordResetCleanupScheduler {
  private readonly logger = new Logger(PasswordResetCleanupScheduler.name);

  constructor(private readonly passwordResetService: PasswordResetService) {}

  // A failed run is logged and retried the next day (the purge is
  // idempotent); it must never reject and take the process down.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredTokens(): Promise<void> {
    try {
      const deletedCount = await this.passwordResetService.purgeExpiredTokens();

      if (deletedCount > 0) {
        this.logger.log(`${deletedCount} password reset token(s) deleted.`);
      }
    } catch (error) {
      this.logger.error(
        'Password reset token cleanup failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
