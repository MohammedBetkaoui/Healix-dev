import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConsultationDto {
  @IsString()
  @MaxLength(191)
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  appointmentId?: string;
}
