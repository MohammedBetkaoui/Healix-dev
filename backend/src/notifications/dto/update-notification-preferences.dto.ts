import { NotificationCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';

export class NotificationPreferenceInputDto {
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsBoolean()
  inAppEnabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceInputDto)
  preferences!: NotificationPreferenceInputDto[];
}
