import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationProducerService } from './notification-producer.service';
import { NotificationSchedulersService } from './notification-schedulers.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationProducerService,
    NotificationSchedulersService,
  ],
  exports: [NotificationProducerService],
})
export class NotificationsModule {}
