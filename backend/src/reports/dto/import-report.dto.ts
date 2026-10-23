import { ClinicalReportCategory } from '@prisma/client';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { IMPORT_CATEGORIES } from '../report-constants';

// Fields of the multipart form next to the file.
export class ImportReportDto {
  @IsString()
  @MaxLength(191)
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  encounterId?: string;

  @IsOptional()
  @IsIn(IMPORT_CATEGORIES)
  category?: ClinicalReportCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsISO8601()
  effectiveDate!: string;

  /** Who wrote the document outside the platform. */
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  externalAuthor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
