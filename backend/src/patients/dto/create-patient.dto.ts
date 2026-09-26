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

import { PatientBloodGroup } from '../../common/enums/patient-blood-group.enum';
import { PatientGender } from '../../common/enums/patient-gender.enum';
import { PatientInsurance } from '../../common/enums/patient-insurance.enum';
import { PatientSector } from '../../common/enums/patient-sector.enum';

export class CreatePatientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstNameAr!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastNameAr!: string;

  @IsEnum(PatientGender)
  gender!: keyof typeof PatientGender;

  @IsISO8601()
  birthDate!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  nationalId!: string;

  @IsOptional()
  @IsEnum(PatientBloodGroup)
  bloodGroup?: keyof typeof PatientBloodGroup;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(255)
  address!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  wilaya!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  commune!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  emergencyContactName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  emergencyContactPhone!: string;

  @IsEnum(PatientInsurance)
  insurance!: keyof typeof PatientInsurance;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  insuredNumber?: string;

  @IsEnum(PatientSector)
  sector!: keyof typeof PatientSector;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  hospitalRecordNumber?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  smsEnabled?: boolean;
}
