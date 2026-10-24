import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiAnalysisRunsModule } from '../ai-analysis-runs/ai-analysis-runs.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DicomController } from './dicom.controller';
import { DicomAnalysisService } from './dicom-analysis.service';
import { DicomImportService } from './dicom-import.service';
import { DicomStudiesService } from './dicom-studies.service';
import { DicomUploadDirInterceptor } from './dicom-upload';
import { DicomWebController } from './dicomweb.controller';
import { DicomWebProxyService } from './dicomweb-proxy.service';
import { OrthancClient } from './orthanc.client';
import { ORTHANC_SETTINGS, orthancSettings } from './orthanc.config';

@Module({
  imports: [
    AiAnalysisRunsModule,
    PatientsModule,
    PrismaModule,
    SubscriptionsModule,
  ],
  controllers: [DicomController, DicomWebController],
  providers: [
    // Read when the application starts: in production, a missing, short or
    // default Orthanc password stops it, like the JWT secrets.
    {
      inject: [ConfigService],
      provide: ORTHANC_SETTINGS,
      useFactory: orthancSettings,
    },
    OrthancClient,
    DicomAnalysisService,
    DicomImportService,
    DicomStudiesService,
    DicomUploadDirInterceptor,
    DicomWebProxyService,
  ],
  // The slice analysis (next commit) reads the studies and talks to Orthanc
  // through these.
  exports: [OrthancClient, DicomStudiesService],
})
export class DicomModule {}
