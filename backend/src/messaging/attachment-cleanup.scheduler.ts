import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AttachmentsService } from './attachments.service';

@Injectable()
export class AttachmentCleanupScheduler {
  private readonly logger = new Logger(AttachmentCleanupScheduler.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  // Files uploaded but never sent, after 24 hours. A failed run is logged and
  // retried the next hour (the purge is idempotent); it never rejects.
  @Cron(CronExpression.EVERY_HOUR)
  async purgeUnsentAttachments(): Promise<void> {
    try {
      const deleted = await this.attachmentsService.purgeUnsent();

      if (deleted > 0) {
        this.logger.log(`${deleted} unsent attachment(s) deleted.`);
      }
    } catch (error) {
      this.logger.error(
        'Unsent attachments cleanup failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
