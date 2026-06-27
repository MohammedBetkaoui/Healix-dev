import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CabinetType } from '../../../common/enums/cabinet-type.enum';
import { DoctorType } from '../../../common/enums/doctor-type.enum';
import { DoctorVerificationStep } from '../../../common/enums/doctor-verification-step.enum';
import { FiscalActivityType } from '../../../common/enums/fiscal-activity-type.enum';
import { IdentityDocumentType } from '../../../common/enums/identity-document-type.enum';
import { ProfessionalStatus } from '../../../common/enums/professional-status.enum';

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
}

export class UpdateDoctorVerificationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  birthPlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ninOrIdNumber?: string;

  @IsOptional()
  @IsEnum(IdentityDocumentType)
  identityDocumentType?: keyof typeof IdentityDocumentType;

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
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsEnum(DoctorType)
  doctorType?: keyof typeof DoctorType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  speciality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  mainDegree?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  university?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsInt()
  @Min(1900)
  @Max(2100)
  graduationYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  specialityDegree?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsInt()
  @Min(1900)
  @Max(2100)
  specialityGraduationYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  regionalCouncil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  registrationWilaya?: string;

  @IsOptional()
  @IsISO8601()
  registrationDate?: string;

  @IsOptional()
  @IsEnum(ProfessionalStatus)
  professionalStatus?: keyof typeof ProfessionalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  practiceAuthorizationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  authorizationAuthority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cabinetName?: string;

  @IsOptional()
  @IsEnum(CabinetType)
  cabinetType?: keyof typeof CabinetType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cabinetAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cabinetWilaya?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cabinetCommune?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cabinetPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  cabinetEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  healthDirectionWilaya?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cabinetOpeningAuthorization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxCenter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  casnosNumber?: string;

  @IsOptional()
  @IsEnum(FiscalActivityType)
  fiscalActivityType?: keyof typeof FiscalActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  professionalRib?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  confirmationAccuracy?: boolean;

  @IsOptional()
  @IsEnum(DoctorVerificationStep)
  currentStep?: keyof typeof DoctorVerificationStep;
}
