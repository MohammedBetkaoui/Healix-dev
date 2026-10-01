import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { trimStringValue } from '../../../common/utils/transform-input';

export class SuspendUserDto {
  @Transform(trimStringValue)
  @IsString()
  @IsNotEmpty({ message: 'La raison est obligatoire.' })
  @MinLength(5, { message: 'La raison est trop courte.' })
  @MaxLength(500)
  reason!: string;
}
