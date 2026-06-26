import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { EstablishmentType } from '../../../common/enums/establishment-type.enum';
import { VerificationStep } from '../../../common/enums/verification-step.enum';

export class UpdateEstablishmentVerificationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEnum(EstablishmentType)
  type?: keyof typeof EstablishmentType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  legalForm?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  wilaya?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  commune?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  professionalEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commercialRegisterNumber?: string;

  @IsOptional()
  @IsISO8601()
  commercialRegisterIssuedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commercialRegisterWilaya?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxCenter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  healthAuthorizationNumber?: string;

  @IsOptional()
  @IsISO8601()
  healthAuthorizationIssuedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  healthAuthorizationAuthority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  healthDirectionWilaya?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  authorizedActivityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalRepresentativeFullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalRepresentativeFunction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  legalRepresentativeNinOrId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  legalRepresentativePhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  legalRepresentativeEmail?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  confirmationAccuracy?: boolean;

  @IsOptional()
  @IsEnum(VerificationStep)
  currentStep?: keyof typeof VerificationStep;
}
