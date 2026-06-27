import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { VerificationStatus } from '../../../common/enums/verification-status.enum';

const verificationTypes = ['ESTABLISHMENT', 'INDEPENDENT_DOCTOR'] as const;
const sortFields = ['submittedAt', 'updatedAt', 'status', 'type'] as const;
const sortOrders = ['asc', 'desc'] as const;

export class ListVerificationsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  search?: string;

  @IsIn(verificationTypes)
  @IsOptional()
  type?: (typeof verificationTypes)[number];

  @IsIn(Object.values(VerificationStatus))
  @IsOptional()
  status?: VerificationStatus;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  wilaya?: string;

  @IsDateString()
  @IsOptional()
  submittedFrom?: string;

  @IsDateString()
  @IsOptional()
  submittedTo?: string;

  @IsIn(sortFields)
  @IsOptional()
  sortBy?: (typeof sortFields)[number] = 'submittedAt';

  @IsIn(sortOrders)
  @IsOptional()
  sortOrder?: (typeof sortOrders)[number] = 'desc';
}
