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
  PATIENT_AI_ANALYSIS_CREATED: 'PatientAiAnalysis',
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
