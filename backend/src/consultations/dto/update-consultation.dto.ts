import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ConsultationVitalSignsDto {
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(300)
  systolicBp?: number | null;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(200)
  diastolicBp?: number | null;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(300)
  heartRate?: number | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(100)
  respiratoryRate?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  oxygenSaturation?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  temperature?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(700)
  weightKg?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(300)
  heightCm?: number | null;
}

export class ConsultationDiagnosisDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  codeSystem?: string | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string | null;
}

export class UpdateConsultationDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  chiefComplaint?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  historyPresentIllness?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  clinicalExamination?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  assessment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  carePlan?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  followUpPlan?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsultationVitalSignsDto)
  vitalSigns?: ConsultationVitalSignsDto | null;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConsultationDiagnosisDto)
  diagnoses?: ConsultationDiagnosisDto[];
}
