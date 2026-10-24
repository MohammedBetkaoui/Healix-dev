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
// Ascending: the first threshold the remaining days fit under is the one sent.
const SUBSCRIPTION_REMINDER_DAYS = [1, 7, 30];
const TRIAL_REMINDER_DAYS = [1, 3, 7];

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

  // Reminders before a subscription ends: 30, 7 and 1 day(s) for a paid
  // subscription, 7, 3 and 1 day(s) for a trial. One per threshold and per
  // expiry date, so a renewal (the same row, a later expiry) is reminded again
  // the next time.
  @Cron('0 15 8 * * *')
  async createSubscriptionExpiryNotifications() {
    const now = new Date();
    const until = new Date(now.getTime() + 30 * DAY_MS);
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
          expiresAt: { gt: now, lte: until },
        },
        select: { id: true, userId: true, expiresAt: true, trial: true },
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
          const thresholds = subscription.trial
            ? TRIAL_REMINDER_DAYS
            : SUBSCRIPTION_REMINDER_DAYS;
          const threshold = thresholds.find((days) => remaining <= days);
          if (threshold === undefined) return [];
          const type = subscription.trial
            ? 'TRIAL_EXPIRING'
            : 'SUBSCRIPTION_EXPIRING';
          return [
            this.producer.create({
              userId: subscription.userId,
              category: NotificationCategory.SUBSCRIPTION,
              type,
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
              dedupeKey: `${type.toLowerCase()}:${subscription.id}:${threshold}:${subscription.expiresAt.toISOString().slice(0, 10)}`,
            }),
          ];
        }),
      );
    } catch (error) {
      this.logger.error(
        `Subscription expiry job failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
