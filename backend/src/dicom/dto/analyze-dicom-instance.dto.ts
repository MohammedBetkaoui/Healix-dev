import { IsIn } from 'class-validator';

import {
  AI_PIPELINES,
  type AiPipeline,
} from '../../subscriptions/plans/plan-quotas';

// Any of the five chains is a valid name; the ones that cannot read a DICOM
// slice are refused by the service (422 DICOM_PIPELINE_NOT_SUPPORTED), not as
// a malformed request.
export class AnalyzeDicomInstanceDto {
  @IsIn(AI_PIPELINES)
  pipeline!: AiPipeline;
}
