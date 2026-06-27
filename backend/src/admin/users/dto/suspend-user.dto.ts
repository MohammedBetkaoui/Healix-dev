import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'La raison est obligatoire.' })
  @MinLength(5, { message: 'La raison est trop courte.' })
  @MaxLength(500)
  reason!: string;
}
