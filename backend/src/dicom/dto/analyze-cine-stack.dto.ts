import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// The series of the study to measure (its identifier in Orthanc, as the cine
// stacks list gives it). One that is not in the study answers 404.
export class AnalyzeCineStackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  seriesId!: string;
}
