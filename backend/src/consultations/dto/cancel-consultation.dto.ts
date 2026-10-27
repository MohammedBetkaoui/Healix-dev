import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelConsultationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}
