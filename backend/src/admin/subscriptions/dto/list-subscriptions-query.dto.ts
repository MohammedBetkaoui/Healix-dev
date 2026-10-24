import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { AccountType } from '../../../common/enums/account-type.enum';
import { SubscriptionStatus } from '../../../common/enums/subscription-status.enum';
import { trimStringValue } from '../../../common/utils/transform-input';

export class ListSubscriptionsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 10;

  @Transform(trimStringValue)
  @IsString()
  @IsOptional()
  search?: string;

  // NO_PLAN: a verified account that holds no subscription.
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;

  @IsEnum(AccountType)
  @IsOptional()
  accountType?: AccountType;

  // Live subscriptions (trial included) that end within this many days.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  expiresWithinDays?: number;
}
