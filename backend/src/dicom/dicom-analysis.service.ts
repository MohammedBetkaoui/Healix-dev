import { Injectable, Logger } from '@nestjs/common';
import { type DicomStudy, PatientDocumentType } from '@prisma/client';

import {
  AiAnalysisRunsService,
  CARDIO_VOLUME_PIPELINE,
} from '../ai-analysis-runs/ai-analysis-runs.service';
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
  dicomCineStackInvalid,
  dicomMultiframeNotSupported,
  dicomPipelineNotSupported,
  dicomSeriesNotFound,
  fromOrthancError,
} from './dicom-errors';
import { DicomStudiesService } from './dicom-studies.service';
import {
  type CineStack,
  type CineStackView,
  detectCineStacks,
  toCineStackView,
} from './cine-stacks';
import {
  isOrthancId,
  OrthancClient,
  type OrthancInstance,
} from './orthanc.client';
import { buildStoredZip } from './stored-zip';

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

// The images of a cine are downloaded from the store a few at a time.
const CINE_DOWNLOAD_CONCURRENCY = 6;

async function mapConcurrently<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

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

  // The cine stacks of a study: the MRI series with several phases at each slice
  // position, the ones the analysis cannot read shown with their reason. A study
  // of another workspace answers 404.
  async listCineStacks(
    user: AuthenticatedUserPayload,
    studyId: string,
  ): Promise<CineStackView[]> {
    const study = await this.studies.getStudyInScope(user, studyId);
    const stacks = await this.cineStacksOf(study);
    return stacks.map(toCineStackView);
  }

  // "Mesurer le cœur": a cine series of a study becomes one document of the record
  // (a ZIP of its DICOM files), and the document goes through the same flow as any
  // run (consent, plan, quota, inference, audit), which answers with the run.
  //  - 404: a series that is not in a study of the caller's workspace;
  //  - 422 DICOM_CINE_STACK_INVALID: a series the analysis cannot read, before
  //    anything is downloaded.
  async analyzeCineStack(
    user: AuthenticatedUserPayload,
    studyId: string,
    seriesId: string,
  ) {
    const study = await this.studies.getStudyInScope(user, studyId);
    if (!isOrthancId(seriesId)) {
      throw dicomSeriesNotFound();
    }
    const stack = (await this.cineStacksOf(study)).find(
      (item) => item.seriesId === seriesId,
    );
    if (!stack) {
      throw dicomSeriesNotFound();
    }
    if (stack.refusal) {
      throw dicomCineStackInvalid(stack.refusal);
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
      CARDIO_VOLUME_PIPELINE,
    );

    const document = await this.storeCineStack(user, {
      patientId: patient.id,
      stack,
      study,
    });

    try {
      return await this.runs.create(user, patient.id, {
        pipeline: CARDIO_VOLUME_PIPELINE,
        sourceDocumentId: document.id,
      });
    } catch (error) {
      await this.dropUnusedDocument(document.id, document.localPath);
      throw error;
    }
  }

  private async cineStacksOf(study: DicomStudy): Promise<CineStack[]> {
    try {
      const [series, instances] = await Promise.all([
        this.orthanc.getStudySeries(study.orthancStudyId),
        this.orthanc.getStudyInstances(study.orthancStudyId),
      ]);
      return detectCineStacks(series, instances);
    } catch (error) {
      throw fromOrthancError(error, dicomSeriesNotFound);
    }
  }

  private async storeCineStack(
    user: AuthenticatedUserPayload,
    input: { patientId: string; stack: CineStack; study: DicomStudy },
  ) {
    const { patientId, stack, study } = input;

    let files: Buffer[];
    try {
      files = await mapConcurrently(
        stack.instanceIds,
        CINE_DOWNLOAD_CONCURRENCY,
        (id) => this.orthanc.getInstanceFile(id),
      );
    } catch (error) {
      throw fromOrthancError(error, dicomSeriesNotFound);
    }
    // The names only keep the order the service reads them in.
    const zip = buildStoredZip(
      files.map((data, index) => ({
        data,
        name: `${String(index + 1).padStart(4, '0')}.dcm`,
      })),
    );

    const documentType = PatientDocumentType.DICOM;
    const mimeType = 'application/zip';
    const originalName = `serie-${label(stack.number, 'x')}-cine.zip`;
    const stored = await this.files.storePatientDocument({
      documentType,
      extension: '.zip',
      file: {
        buffer: zip,
        mimetype: mimeType,
        originalname: originalName,
        size: zip.length,
      } as Express.Multer.File,
      patientId,
    });

    try {
      const document = await this.prisma.patientDocument.create({
        data: {
          checksum: stored.checksum,
          dicomSeries: {
            description: stack.description,
            instances: stack.instances,
            phases: stack.phases,
            seriesInstanceUid: stack.seriesInstanceUid || null,
            seriesNumber: stack.number,
            slices: stack.slices,
          },
          dicomStudyId: study.id,
          documentType,
          localPath: stored.localPath,
          mimeType,
          originalName: stored.originalName,
          patientId,
          seriesInstanceUid: stack.seriesInstanceUid || null,
          seriesNumber: stack.number,
          size: zip.length,
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
