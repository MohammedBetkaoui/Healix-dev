import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConsultationAddendumDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10000)
  content!: string;
}
