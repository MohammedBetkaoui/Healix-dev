import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

// No doctorProfileId here on purpose: the authoring doctor is derived from
// the current user (see PatientsService.createConsultation), never accepted
// from the client.
export class CreatePatientConsultationDto {
  @IsISO8601()
  date!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  reason!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  diagnosis!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  treatment!: string;
}
