import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { trimStringValue } from '../../common/utils/transform-input';

// Three independent chains, never run one after the other.
export const AI_PIPELINES = [
  'brain',
  'pathology-breast',
  'pathology-nuclei',
] as const;
export type AiPipeline = (typeof AI_PIPELINES)[number];

// Microscope magnification of a histopathology slide.
export const AI_MAGNIFICATIONS = [40, 100, 200, 400] as const;
export type AiMagnification = (typeof AI_MAGNIFICATIONS)[number];

// The nuclei segmenter was trained on H&E patches at 40x only.
export const NUCLEI_MAGNIFICATION = 40;

// Starts a real inference (unlike CreatePatientAiAnalysisDto, a manual record).
export class CreateAiAnalysisRunDto {
  @IsIn(AI_PIPELINES)
  pipeline!: AiPipeline;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  sourceDocumentId!: string;

  // Pathology only (checked per chain in the service): required for the
  // breast classification, 40 for the nuclei segmentation, refused for brain.
  @IsOptional()
  @IsInt()
  @IsIn(AI_MAGNIFICATIONS)
  magnification?: AiMagnification;

  // The clinician's reading before the result, kept to compare with it.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimStringValue)
  clinicianImpression?: string;
}
