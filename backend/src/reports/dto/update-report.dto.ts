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

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  encounterId?: string | null;

  @IsOptional()
  @IsIn(WRITTEN_CATEGORIES)
  category?: ClinicalReportCategory;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  conclusion?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ReportSectionDto)
  sections?: ReportSectionDto[];
}
