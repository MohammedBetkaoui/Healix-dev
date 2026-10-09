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
import { BRAIN_LABELS } from '../ai-service.client';

// A physician may correct to a class the model does not know.
export const AI_DECISION_LABELS = [...BRAIN_LABELS, 'other'] as const;
export type AiDecisionLabel = (typeof AI_DECISION_LABELS)[number];

export const AI_DECISION_STATUSES = Object.values(AiRunDecision);

const needsReason = (dto: DecideAiAnalysisRunDto) =>
  dto.status !== AiRunDecision.VALIDATED || dto.reason !== undefined;

// The physician's final decision on a SUCCEEDED run (POST .../decision).
// "Different from the model's top class" needs the run: checked in the service.
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
