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

import { AccountStatus } from '../../../common/enums/account-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';

const sortFields = ['createdAt', 'fullName', 'email', 'role', 'accountStatus'] as const;
const sortOrders = ['asc', 'desc'] as const;

export class ListUsersQueryDto {
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

  @IsIn(Object.values(UserRole))
  @IsOptional()
  role?: UserRole;

  @IsIn(Object.values(AccountStatus))
  @IsOptional()
  accountStatus?: AccountStatus;

  @IsIn(Object.values(VerificationStatus))
  @IsOptional()
  verificationStatus?: VerificationStatus;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  wilaya?: string;

  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @IsDateString()
  @IsOptional()
  createdTo?: string;

  @IsIn(sortFields)
  @IsOptional()
  sortBy?: (typeof sortFields)[number] = 'createdAt';

  @IsIn(sortOrders)
  @IsOptional()
  sortOrder?: (typeof sortOrders)[number] = 'desc';
}
