import { NotificationCategory, NotificationSeverity } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum NotificationReadStatus {
  ALL = 'ALL',
  UNREAD = 'UNREAD',
  READ = 'READ',
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsEnum(NotificationReadStatus)
  status: NotificationReadStatus = NotificationReadStatus.ALL;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ReadAllNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;
}
