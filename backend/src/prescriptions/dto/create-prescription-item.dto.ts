import {
  AdministrationRoute,
  PharmaceuticalForm,
  PrescriptionRegulatoryCategory,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePrescriptionItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  medicationId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  dci!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  brandName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  strength!: string;

  @IsEnum(PharmaceuticalForm)
  pharmaceuticalForm!: PharmaceuticalForm;

  @IsEnum(AdministrationRoute)
  route!: AdministrationRoute;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  manufacturer?: string;

  @IsEnum(PrescriptionRegulatoryCategory)
  regulatoryCategory!: PrescriptionRegulatoryCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  dosePerIntake!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  frequency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  intakeMoment?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  patientInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  indication?: string;

  @IsOptional()
  @IsBoolean()
  asNeeded?: boolean;

  @IsOptional()
  @IsBoolean()
  renewalAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  substitutionAllowed?: boolean;
}
