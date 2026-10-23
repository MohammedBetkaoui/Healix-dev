import { NotFoundException } from '@nestjs/common';
import { NotificationCategory } from '@prisma/client';

import { type PrismaService } from '../prisma/prisma.service';
import { type RealtimeService } from '../realtime/realtime.service';
import { NotificationReadStatus } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    notification: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notificationPreference: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const realtime = { emitToUsers: jest.fn() };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      realtime as unknown as RealtimeService,
    );
  });

  it('always scopes lists to the JWT user and paginates', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 'n-1' }]);
    prisma.notification.count.mockResolvedValue(21);
    const result = await service.list('user-1', {
      page: 2,
      limit: 20,
      status: NotificationReadStatus.UNREAD,
    });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: expect.objectContaining({ userId: 'user-1', readAt: null }),
      }),
    );
    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    });
  });

  it('answers as not found for another user notification', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(
      service.markRead('user-1', 'notification-of-user-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks read idempotently without emitting a duplicate update', async () => {
    const alreadyRead = { id: 'n-1', readAt: new Date() };
    prisma.notification.findFirst.mockResolvedValue(alreadyRead);
    await expect(service.markRead('user-1', 'n-1')).resolves.toBe(alreadyRead);
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });

  it('marks every visible unread notification and emits identifiers only', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n-1' },
      { id: 'n-2' },
    ]);
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    await expect(service.markAllRead('user-1')).resolves.toEqual({
      updated: 2,
    });
    expect(realtime.emitToUsers).toHaveBeenCalledTimes(2);
    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      ['user-1'],
      'notification.updated',
      { notificationId: 'n-1' },
    );
  });

  it('keeps SECURITY and SYSTEM preferences mandatory', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    prisma.notificationPreference.upsert.mockResolvedValue({});
    const preferences = await service.updatePreferences('user-1', {
      preferences: [
        { category: NotificationCategory.SECURITY, inAppEnabled: false },
        { category: NotificationCategory.SYSTEM, inAppEnabled: false },
      ],
    });
    expect(
      preferences.find(
        (item) => item.category === NotificationCategory.SECURITY,
      ),
    ).toMatchObject({ inAppEnabled: true, mandatory: true });
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ inAppEnabled: true }),
      }),
    );
  });
});
