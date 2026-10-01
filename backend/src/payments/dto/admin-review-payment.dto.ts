import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { trimStringValue } from '../../common/utils/transform-input';

export class AdminApprovePaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimStringValue)
  adminNote?: string;
}

export class AdminRejectPaymentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  @Transform(trimStringValue)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimStringValue)
  adminNote?: string;
}
