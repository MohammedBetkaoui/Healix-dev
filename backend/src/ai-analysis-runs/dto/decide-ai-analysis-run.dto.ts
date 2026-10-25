import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AiRunDecision } from '@prisma/client';

import { normalizeStringWhitespace } from '../../common/utils/transform-input';
import {
  BRAIN_LABELS,
  BREAST_DECISIONS,
  ECG_CLASSES,
  type EcgClass,
} from '../ai-service.client';
import { type AiPipeline } from './create-ai-analysis-run.dto';

// What a physician may correct to, per chain: a class the model gives, or
// one it does not know ("other"). The nuclei segmentation is a map to review
// (validated or rejected), never corrected to a class, and so is the cardiac
// MRI segmentation. The ECG is
// multi-label: corrected to a set of classes (correctedLabels), not to one. The cine
// volumetry is corrected through its measures (PATCH .../volumetry), not through a label:
// its decision is CORRECTED when the physician changed them.
export const CORRECTION_LABELS: Readonly<
  Record<AiPipeline, readonly string[]>
> = {
  brain: [...BRAIN_LABELS, 'other'],
  'cardio-ecg': [],
  'cardio-seg-mri': [],
  'cardio-volume-mri': [],
  'pathology-breast': [...BREAST_DECISIONS, 'other'],
  'pathology-nuclei': [],
};

// "Normal" excludes every other class of the ECG.
export const ECG_NORMAL_CLASS: EcgClass = 'NORM';

// Every label of every chain; the service checks the run's own chain.
export const AI_DECISION_LABELS = [
  ...BRAIN_LABELS,
  ...BREAST_DECISIONS,
  'other',
] as const;
export type AiDecisionLabel = (typeof AI_DECISION_LABELS)[number];

export const AI_DECISION_STATUSES = Object.values(AiRunDecision);

const needsReason = (dto: DecideAiAnalysisRunDto) =>
  dto.status !== AiRunDecision.VALIDATED || dto.reason !== undefined;

// The physician's final decision on a SUCCEEDED run (POST .../decision).
// "Different from the model's answer" and "a label of this chain" need the
// run: checked in the service.
export class DecideAiAnalysisRunDto {
  @IsIn(AI_DECISION_STATUSES)
  status!: AiRunDecision;

  // Required for CORRECTED only, except on an ECG (correctedLabels) and on a cine
  // volumetry (measuresCorrected); refused otherwise (in the service).
  @ValidateIf(
    (dto: DecideAiAnalysisRunDto) =>
      dto.status === AiRunDecision.CORRECTED &&
      dto.correctedLabels === undefined &&
      dto.measuresCorrected !== true,
  )
  @IsIn(AI_DECISION_LABELS)
  correctedLabel?: AiDecisionLabel;

  // Cardiac cine volumetry only: the decision is the correction of its measures, the
  // ones the physician saved (PATCH .../volumetry), not a label. Checked in the service.
  @IsOptional()
  @IsBoolean()
  measuresCorrected?: boolean;

  // ECG only: the classes kept, a non-empty set, NORM alone or without it
  // (checked in the service, with the chain).
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(ECG_CLASSES.length)
  @ArrayUnique()
  @IsIn(ECG_CLASSES, { each: true })
  correctedLabels?: EcgClass[];

  // Required for CORRECTED and REJECTED, optional for VALIDATED. Measured as
  // stored: trimmed, inner whitespace collapsed (sanitizeTextInput).
  @ValidateIf(needsReason)
  @Transform(normalizeStringWhitespace)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;
}
