import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DicomController } from './dicom.controller';
import { DicomImportService } from './dicom-import.service';
import { DicomStudiesService } from './dicom-studies.service';
import { DicomUploadDirInterceptor } from './dicom-upload';
import { OrthancClient } from './orthanc.client';
import { ORTHANC_SETTINGS, orthancSettings } from './orthanc.config';

@Module({
  imports: [PrismaModule, PatientsModule, SubscriptionsModule],
  controllers: [DicomController],
  providers: [
    // Read when the application starts: in production, a missing, short or
    // default Orthanc password stops it, like the JWT secrets.
    {
      inject: [ConfigService],
      provide: ORTHANC_SETTINGS,
      useFactory: orthancSettings,
    },
    OrthancClient,
    DicomImportService,
    DicomStudiesService,
    DicomUploadDirInterceptor,
  ],
  // The DICOMweb proxy and the slice analysis (next commits) read the studies
  // and talk to Orthanc through these.
  exports: [OrthancClient, DicomStudiesService],
})
export class DicomModule {}
