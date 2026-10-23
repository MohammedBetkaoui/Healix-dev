import {
  ClinicalReportCategory,
  ClinicalReportSource,
  ClinicalReportStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  query?: string;

  @IsOptional()
  @IsEnum(ClinicalReportStatus)
  status?: ClinicalReportStatus;

  @IsOptional()
  @IsEnum(ClinicalReportCategory)
  category?: ClinicalReportCategory;

  @IsOptional()
  @IsEnum(ClinicalReportSource)
  sourceType?: ClinicalReportSource;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  patientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  authorId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Also the versions that a later one replaced (default: current only). */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  includeSuperseded?: boolean;
}
