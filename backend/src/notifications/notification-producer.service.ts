import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
  Prisma,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export type CreateNotificationInput = {
  userId: string;
  workspaceId?: string | null;
  category: NotificationCategory;
  type: string;
  severity?: NotificationSeverity;
  resourceType?: NotificationResourceType;
  resourceId?: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
};

const MANDATORY = new Set<NotificationCategory>([
  NotificationCategory.SECURITY,
  NotificationCategory.SYSTEM,
]);

const SAFE_DATA_KEYS: Record<string, ReadonlySet<string>> = {
  APPOINTMENT_CREATED: new Set(['appointmentId', 'scheduledAt']),
  APPOINTMENT_UPDATED: new Set(['appointmentId', 'scheduledAt']),
  APPOINTMENT_CANCELED: new Set(['appointmentId', 'scheduledAt']),
  APPOINTMENT_REMINDER: new Set([
    'appointmentId',
    'scheduledAt',
    'reminderWindow',
  ]),
  AI_ANALYSIS_SUCCEEDED: new Set(['analysisRunId', 'pipeline']),
  AI_ANALYSIS_FAILED: new Set(['analysisRunId', 'pipeline']),
  AI_ANALYSIS_REQUIRES_DECISION: new Set(['analysisRunId', 'pipeline']),
  AI_REPORT_AVAILABLE: new Set(['analysisRunId', 'reportId', 'pipeline']),
  VERIFICATION_APPROVED: new Set(['verificationRequestId']),
  VERIFICATION_REJECTED: new Set(['verificationRequestId']),
  PAYMENT_APPROVED: new Set(['paymentId']),
  PAYMENT_REJECTED: new Set(['paymentId']),
  SUBSCRIPTION_EXPIRING: new Set(['subscriptionId', 'daysRemaining']),
  TRIAL_EXPIRING: new Set(['subscriptionId', 'daysRemaining']),
  TRIAL_STARTED: new Set(['subscriptionId', 'expiresAt']),
  SUBSCRIPTION_ACTIVATED: new Set(['subscriptionId', 'expiresAt']),
  SUBSCRIPTION_EXPIRED: new Set(['subscriptionId', 'trial']),
  SUBSCRIPTION_CANCELED: new Set(['subscriptionId']),
  SUBSCRIPTION_EXTENDED: new Set(['subscriptionId', 'expiresAt', 'days']),
  TRIAL_EXTENDED: new Set(['subscriptionId', 'expiresAt', 'days']),
  SUBSCRIPTION_QUOTAS_CHANGED: new Set(['subscriptionId']),
  DOCTOR_ACCOUNT_CREATED: new Set(['doctorProfileId']),
  PRESCRIPTION_VALIDATED: new Set(['prescriptionId', 'number']),
  PRESCRIPTION_CANCELED: new Set(['prescriptionId', 'number']),
  REPORT_FINALIZED: new Set(['reportId', 'number']),
};

@Injectable()
export class NotificationProducerService {
  private readonly logger = new Logger(NotificationProducerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(input: CreateNotificationInput) {
    try {
      if (input.workspaceId) {
        const belongs = await this.prisma.workspaceMembership.findFirst({
          where: {
            userId: input.userId,
            workspaceId: input.workspaceId,
            status: WorkspaceMembershipStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!belongs) {
          this.logger.warn(
            `Notification ${input.type} skipped: inactive workspace membership.`,
          );
          return null;
        }
      }

      if (!MANDATORY.has(input.category)) {
        const preference = await this.prisma.notificationPreference.findUnique({
          where: {
            userId_category: {
              userId: input.userId,
              category: input.category,
            },
          },
          select: { inAppEnabled: true },
        });
        if (preference?.inAppEnabled === false) return null;
      }

      const notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          workspaceId: input.workspaceId ?? null,
          category: input.category,
          type: input.type,
          severity: input.severity ?? NotificationSeverity.INFO,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          data: this.sanitizeData(input.type, input.data),
          dedupeKey: input.dedupeKey,
        },
      });
      this.realtime.emitToUsers([input.userId], 'notification.created', {
        notificationId: notification.id,
      });
      return notification;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      this.logger.error(
        `Notification ${input.type} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private sanitizeData(type: string, data?: Record<string, unknown>) {
    if (!data) return undefined;
    const allowed = SAFE_DATA_KEYS[type] ?? new Set<string>();
    const safe = Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) =>
          allowed.has(key) &&
          (typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'),
      ),
    );
    return Object.keys(safe).length
      ? (safe as Prisma.InputJsonObject)
      : undefined;
  }
}
