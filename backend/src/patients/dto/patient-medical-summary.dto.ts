import { IsArray, IsString, MaxLength } from 'class-validator';

// Mirrors frontend/src/types/patient.ts#PatientMedicalSummary exactly.
// Stored as a single JSON column on Patient (see schema.prisma#Patient.medicalSummary).
export class PatientMedicalSummaryDto {
  @IsArray()
  @IsString({ each: true })
  allergies!: string[];

  @IsArray()
  @IsString({ each: true })
  chronicDiseases!: string[];

  @IsArray()
  @IsString({ each: true })
  currentMedications!: string[];

  @IsArray()
  @IsString({ each: true })
  history!: string[];

  @IsString()
  @MaxLength(5000)
  notes!: string;
}
