import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { SubscriptionReasonDto } from './subscription-reason.dto';

export const MAX_TRIAL_EXTENSION_DAYS = 30;
export const MAX_EXTENSION_DAYS = 365;

export class ExtendTrialDto extends SubscriptionReasonDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TRIAL_EXTENSION_DAYS)
  days!: number;
}

// A commercial gesture: days offered on top of what is left.
export class ExtendSubscriptionDto extends SubscriptionReasonDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_EXTENSION_DAYS)
  days!: number;
}
