import { Module } from '@nestjs/common';

import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AiAnalysisRunsController,
  AiModelsController,
} from './ai-analysis-runs.controller';
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';
import { AiRunsOverviewController } from './overview/ai-runs-overview.controller';
import { AiRunsOverviewService } from './overview/ai-runs-overview.service';
import { AiAnalysisReportsService } from './report/ai-analysis-reports.service';
import { AiReportRenderer } from './report/ai-report-renderer';
import { CardioEvaluationService } from './report/cardio-evaluation';
import { CardioSegEvaluationService } from './report/cardio-seg-evaluation';

@Module({
  imports: [PrismaModule, PatientsModule, NotificationsModule],
  controllers: [
    AiAnalysisRunsController,
    AiModelsController,
    AiRunsOverviewController,
  ],
  providers: [
    AiAnalysisRunsService,
    AiServiceClient,
    AiAnalysisReportsService,
    AiReportRenderer,
    AiRunsOverviewService,
    CardioEvaluationService,
    CardioSegEvaluationService,
  ],
})
export class AiAnalysisRunsModule {}
