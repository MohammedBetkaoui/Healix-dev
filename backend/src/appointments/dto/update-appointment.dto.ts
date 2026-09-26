import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { AppointmentStatus } from '../../common/enums/appointment-status.enum';

// No strict state-transition rule for the MVP: any status can move to any
// other. Every status change is still audited (see AppointmentsService.update).
export class UpdateAppointmentDto {
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: keyof typeof AppointmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
