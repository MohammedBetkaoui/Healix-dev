import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';

// Same pattern as patients/patient-audit.service.ts: a thin per-domain
// wrapper around the shared AuditLogsService. Appointment has no
// sub-resources of its own, so entityType is always "Appointment".
@Injectable()
export class AppointmentAuditService {
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
      entityType: 'Appointment',
      entityId,
      metadata,
    });
  }
}
