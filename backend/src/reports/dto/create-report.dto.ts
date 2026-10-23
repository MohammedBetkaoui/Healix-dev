import { ClinicalReportCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { WRITTEN_CATEGORIES } from '../report-constants';
import { ReportSectionDto } from './report-section.dto';

export class CreateReportDto {
  @IsString()
  @MaxLength(191)
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  encounterId?: string;

  @IsOptional()
  @IsIn(WRITTEN_CATEGORIES)
  category?: ClinicalReportCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  conclusion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ReportSectionDto)
  sections?: ReportSectionDto[];
}
