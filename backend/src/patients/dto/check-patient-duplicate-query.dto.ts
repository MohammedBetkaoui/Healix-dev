import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

// firstNameAr/lastNameAr are not part of the task's literal query string but
// are required to faithfully port the frontend's IDENTITY check, which also
// matches on the Arabic name pair (see patient-matching.util.ts).
export class CheckPatientDuplicateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastNameAr?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationalId?: string;
}
