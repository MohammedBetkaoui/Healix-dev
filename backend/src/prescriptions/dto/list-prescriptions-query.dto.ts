import { PrescriptionStatus, PrescriptionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListPrescriptionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  query?: string;

  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @IsOptional()
  @IsEnum(PrescriptionType)
  type?: PrescriptionType;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  patientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  prescriberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  medicationId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
