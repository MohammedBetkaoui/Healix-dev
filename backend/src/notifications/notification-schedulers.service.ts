import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AppointmentStatus,
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
  SubscriptionStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationProducerService } from './notification-producer.service';

const DAY_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class NotificationSchedulersService {
  private readonly logger = new Logger(NotificationSchedulersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: NotificationProducerService,
  ) {}

  @Cron('0 */30 * * * *')
  async createAppointmentReminders() {
    const now = new Date();
    const until = new Date(now.getTime() + DAY_MS);
    try {
      const appointments = await this.prisma.appointment.findMany({
        where: {
          scheduledAt: { gt: now, lte: until },
          status: {
            in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
          },
        },
        select: {
          id: true,
          scheduledAt: true,
          patient: { select: { workspaceId: true } },
          doctorProfile: { select: { userId: true } },
        },
      });
      await Promise.all(
        appointments.flatMap((appointment) => {
          const hours =
            (appointment.scheduledAt.getTime() - now.getTime()) / 3_600_000;
          const windows = [hours <= 2 ? '2h' : '24h'];
          return windows.map((reminderWindow) =>
            this.producer.create({
              userId: appointment.doctorProfile.userId,
              workspaceId: appointment.patient.workspaceId,
              category: NotificationCategory.APPOINTMENT,
              type: 'APPOINTMENT_REMINDER',
              severity: NotificationSeverity.INFO,
              resourceType: NotificationResourceType.APPOINTMENT,
              resourceId: appointment.id,
              data: {
                appointmentId: appointment.id,
                scheduledAt: appointment.scheduledAt.toISOString(),
                reminderWindow,
              },
              dedupeKey: `appointment-reminder:${appointment.id}:${reminderWindow}`,
            }),
          );
        }),
      );
    } catch (error) {
      this.logger.error(
        `Appointment reminder job failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  @Cron('0 15 8 * * *')
  async createSubscriptionExpiryNotifications() {
    const now = new Date();
    const until = new Date(now.getTime() + 30 * DAY_MS);
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          expiresAt: { gt: now, lte: until },
        },
        select: { id: true, userId: true, expiresAt: true },
      });
      await Promise.all(
        subscriptions.flatMap((subscription) => {
          if (!subscription.expiresAt) return [];
          const remaining = Math.max(
            1,
            Math.ceil(
              (subscription.expiresAt.getTime() - now.getTime()) / DAY_MS,
            ),
          );
          const currentThreshold = remaining <= 1 ? 1 : remaining <= 7 ? 7 : 30;
          return [currentThreshold].map((threshold) =>
            this.producer.create({
              userId: subscription.userId,
              category: NotificationCategory.SUBSCRIPTION,
              type: 'SUBSCRIPTION_EXPIRING',
              severity:
                threshold === 1
                  ? NotificationSeverity.WARNING
                  : NotificationSeverity.INFO,
              resourceType: NotificationResourceType.SUBSCRIPTION,
              resourceId: subscription.id,
              data: {
                subscriptionId: subscription.id,
                daysRemaining: threshold,
              },
              dedupeKey: `subscription-expiring:${subscription.id}:${threshold}`,
            }),
          );
        }),
      );
    } catch (error) {
      this.logger.error(
        `Subscription expiry job failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
