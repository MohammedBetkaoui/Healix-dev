import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trimStringValue } from '../../../common/utils/transform-input';

export class RejectVerificationDto {
  @Transform(trimStringValue)
  @IsString()
  @IsNotEmpty({ message: 'La raison du refus est obligatoire.' })
  @MinLength(5, { message: 'La raison du refus est trop courte.' })
  @MaxLength(1000)
  reason!: string;

  @Transform(trimStringValue)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  adminNote?: string;
}
