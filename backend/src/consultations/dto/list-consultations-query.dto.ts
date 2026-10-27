import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ConsultationStatus } from '@prisma/client';

export const PRESCRIPTION_FILTERS = ['with', 'without'] as const;
export type PrescriptionFilter = (typeof PRESCRIPTION_FILTERS)[number];

export class ListConsultationsQueryDto {
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

  /** Name of the patient, reason or diagnosis. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  patientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  doctorId?: string;

  @IsOptional()
  @IsIn(Object.values(ConsultationStatus))
  status?: ConsultationStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Only the consultations with (or without) a linked prescription. */
  @IsOptional()
  @IsIn(PRESCRIPTION_FILTERS)
  prescription?: PrescriptionFilter;

  /** Only the consultations recorded by the caller. */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  mine?: boolean;
}
