import { Transform } from 'class-transformer';
import {
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AiRunDecision } from '@prisma/client';

import { normalizeStringWhitespace } from '../../common/utils/transform-input';
import { BRAIN_LABELS, BREAST_DECISIONS } from '../ai-service.client';
import { type AiPipeline } from './create-ai-analysis-run.dto';

// What a physician may correct to, per chain: a class the model gives, or
// one it does not know ("other"). The nuclei segmentation is a map to review
// (validated or rejected), never corrected to a class.
export const CORRECTION_LABELS: Readonly<
  Record<AiPipeline, readonly string[]>
> = {
  brain: [...BRAIN_LABELS, 'other'],
  'pathology-breast': [...BREAST_DECISIONS, 'other'],
  'pathology-nuclei': [],
};

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

  // Required for CORRECTED only; refused otherwise (in the service).
  @ValidateIf(
    (dto: DecideAiAnalysisRunDto) => dto.status === AiRunDecision.CORRECTED,
  )
  @IsIn(AI_DECISION_LABELS)
  correctedLabel?: AiDecisionLabel;

  // Required for CORRECTED and REJECTED, optional for VALIDATED. Measured as
  // stored: trimmed, inner whitespace collapsed (sanitizeTextInput).
  @ValidateIf(needsReason)
  @Transform(normalizeStringWhitespace)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;
}
