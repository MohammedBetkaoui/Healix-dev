import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { trimStringValue } from '../../../common/utils/transform-input';

export class ApproveVerificationDto {
  @Transform(trimStringValue)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  adminNote?: string;
}
