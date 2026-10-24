import { Injectable } from '@nestjs/common';
import { AiAnalysisRunStatus } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { PatientsService } from '../../patients/patients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { type AiPipeline } from '../dto/create-ai-analysis-run.dto';
import {
  type AiTimeline,
  buildAiTimeline,
  TIMELINE_RUN_SELECT,
} from './ai-timeline';

// GET /patients/:id/ai-timeline: the SUCCEEDED runs of a patient for one
// chain, oldest first, with their comparable measures.
@Injectable()
export class AiTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
  ) {}

  async timeline(
    user: AuthenticatedUserPayload,
    patientId: string,
    pipeline: AiPipeline,
  ): Promise<AiTimeline> {
    // A patient of another workspace answers 404, as everywhere in the record.
    await this.patientsService.getPatientInScope(user, patientId);

    const runs = await this.prisma.aiAnalysisRun.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: TIMELINE_RUN_SELECT,
      where: { patientId, pipeline, status: AiAnalysisRunStatus.SUCCEEDED },
    });

    return buildAiTimeline(patientId, pipeline, runs);
  }
}
