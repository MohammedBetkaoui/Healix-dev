import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { trimStringValue } from '../../common/utils/transform-input';

export const AI_PIPELINES = ['brain'] as const;
export type AiPipeline = (typeof AI_PIPELINES)[number];

// Starts a real inference (unlike CreatePatientAiAnalysisDto, a manual record).
export class CreateAiAnalysisRunDto {
  @IsIn(AI_PIPELINES)
  pipeline!: AiPipeline;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  sourceDocumentId!: string;

  // The clinician's reading before the result, kept to compare with it.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimStringValue)
  clinicianImpression?: string;
}
