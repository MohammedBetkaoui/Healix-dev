import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { AiAnalysisRunStatus } from '@prisma/client';

import {
  AI_PIPELINES,
  type AiPipeline,
} from '../dto/create-ai-analysis-run.dto';
import {
  AI_PRIORITY_LEVELS,
  type AiPriorityLevel,
} from '../priority/ai-priority';

// "pending": a SUCCEEDED run the physician has not decided yet.
export const AI_RUN_DECISION_FILTERS = [
  'pending',
  'VALIDATED',
  'CORRECTED',
  'REJECTED',
] as const;
export type AiRunDecisionFilter = (typeof AI_RUN_DECISION_FILTERS)[number];

export const AI_RUNS_PAGE_LIMIT_MAX = 50;

// "priority": the reading order of the runs waiting for a decision (the
// results the model finds suspicious first, see priority/ai-priority.ts), then
// the others, the latest first. The default is the date.
export const AI_RUN_SORTS = ['createdAt', 'priority'] as const;
export type AiRunSort = (typeof AI_RUN_SORTS)[number];

// The period, on the analysis date (createdAt): ISO instants, both included.
export class AiRunsPeriodQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

// The period, and optionally one chain (brain, pathology-breast,
// pathology-nuclei).
export class AiRunsFilterQueryDto extends AiRunsPeriodQueryDto {
  @IsOptional()
  @IsIn(AI_PIPELINES)
  pipeline?: AiPipeline;
}

// GET /ai-analysis-runs
export class ListAiAnalysisRunsQueryDto extends AiRunsFilterQueryDto {
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

  @IsOptional()
  @IsIn(AI_RUN_SORTS)
  sort?: AiRunSort;

  // Only the runs of this reading priority. A priority is read from the run
  // when it is listed, so the filter implies the priority order.
  @IsOptional()
  @IsIn(AI_PRIORITY_LEVELS)
  priority?: AiPriorityLevel;

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
export class AiRunsSummaryQueryDto extends AiRunsFilterQueryDto {}
