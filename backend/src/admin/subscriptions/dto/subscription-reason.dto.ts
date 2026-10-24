import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { trimStringValue } from '../../../common/utils/transform-input';

// Every action of the console says why: it goes in the history of the
// subscription and in the audit log.
export class SubscriptionReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  @Transform(trimStringValue)
  reason!: string;
}
