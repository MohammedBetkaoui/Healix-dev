import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PatientAiAnalysisResult } from '../../common/enums/patient-ai-analysis-result.enum';
import { PatientAiAnalysisType } from '../../common/enums/patient-ai-analysis-type.enum';

// This is a manual record of a result, not a trigger for real inference —
// no model is called by this endpoint (see patients.service.ts#createAiAnalysis).
export class CreatePatientAiAnalysisDto {
  @IsEnum(PatientAiAnalysisType)
  type!: keyof typeof PatientAiAnalysisType;

  @IsEnum(PatientAiAnalysisResult)
  result!: keyof typeof PatientAiAnalysisResult;

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  modelName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  modelVersion?: string;

  @IsOptional()
  @IsString()
  sourceDocumentId?: string;
}
