import { Module } from '@nestjs/common';

import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import {
  AiAnalysisRunsController,
  AiModelsController,
} from './ai-analysis-runs.controller';
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';
import { AiRunsOverviewController } from './overview/ai-runs-overview.controller';
import { AiRunsOverviewService } from './overview/ai-runs-overview.service';
import { AiTimelineController } from './timeline/ai-timeline.controller';
import { AiTimelineService } from './timeline/ai-timeline.service';
import { AiAnalysisReportsService } from './report/ai-analysis-reports.service';
import { AiReportRenderer } from './report/ai-report-renderer';
import { CardioEvaluationService } from './report/cardio-evaluation';
import { CardioSegEvaluationService } from './report/cardio-seg-evaluation';
import { CardioVolumeEvaluationService } from './report/cardio-volume-evaluation';

@Module({
  imports: [
    PrismaModule,
    PatientsModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [
    AiAnalysisRunsController,
    AiModelsController,
    AiRunsOverviewController,
    AiTimelineController,
  ],
  providers: [
    AiAnalysisRunsService,
    AiServiceClient,
    AiAnalysisReportsService,
    AiReportRenderer,
    AiRunsOverviewService,
    AiTimelineService,
    CardioEvaluationService,
    CardioSegEvaluationService,
    CardioVolumeEvaluationService,
  ],
  // The analysis of a slice of a DICOM study goes through the same creation
  // flow as any run.
  exports: [AiAnalysisRunsService],
})
export class AiAnalysisRunsModule {}
