import { IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

// doctorProfileId is always present in the body, but for INDEPENDENT_DOCTOR
// the service ignores it entirely and substitutes the caller's own profile
// (see AppointmentsService.resolveCreateDoctorProfileId) — the client value
// is never trusted for that role.
export class CreateAppointmentDto {
  @IsString()
  patientId!: string;

  @IsString()
  doctorProfileId!: string;

  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  reason!: string;
}
