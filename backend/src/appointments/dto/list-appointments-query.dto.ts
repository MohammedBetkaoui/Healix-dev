import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

import { AppointmentStatus } from '../../common/enums/appointment-status.enum';

// from/to are required: an agenda view must never accidentally load a
// patient's or a doctor's entire appointment history.
export class ListAppointmentsQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  doctorProfileId?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: keyof typeof AppointmentStatus;
}
