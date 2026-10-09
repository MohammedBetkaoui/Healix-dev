import { Module } from '@nestjs/common';

import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AiAnalysisRunsController,
  AiModelsController,
} from './ai-analysis-runs.controller';
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';
import { AiAnalysisReportsService } from './report/ai-analysis-reports.service';
import { AiReportRenderer } from './report/ai-report-renderer';

@Module({
  imports: [PrismaModule, PatientsModule],
  controllers: [AiAnalysisRunsController, AiModelsController],
  providers: [
    AiAnalysisRunsService,
    AiServiceClient,
    AiAnalysisReportsService,
    AiReportRenderer,
  ],
})
export class AiAnalysisRunsModule {}
