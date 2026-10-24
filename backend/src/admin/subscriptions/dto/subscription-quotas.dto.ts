import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { AI_PIPELINES } from '../../../subscriptions/plans/plan-quotas';

const MAX_QUOTA = 10_000_000;

// The quotas an administrator fixes for an account. A key left out keeps the
// value the plan gives; null is unlimited (aiPipelines null: every pipeline).
export class SubscriptionQuotasDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUOTA)
  maxPatients?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUOTA)
  aiAnalysesPerMonth?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUOTA)
  maxDoctors?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(AI_PIPELINES, { each: true })
  aiPipelines?: string[] | null;
}
