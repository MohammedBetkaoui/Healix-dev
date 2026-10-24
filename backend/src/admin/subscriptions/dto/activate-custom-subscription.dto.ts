import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { trimStringValue } from '../../../common/utils/transform-input';
import { SubscriptionQuotasDto } from './subscription-quotas.dto';
import { SubscriptionReasonDto } from './subscription-reason.dto';

// The one activation an administrator makes: a contract on quote (a custom
// plan), until the date agreed.
export class ActivateCustomSubscriptionDto extends SubscriptionReasonDto {
  // The id or the code of a custom plan (EST_CUSTOM).
  @IsString()
  @MaxLength(80)
  @Transform(trimStringValue)
  planId!: string;

  @IsDateString()
  until!: string;

  // The numbers of the contract, fixed at once (otherwise PATCH quotas).
  @IsOptional()
  @ValidateNested()
  @Type(() => SubscriptionQuotasDto)
  quotas?: SubscriptionQuotasDto;
}
