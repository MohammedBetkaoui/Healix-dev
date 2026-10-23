import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelPrescriptionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
