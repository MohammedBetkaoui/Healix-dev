import { Injectable, Logger } from '@nestjs/common';
import { type DicomStudy, PatientDocumentType } from '@prisma/client';

import { AiAnalysisRunsService } from '../ai-analysis-runs/ai-analysis-runs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertQuotaAvailable,
  EntitlementsService,
} from '../subscriptions/entitlements.service';
import { type AiPipeline } from '../subscriptions/plans/plan-quotas';
import {
  dicomMultiframeNotSupported,
  dicomPipelineNotSupported,
  fromOrthancError,
} from './dicom-errors';
import { DicomStudiesService } from './dicom-studies.service';
import { OrthancClient, type OrthancInstance } from './orthanc.client';

// The chains that read a slice of a DICOM study, and what each is given:
//  - cardio-seg-mri reads a DICOM: the instance's own file, which keeps the
//    pixel spacing (the areas come out in mm²);
//  - brain reads PNG or JPEG only: Orthanc's rendering of the slice, 8 bits,
//    with the windowing of the file.
// The pathology chains read slides and the ECG chain a signal: none reads a
// slice of an MRI.
export const DICOM_ANALYSIS_PIPELINES = ['brain', 'cardio-seg-mri'] as const;
type DicomAnalysisPipeline = (typeof DICOM_ANALYSIS_PIPELINES)[number];

const isAnalysable = (pipeline: string): pipeline is DicomAnalysisPipeline =>
  (DICOM_ANALYSIS_PIPELINES as readonly string[]).includes(pipeline);

const MRI_MODALITY = 'MR';

const label = (value: number | null, fallback: string) =>
  value === null ? fallback : String(value);

@Injectable()
export class DicomAnalysisService {
  private readonly logger = new Logger(DicomAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orthanc: OrthancClient,
    private readonly studies: DicomStudiesService,
    private readonly patients: PatientsService,
    private readonly entitlements: EntitlementsService,
    private readonly files: PatientFileStorageService,
    private readonly audit: PatientAuditService,
    private readonly runs: AiAnalysisRunsService,
  ) {}

  // "Analyser cette coupe": the slice becomes a document of the record, and
  // the document goes through the existing flow of an analysis run (consent,
  // plan, quota, inference, audit), which answers with the run. Nothing of
  // that flow is repeated here.
  //  - 422 DICOM_PIPELINE_NOT_SUPPORTED: a chain that reads no slice, or a
  //    series that is not an MRI;
  //  - 422 DICOM_MULTIFRAME_NOT_SUPPORTED: an instance with several frames;
  //  - 404: a slice of a study of another workspace, like an unknown one.
  async analyze(
    user: AuthenticatedUserPayload,
    orthancInstanceId: string,
    pipeline: AiPipeline,
  ) {
    if (!isAnalysable(pipeline)) {
      throw dicomPipelineNotSupported(pipeline, 'PIPELINE');
    }

    const { instance, study } = await this.studies.getInstanceInScope(
      user,
      orthancInstanceId,
    );
    if (instance.numberOfFrames > 1) {
      throw dicomMultiframeNotSupported(instance.numberOfFrames);
    }

    const series = await this.seriesOf(study, instance);
    if (series.modality !== MRI_MODALITY) {
      throw dicomPipelineNotSupported(pipeline, 'MODALITY', series.modality);
    }

    const patient = await this.patients.getPatientInScope(
      user,
      study.patientId,
    );
    // The same refusals as the run itself, before anything is read or stored.
    await this.patients.assertDiagnosticAiConsentSigned(patient.id);
    assertQuotaAvailable(
      await this.entitlements.getEntitlements(study.workspaceId),
      'aiAnalysesPerMonth',
      pipeline,
    );

    const document = await this.storeSlice(user, {
      instance,
      patientId: patient.id,
      pipeline,
      series,
      study,
    });

    try {
      return await this.runs.create(user, patient.id, {
        pipeline,
        sourceDocumentId: document.id,
      });
    } catch (error) {
      await this.dropUnusedDocument(document.id, document.localPath);
      throw error;
    }
  }

  private async seriesOf(study: DicomStudy, instance: OrthancInstance) {
    try {
      const series = (
        await this.orthanc.getStudySeries(study.orthancStudyId)
      ).find((item) => item.id === instance.parentSeries);
      return {
        modality: series?.modality ?? null,
        number: series?.number ?? null,
        seriesInstanceUid: series?.seriesInstanceUid ?? '',
      };
    } catch (error) {
      throw fromOrthancError(error);
    }
  }

  private async storeSlice(
    user: AuthenticatedUserPayload,
    input: {
      instance: OrthancInstance;
      patientId: string;
      pipeline: DicomAnalysisPipeline;
      series: { number: number | null; seriesInstanceUid: string };
      study: DicomStudy;
    },
  ) {
    const { instance, patientId, pipeline, series, study } = input;
    const dicom = pipeline === 'cardio-seg-mri';

    let content: Buffer;
    try {
      content = dicom
        ? await this.orthanc.getInstanceFile(instance.id)
        : await this.orthanc.getInstanceRendered(instance.id);
    } catch (error) {
      throw fromOrthancError(error);
    }

    const documentType = dicom
      ? PatientDocumentType.DICOM
      : PatientDocumentType.MEDICAL_IMAGE;
    const mimeType = dicom ? 'application/dicom' : 'image/png';
    const extension = dicom ? '.dcm' : '.png';
    const originalName = `serie-${label(series.number, 'x')}-coupe-${label(instance.instanceNumber, 'x')}${extension}`;

    const stored = await this.files.storePatientDocument({
      documentType,
      extension,
      file: {
        buffer: content,
        mimetype: mimeType,
        originalname: originalName,
        size: content.length,
      } as Express.Multer.File,
      patientId,
    });

    try {
      const document = await this.prisma.patientDocument.create({
        data: {
          checksum: stored.checksum,
          dicomStudyId: study.id,
          documentType,
          instanceNumber: instance.instanceNumber,
          localPath: stored.localPath,
          mimeType,
          originalName: stored.originalName,
          patientId,
          seriesInstanceUid: series.seriesInstanceUid || null,
          seriesNumber: series.number,
          size: content.length,
          sopInstanceUid: instance.sopInstanceUid || null,
          storedName: stored.storedName,
          uploadedById: user.sub,
        },
      });
      await this.audit.log(user, 'PATIENT_DOCUMENT_UPLOADED', document.id, {
        dicomStudyId: study.id,
        documentType,
        source: 'DICOM_STUDY',
      });
      return document;
    } catch (error) {
      await this.files.deleteLocalFile(stored.localPath);
      throw error;
    }
  }

  // The run was refused before it existed (consent, plan, quota, a race on the
  // quota): the document made for it would be an orphan. One a run refers to
  // stays: the analysis failed, its source is part of the record.
  private async dropUnusedDocument(
    documentId: string,
    localPath: string,
  ): Promise<void> {
    try {
      const runs = await this.prisma.aiAnalysisRun.count({
        where: { sourceDocumentId: documentId },
      });
      if (runs === 0) {
        await this.prisma.patientDocument.delete({ where: { id: documentId } });
        await this.files.deleteLocalFile(localPath);
      }
    } catch (error) {
      this.logger.warn(
        `Could not remove an unused slice document: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
