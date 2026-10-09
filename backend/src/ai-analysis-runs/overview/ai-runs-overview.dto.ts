import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { AiAnalysisRunStatus } from '@prisma/client';

// "pending": a SUCCEEDED run the physician has not decided yet.
export const AI_RUN_DECISION_FILTERS = [
  'pending',
  'VALIDATED',
  'CORRECTED',
  'REJECTED',
] as const;
export type AiRunDecisionFilter = (typeof AI_RUN_DECISION_FILTERS)[number];

export const AI_RUNS_PAGE_LIMIT_MAX = 50;

// The period, on the analysis date (createdAt): ISO instants, both included.
export class AiRunsPeriodQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

// GET /ai-analysis-runs
export class ListAiAnalysisRunsQueryDto extends AiRunsPeriodQueryDto {
  @IsOptional()
  @IsIn(AI_RUN_DECISION_FILTERS)
  decision?: AiRunDecisionFilter;

  @IsOptional()
  @IsIn(Object.values(AiAnalysisRunStatus))
  status?: AiAnalysisRunStatus;

  // Only the runs the current user requested.
  @IsOptional()
  @IsIn(['me'])
  requestedBy?: 'me';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AI_RUNS_PAGE_LIMIT_MAX)
  @IsOptional()
  limit?: number = 20;
}

// GET /ai-analysis-runs/summary
export class AiRunsSummaryQueryDto extends AiRunsPeriodQueryDto {}
