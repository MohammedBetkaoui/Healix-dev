import { Type } from 'class-transformer';
import {
  IsDefined,
  IsObject,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { SubscriptionQuotasDto } from './subscription-quotas.dto';
import { SubscriptionReasonDto } from './subscription-reason.dto';

export class UpdateSubscriptionQuotasDto extends SubscriptionReasonDto {
  // null: back to the quotas of the plan.
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => SubscriptionQuotasDto)
  quotas!: SubscriptionQuotasDto | null;
}
