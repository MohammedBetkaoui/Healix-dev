import {
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
} from '@prisma/client';

import { type PrismaService } from '../prisma/prisma.service';
import { type RealtimeService } from '../realtime/realtime.service';
import { NotificationProducerService } from './notification-producer.service';

describe('NotificationProducerService', () => {
  const notification = {
    id: 'notification-1',
    userId: 'user-1',
  };
  const prisma = {
    notification: { create: jest.fn() },
    notificationPreference: { findUnique: jest.fn() },
    workspaceMembership: { findFirst: jest.fn() },
  };
  const realtime = { emitToUsers: jest.fn() };
  let service: NotificationProducerService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue(notification);
    prisma.workspaceMembership.findFirst.mockResolvedValue({ id: 'member-1' });
    service = new NotificationProducerService(
      prisma as unknown as PrismaService,
      realtime as unknown as RealtimeService,
    );
  });

  it('persists before emitting an identifier-only real-time payload', async () => {
    const result = await service.create({
      userId: 'user-1',
      category: NotificationCategory.AI_ANALYSIS,
      type: 'AI_ANALYSIS_SUCCEEDED',
      severity: NotificationSeverity.SUCCESS,
      resourceType: NotificationResourceType.AI_ANALYSIS_RUN,
      resourceId: 'run-1',
      data: {
        analysisRunId: 'run-1',
        pipeline: 'brain',
        diagnosis: 'must never be stored',
      },
      dedupeKey: 'analysis-ready:run-1:user-1',
    });

    expect(result).toBe(notification);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: { analysisRunId: 'run-1', pipeline: 'brain' },
      }),
    });
    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      ['user-1'],
      'notification.created',
      { notificationId: 'notification-1' },
    );
  });

  it('refuses a cross-workspace notification', async () => {
    prisma.workspaceMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        userId: 'user-1',
        workspaceId: 'workspace-2',
        category: NotificationCategory.APPOINTMENT,
        type: 'APPOINTMENT_CREATED',
      }),
    ).resolves.toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });

  it('honours configurable in-app preferences', async () => {
    prisma.notificationPreference.findUnique.mockResolvedValue({
      inAppEnabled: false,
    });
    await expect(
      service.create({
        userId: 'user-1',
        category: NotificationCategory.APPOINTMENT,
        type: 'APPOINTMENT_CREATED',
      }),
    ).resolves.toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
