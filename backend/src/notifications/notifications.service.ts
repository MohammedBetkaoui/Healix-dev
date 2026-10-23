import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationCategory,
  Prisma,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  ListNotificationsQueryDto,
  NotificationReadStatus,
} from './dto/list-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

const MANDATORY_CATEGORIES = new Set<NotificationCategory>([
  NotificationCategory.SECURITY,
  NotificationCategory.SYSTEM,
]);

const ALL_CATEGORIES = Object.values(NotificationCategory);

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private visibleWhere(userId: string): Prisma.NotificationWhereInput {
    return {
      userId,
      archivedAt: null,
      OR: [
        { workspaceId: null },
        {
          workspace: {
            memberships: {
              some: { userId, status: WorkspaceMembershipStatus.ACTIVE },
            },
          },
        },
      ],
    };
  }

  async list(userId: string, query: ListNotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      ...this.visibleWhere(userId),
      ...(query.category ? { category: query.category } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status === NotificationReadStatus.READ
        ? { readAt: { not: null } }
        : query.status === NotificationReadStatus.UNREAD
          ? { readAt: null }
          : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async unreadCount(userId: string) {
    return {
      count: await this.prisma.notification.count({
        where: { ...this.visibleWhere(userId), readAt: null },
      }),
    };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.findVisible(userId, id);
    if (notification.readAt) return notification;
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    this.emitUpdated(userId, id);
    return updated;
  }

  async markUnread(userId: string, id: string) {
    const notification = await this.findVisible(userId, id);
    if (!notification.readAt) return notification;
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: null },
    });
    this.emitUpdated(userId, id);
    return updated;
  }

  async markAllRead(userId: string, category?: NotificationCategory) {
    const candidates = await this.prisma.notification.findMany({
      where: {
        ...this.visibleWhere(userId),
        readAt: null,
        ...(category ? { category } : {}),
      },
      select: { id: true },
    });
    if (candidates.length) {
      await this.prisma.notification.updateMany({
        where: { id: { in: candidates.map(({ id }) => id) } },
        data: { readAt: new Date() },
      });
      candidates.forEach(({ id }) => this.emitUpdated(userId, id));
    }
    return { updated: candidates.length };
  }

  async archive(userId: string, id: string) {
    const notification = await this.findVisible(userId, id);
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { archivedAt: notification.archivedAt ?? new Date() },
    });
    this.emitUpdated(userId, id);
    return updated;
  }

  async getPreferences(userId: string) {
    const saved = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });
    const byCategory = new Map(saved.map((item) => [item.category, item]));
    return ALL_CATEGORIES.map((category) => ({
      category,
      inAppEnabled: MANDATORY_CATEGORIES.has(category)
        ? true
        : (byCategory.get(category)?.inAppEnabled ?? true),
      mandatory: MANDATORY_CATEGORIES.has(category),
    }));
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const normalized = new Map<NotificationCategory, boolean>();
    dto.preferences.forEach(({ category, inAppEnabled }) => {
      normalized.set(
        category,
        MANDATORY_CATEGORIES.has(category) ? true : inAppEnabled,
      );
    });
    await this.prisma.$transaction(
      [...normalized].map(([category, inAppEnabled]) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_category: { userId, category } },
          create: { userId, category, inAppEnabled },
          update: { inAppEnabled },
        }),
      ),
    );
    return this.getPreferences(userId);
  }

  private async findVisible(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { ...this.visibleWhere(userId), id },
    });
    if (!notification) throw new NotFoundException('Notification introuvable.');
    return notification;
  }

  private emitUpdated(userId: string, notificationId: string) {
    this.realtime.emitToUsers([userId], 'notification.updated', {
      notificationId,
    });
  }
}
