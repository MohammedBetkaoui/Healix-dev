import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';

// Generalizes the ad-hoc pattern PatientsService used to write directly to
// AuditLogsService only for duplicate-override creations (see
// logDuplicateOverride). entityType is derived from the action name so
// callers only ever need to pass what actually happened and to what id —
// never a raw entityType string that could drift between call sites.
const entityTypeByAction: Record<string, string> = {
  PATIENT_CREATED: 'Patient',
  PATIENT_CREATED_WITH_DUPLICATE_OVERRIDE: 'Patient',
  PATIENT_UPDATED: 'Patient',
  PATIENT_CONSENT_UPDATED: 'Patient',
  PATIENT_CONSULTATION_CREATED: 'PatientConsultation',
  PATIENT_DOCUMENT_UPLOADED: 'PatientDocument',
  DOCUMENT_VIEWED: 'PatientDocument',
  AI_ANALYSIS_RUN_CREATED: 'AiAnalysisRun',
  AI_ANALYSIS_RUN_COMPLETED: 'AiAnalysisRun',
  AI_ANALYSIS_RUN_DECIDED: 'AiAnalysisRun',
  // The physician changed the measures of a cine volumetry (ED, ES, slices, body
  // surface): the phases and slices only, never a height nor a weight.
  AI_VOLUMETRY_CORRECTED: 'AiAnalysisRun',
  AI_ANALYSIS_REPORT_GENERATED: 'AiAnalysisReport',
  AI_ANALYSIS_REPORT_DOWNLOADED: 'AiAnalysisReport',
  PATIENT_AI_ANALYSIS_CREATED: 'PatientAiAnalysis',
  // Case discussions of the messaging (entityId: the conversation, or the
  // note filed to the record); never the text of a message.
  CASE_CONVERSATION_CREATED: 'Conversation',
  MESSAGES_VIEWED: 'Conversation',
  CASE_NOTE_FILED: 'PatientClinicalNote',
  // DICOM studies of the record (entityId: the DicomStudy; never an image).
  DICOM_STUDY_IMPORTED: 'DicomStudy',
  DICOM_STUDY_DELETED: 'DicomStudy',
  DICOM_STUDY_VIEWED: 'DicomStudy',
};

@Injectable()
export class PatientAuditService {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  log(
    user: AuthenticatedUserPayload,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.auditLogsService.createAuditLog({
      userId: user.sub,
      action,
      entityType: entityTypeByAction[action] ?? 'Patient',
      entityId,
      metadata,
    });
  }
}
