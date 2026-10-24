import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { open, readFile } from 'node:fs/promises';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DicomZipRefusal,
  dicomNoValidFile,
  dicomUploadInvalid,
  dicomZipUnsafe,
  fromOrthancError,
} from './dicom-errors';
import {
  compareIdentity,
  type IdentityWarning,
  type RecordPatient,
} from './dicom-identity';
import {
  type DicomImportResult,
  type DicomImportWarning,
  toDicomStudyView,
} from './dicom-study-view';
import {
  DICOM_IMPORT_LIMITS,
  DicomZip,
  ZIP_SIGNATURE,
  type DicomImportLimits,
} from './dicom-zip';
import { OrthancClient, OrthancError } from './orthanc.client';

// A file received by the upload route (multer, on disk).
export type UploadedDicomFile = {
  originalname: string;
  path: string;
  size: number;
};

// A DICOM file (part 10) starts with 128 free bytes, then "DICM".
const PREAMBLE_BYTES = 128;
const MAGIC = 'DICM';
const HEAD_BYTES = PREAMBLE_BYTES + MAGIC.length;

export function hasDicomMagic(head: Buffer): boolean {
  return (
    head.length >= HEAD_BYTES &&
    head.toString('latin1', PREAMBLE_BYTES, HEAD_BYTES) === MAGIC
  );
}

// "YYYYMMDD" (DICOM date) to a date, or null.
function parseDicomDate(value: string | null): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.getUTCFullYear() === +match[1] &&
    date.getUTCMonth() === +match[2] - 1
    ? date
    : null;
}

type ImportedGroup = { sent: number };

@Injectable()
export class DicomImportService {
  private readonly logger = new Logger(DicomImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orthanc: OrthancClient,
    private readonly patients: PatientsService,
    private readonly audit: PatientAuditService,
  ) {}

  // Imports .dcm files, or one ZIP, into the record of a patient:
  //  - every file must carry "DICM" at byte 128, else it is skipped (counted);
  //  - the valid ones go to Orthanc one by one;
  //  - one DicomStudy per study Orthanc reports (a ZIP may hold several);
  //  - the DICOM identity is compared with the patient's: a difference is a
  //    warning stored with the study, never a refusal.
  // A ZIP that is unsafe (see DicomZip) is refused whole, before anything is
  // sent. If Orthanc fails half way, the studies this import created in it
  // (and that no row references) are removed again.
  async import(
    user: AuthenticatedUserPayload,
    patientId: string,
    files: UploadedDicomFile[],
    limits: DicomImportLimits = DICOM_IMPORT_LIMITS,
  ): Promise<DicomImportResult> {
    const patient = await this.patients.getPatientInScope(user, patientId);
    const { workspaceId } = await this.patients.getPatientScope(user);

    const zip = await this.checkUpload(files, limits);

    const groups = new Map<string, ImportedGroup>();
    let imported = 0;
    let skipped = 0;
    const send = async (content: Buffer | null) => {
      if (content === null || !hasDicomMagic(content)) {
        skipped += 1;
        return;
      }
      try {
        const stored = await this.orthanc.uploadInstance(content);
        imported += 1;
        const group = groups.get(stored.parentStudy) ?? { sent: 0 };
        group.sent += 1;
        groups.set(stored.parentStudy, group);
      } catch (error) {
        // A file with the right preamble that Orthanc cannot read.
        if (error instanceof OrthancError && error.kind === 'REJECTED') {
          skipped += 1;
          return;
        }
        throw error;
      }
    };

    try {
      if (zip) {
        const archive = await DicomZip.open(zip.path, limits);
        try {
          for (const member of archive.members) {
            await send(await archive.read(member));
          }
        } finally {
          archive.close();
        }
      } else {
        for (const file of files) {
          await send(await this.readDicomFile(file, limits));
        }
      }
    } catch (error) {
      await this.removeUnreferenced([...groups.keys()]);
      if (error instanceof DicomZipRefusal) {
        throw dicomZipUnsafe(error.reason);
      }
      throw fromOrthancError(error);
    }

    if (imported === 0) {
      throw dicomNoValidFile(skipped);
    }

    const studies: DicomImportResult['studies'] = [];
    const warnings: DicomImportWarning[] = [];
    try {
      for (const [orthancStudyId, group] of groups) {
        const outcome = await this.register(
          user,
          { patient, workspaceId },
          orthancStudyId,
          group,
        );
        if (outcome.kind === 'ELSEWHERE') {
          warnings.push({
            code: 'STUDY_ATTACHED_TO_ANOTHER_PATIENT',
            studyInstanceUid: outcome.studyInstanceUid,
          });
          continue;
        }
        studies.push(toDicomStudyView(outcome.row));
        if (outcome.identity.length > 0) {
          warnings.push({
            code: 'IDENTITY_MISMATCH',
            fields: outcome.identity.map((warning) => warning.field),
            studyInstanceUid: outcome.row.studyInstanceUid,
          });
        }
      }
    } catch (error) {
      await this.removeUnreferenced([...groups.keys()]);
      throw fromOrthancError(error);
    }

    return { imported, skipped, studies, warnings };
  }

  // The upload as a whole: its size, and what it is made of. Returns the ZIP
  // when it is one.
  private async checkUpload(
    files: UploadedDicomFile[],
    limits: DicomImportLimits,
  ): Promise<UploadedDicomFile | null> {
    if (files.length === 0) {
      throw dicomUploadInvalid('Aucun fichier reçu.');
    }
    if (files.length > limits.maxFiles) {
      throw dicomUploadInvalid(
        `Trop de fichiers : ${limits.maxFiles} au plus par import.`,
      );
    }
    if (
      files.reduce((sum, file) => sum + file.size, 0) > limits.maxUploadBytes
    ) {
      throw new PayloadTooLargeException('Import trop volumineux.');
    }

    const zips = files.filter((file) => /\.zip$/i.test(file.originalname));
    if (zips.length === 0) {
      return null;
    }
    if (zips.length > 1 || files.length > 1) {
      throw dicomUploadInvalid(
        'Envoyez des fichiers .dcm, ou une seule archive .zip.',
      );
    }
    const head = await this.readHead(zips[0], ZIP_SIGNATURE.length);
    if (!head.equals(ZIP_SIGNATURE)) {
      throw dicomZipUnsafe('CORRUPT');
    }
    return zips[0];
  }

  private async readHead(
    file: UploadedDicomFile,
    length: number,
  ): Promise<Buffer> {
    const handle = await open(file.path, 'r');
    try {
      const head = Buffer.alloc(length);
      const { bytesRead } = await handle.read(head, 0, length, 0);
      return head.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  // The whole file, once its first bytes have the DICOM magic: a file that
  // does not is not read further. A nested ZIP renamed .dcm has no magic.
  private async readDicomFile(
    file: UploadedDicomFile,
    limits: DicomImportLimits,
  ): Promise<Buffer | null> {
    if (file.size > limits.maxInstanceBytes) {
      return null;
    }
    if (!hasDicomMagic(await this.readHead(file, HEAD_BYTES))) {
      return null;
    }
    return readFile(file.path);
  }

  // One study Orthanc holds becomes (or updates) the row of the workspace.
  private async register(
    user: AuthenticatedUserPayload,
    context: {
      patient: RecordPatient & { id: string };
      workspaceId: string;
    },
    orthancStudyId: string,
    group: ImportedGroup,
  ) {
    const { patient, workspaceId } = context;
    const [study, statistics, series] = await Promise.all([
      this.orthanc.getStudy(orthancStudyId),
      this.orthanc.getStudyStatistics(orthancStudyId),
      this.orthanc.getStudySeries(orthancStudyId),
    ]);

    const identity: IdentityWarning[] = compareIdentity(patient, {
      patientBirthDate: study.patientBirthDate,
      patientName: study.patientName,
      patientSex: study.patientSex,
    });
    const data = {
      identityWarnings: identity as unknown as Prisma.InputJsonValue,
      instancesCount: statistics.countInstances,
      modalities: [
        ...new Set(series.map((item) => item.modality).filter(Boolean)),
      ].sort() as string[],
      orthancStudyId,
      seriesCount: statistics.countSeries,
      sizeBytes: BigInt(statistics.diskSize),
      studyDate: parseDicomDate(study.studyDate),
      studyDescription: study.studyDescription?.slice(0, 255) ?? null,
    };

    const key = {
      workspaceId_studyInstanceUid: {
        studyInstanceUid: study.studyInstanceUid,
        workspaceId,
      },
    };
    const existing = await this.prisma.dicomStudy.findUnique({ where: key });
    if (existing && existing.patientId !== patient.id) {
      return {
        kind: 'ELSEWHERE' as const,
        studyInstanceUid: study.studyInstanceUid,
      };
    }

    const row = existing
      ? await this.prisma.dicomStudy.update({
          data,
          where: { id: existing.id },
        })
      : await this.create(
          key,
          {
            ...data,
            patientId: patient.id,
            studyInstanceUid: study.studyInstanceUid,
            uploadedById: user.sub,
            workspaceId,
          },
          data,
        );

    await this.audit.log(user, 'DICOM_STUDY_IMPORTED', row.id, {
      identityWarnings: identity.length,
      instancesCount: row.instancesCount,
      instancesSent: group.sent,
      patientId: patient.id,
      seriesCount: row.seriesCount,
    });

    return { identity, kind: 'IMPORTED' as const, row };
  }

  // Two imports of the same study at once: the second finds the row of the
  // first (unique workspace + study) and updates it.
  private async create(
    key: Prisma.DicomStudyWhereUniqueInput,
    data: Prisma.DicomStudyUncheckedCreateInput,
    update: Prisma.DicomStudyUncheckedUpdateInput,
  ) {
    try {
      return await this.prisma.dicomStudy.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.dicomStudy.update({ data: update, where: key });
      }
      throw error;
    }
  }

  // The studies Orthanc holds that no row refers to: nobody could ever see or
  // delete them. Best effort, after a failed import.
  private async removeUnreferenced(orthancStudyIds: string[]): Promise<void> {
    for (const orthancStudyId of orthancStudyIds) {
      try {
        const references = await this.prisma.dicomStudy.count({
          where: { orthancStudyId },
        });
        if (references === 0) {
          await this.orthanc.deleteStudy(orthancStudyId);
        }
      } catch (error) {
        this.logger.warn(
          `Could not remove an unreferenced Orthanc study: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }
}
