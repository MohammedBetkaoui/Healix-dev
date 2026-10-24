import { Injectable, Logger } from '@nestjs/common';
import { type DicomStudy } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  dicomInstanceNotFound,
  dicomStudyNotFound,
  fromOrthancError,
} from './dicom-errors';
import { sortInstancesByPosition } from './dicom-instance-order';
import { type DicomStudyView, toDicomStudyView } from './dicom-study-view';
import {
  OrthancClient,
  type OrthancInstance,
  type OrthancSeries,
  type RenderOptions,
  isOrthancId,
} from './orthanc.client';

export type DicomInstanceView = {
  /** Frames in the instance; more than one is a multi-frame instance. */
  frames: number;
  /** The identifier in Orthanc: what the preview and the analysis take. */
  id: string;
  instanceNumber: number | null;
  multiFrame: boolean;
  sopInstanceUid: string;
};

export type DicomSeriesView = {
  description: string | null;
  id: string;
  /** Instances sorted along the stack (see dicom-instance-order.ts). */
  instances: DicomInstanceView[];
  instancesCount: number;
  modality: string | null;
  number: number | null;
  seriesInstanceUid: string;
};

export type DicomStudyDetail = DicomStudyView & { series: DicomSeriesView[] };

// The studies of the workspace of the caller, read from the rows and from
// Orthanc. A study of another workspace is a 404, like an unknown one.
@Injectable()
export class DicomStudiesService {
  private readonly logger = new Logger(DicomStudiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orthanc: OrthancClient,
    private readonly patients: PatientsService,
    private readonly audit: PatientAuditService,
  ) {}

  async listForPatient(
    user: AuthenticatedUserPayload,
    patientId: string,
  ): Promise<DicomStudyView[]> {
    await this.patients.getPatientInScope(user, patientId);
    const { workspaceId } = await this.patients.getPatientScope(user);

    const rows = await this.prisma.dicomStudy.findMany({
      orderBy: [{ studyDate: 'desc' }, { createdAt: 'desc' }],
      where: { patientId, workspaceId },
    });
    return rows.map(toDicomStudyView);
  }

  // The study with its series, and their instances in the order of the stack.
  async findOne(
    user: AuthenticatedUserPayload,
    id: string,
  ): Promise<DicomStudyDetail> {
    const row = await this.getStudyInScope(user, id);

    let series: OrthancSeries[];
    let instances: OrthancInstance[];
    try {
      [series, instances] = await Promise.all([
        this.orthanc.getStudySeries(row.orthancStudyId),
        this.orthanc.getStudyInstances(row.orthancStudyId),
      ]);
    } catch (error) {
      throw fromOrthancError(error, dicomStudyNotFound);
    }

    const bySeries = new Map<string, OrthancInstance[]>();
    for (const instance of instances) {
      const list = bySeries.get(instance.parentSeries) ?? [];
      list.push(instance);
      bySeries.set(instance.parentSeries, list);
    }

    const views = series
      .map((item): DicomSeriesView => {
        const sorted = sortInstancesByPosition(bySeries.get(item.id) ?? []);
        return {
          description: item.description,
          id: item.id,
          instances: sorted.map((instance) => ({
            frames: instance.numberOfFrames,
            id: instance.id,
            instanceNumber: instance.instanceNumber,
            multiFrame: instance.numberOfFrames > 1,
            sopInstanceUid: instance.sopInstanceUid,
          })),
          instancesCount: sorted.length,
          modality: item.modality,
          number: item.number,
          seriesInstanceUid: item.seriesInstanceUid,
        };
      })
      .sort(
        (a, b) =>
          (a.number ?? Number.POSITIVE_INFINITY) -
            (b.number ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id),
      );

    return { ...toDicomStudyView(row), series: views };
  }

  // The PNG of a slice, for a study of the caller's workspace only.
  async renderInstance(
    user: AuthenticatedUserPayload,
    orthancInstanceId: string,
    options: RenderOptions = {},
  ): Promise<Buffer> {
    await this.getInstanceInScope(user, orthancInstanceId);
    try {
      return await this.orthanc.getInstanceRendered(orthancInstanceId, options);
    } catch (error) {
      throw fromOrthancError(error);
    }
  }

  // Deletes the row; the study in Orthanc too, unless another row (another
  // workspace) still refers to it. Documents and analyses made from its slices
  // are untouched. Orthanc first: if it does not answer, nothing has changed
  // and the call can be repeated (an unknown study counts as deleted).
  async remove(user: AuthenticatedUserPayload, id: string): Promise<void> {
    const row = await this.getStudyInScope(user, id);

    const others = await this.prisma.dicomStudy.count({
      where: { id: { not: row.id }, orthancStudyId: row.orthancStudyId },
    });
    if (others === 0) {
      try {
        await this.orthanc.deleteStudy(row.orthancStudyId);
      } catch (error) {
        throw fromOrthancError(error);
      }
    }

    await this.prisma.dicomStudy.delete({ where: { id: row.id } });
    await this.audit.log(user, 'DICOM_STUDY_DELETED', row.id, {
      orthancDeleted: others === 0,
      patientId: row.patientId,
    });
  }

  // The row of the study an Orthanc instance belongs to, if that study is one
  // of the caller's workspace.
  async getInstanceInScope(
    user: AuthenticatedUserPayload,
    orthancInstanceId: string,
  ): Promise<{ instance: OrthancInstance; study: DicomStudy }> {
    if (!isOrthancId(orthancInstanceId)) {
      throw dicomInstanceNotFound();
    }
    let instance: OrthancInstance;
    try {
      instance = await this.orthanc.getInstance(orthancInstanceId);
    } catch (error) {
      throw fromOrthancError(error);
    }
    if (!instance.parentStudy) {
      throw dicomInstanceNotFound();
    }

    const { workspaceId } = await this.patients.getPatientScope(user);
    const study = await this.prisma.dicomStudy.findFirst({
      where: { orthancStudyId: instance.parentStudy, workspaceId },
    });
    if (!study) {
      throw dicomInstanceNotFound();
    }
    return { instance, study };
  }

  private async getStudyInScope(
    user: AuthenticatedUserPayload,
    id: string,
  ): Promise<DicomStudy> {
    const { workspaceId } = await this.patients.getPatientScope(user);
    const row = await this.prisma.dicomStudy.findFirst({
      where: { id, workspaceId },
    });
    if (!row) {
      throw dicomStudyNotFound();
    }
    return row;
  }
}
