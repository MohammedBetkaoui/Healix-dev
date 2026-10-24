import { IsIn } from 'class-validator';

import {
  AI_PIPELINES,
  type AiPipeline,
} from '../dto/create-ai-analysis-run.dto';

// GET /patients/:id/ai-timeline?pipeline=: the chain whose runs are followed.
// Runs of two chains share no measure, so one chain at a time.
export class AiTimelineQueryDto {
  @IsIn(AI_PIPELINES)
  pipeline!: AiPipeline;
}
