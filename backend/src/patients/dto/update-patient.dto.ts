import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PatientAdministrativeStatus } from '../../common/enums/patient-administrative-status.enum';
import { PatientBloodGroup } from '../../common/enums/patient-blood-group.enum';
import { PatientGender } from '../../common/enums/patient-gender.enum';
import { PatientInsurance } from '../../common/enums/patient-insurance.enum';
import { PatientSector } from '../../common/enums/patient-sector.enum';
import { PatientStatus } from '../../common/enums/patient-status.enum';
import { PatientMedicalSummaryDto } from './patient-medical-summary.dto';

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstNameAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastNameAr?: string;

  @IsOptional()
  @IsEnum(PatientGender)
  gender?: keyof typeof PatientGender;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  nationalId?: string;

  @IsOptional()
  @IsEnum(PatientBloodGroup)
  bloodGroup?: keyof typeof PatientBloodGroup;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  address?: string;

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
  @MinLength(2)
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsEnum(PatientInsurance)
  insurance?: keyof typeof PatientInsurance;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  insuredNumber?: string;

  @IsOptional()
  @IsEnum(PatientSector)
  sector?: keyof typeof PatientSector;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  hospitalRecordNumber?: string;

  @IsOptional()
  @IsEnum(PatientStatus)
  status?: keyof typeof PatientStatus;

  @IsOptional()
  @IsEnum(PatientAdministrativeStatus)
  administrativeStatus?: keyof typeof PatientAdministrativeStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  smsEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatientMedicalSummaryDto)
  medicalSummary?: PatientMedicalSummaryDto;
}
