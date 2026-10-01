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

import { UserRole } from '../../../common/enums/user-role.enum';
import { trimStringValue } from '../../../common/utils/transform-input';

const sortFields = ['createdAt', 'action', 'entityType'] as const;
const sortOrders = ['asc', 'desc'] as const;

export class ListAuditLogsQueryDto {
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

  @Transform(trimStringValue)
  @IsString()
  @IsOptional()
  search?: string;

  @Transform(trimStringValue)
  @IsString()
  @IsOptional()
  action?: string;

  @IsIn(Object.values(UserRole))
  @IsOptional()
  role?: UserRole;

  @Transform(trimStringValue)
  @IsString()
  @IsOptional()
  userId?: string;

  @Transform(trimStringValue)
  @IsString()
  @IsOptional()
  entityType?: string;

  @Transform(trimStringValue)
  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsIn(sortFields)
  @IsOptional()
  sortBy?: (typeof sortFields)[number] = 'createdAt';

  @IsIn(sortOrders)
  @IsOptional()
  sortOrder?: (typeof sortOrders)[number] = 'desc';
}
