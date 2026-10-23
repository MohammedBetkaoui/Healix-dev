import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import {
  type PrescriberIdentity,
  PrescriptionAuthorizationService,
} from '../prescriptions/prescription-authorization.service';
import {
  type ResolvedWorkspaceContext,
  WorkspaceContextService,
} from '../workspaces/workspace-context.service';
import { reportForbidden } from './report-errors';

export type ReportPermission =
  | 'VIEW'
  | 'CREATE'
  | 'FINALIZE'
  | 'AMEND'
  | 'DOWNLOAD'
  | 'PRINT'
  | 'CANCEL';

export type ReportCapabilities = ReturnType<
  ReportAuthorizationService['capabilities']
>;

export const isPhysicianRole = (role: string) =>
  role === UserRole.INDEPENDENT_DOCTOR || role === UserRole.AFFILIATED_DOCTOR;

// Same model as the prescriptions: the rights come from the role of the
// account (never from the screen), and every report belongs to a workspace.
// Only a physician finalizes, amends or cancels a report; the administration
// of an establishment reads, downloads, prints, imports and drafts.
@Injectable()
export class ReportAuthorizationService {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly prescriberAuthorization: PrescriptionAuthorizationService,
  ) {}

  capabilities(role: string) {
    const physician = isPhysicianRole(role);
    const admin = role === UserRole.ESTABLISHMENT_ADMIN;
    return {
      canViewReports: physician || admin,
      canCreateReports: physician || admin,
      canFinalizeReports: physician,
      canAmendReports: physician,
      canDownloadReports: physician || admin,
      canPrintReports: physician || admin,
      // Internal sharing has no endpoint yet.
      canShareReports: false,
      canCancelReports: physician,
    };
  }

  assertPermission(
    user: AuthenticatedUserPayload,
    permission: ReportPermission,
  ) {
    const capabilities = this.capabilities(user.role);
    const allowed = {
      VIEW: capabilities.canViewReports,
      CREATE: capabilities.canCreateReports,
      FINALIZE: capabilities.canFinalizeReports,
      AMEND: capabilities.canAmendReports,
      DOWNLOAD: capabilities.canDownloadReports,
      PRINT: capabilities.canPrintReports,
      CANCEL: capabilities.canCancelReports,
    }[permission];
    if (!allowed) {
      throw reportForbidden(
        'REPORT_PERMISSION_DENIED',
        "Vous n'êtes pas autorisé à effectuer cette action sur les rapports.",
      );
    }
  }

  async resolveWorkspace(
    user: AuthenticatedUserPayload,
    permission: ReportPermission = 'VIEW',
  ): Promise<ResolvedWorkspaceContext> {
    this.assertPermission(user, permission);
    return this.workspaceContext.resolveWorkspaceForUser({
      userId: user.sub,
      role: user.role,
    });
  }

  /**
   * The physician who finalizes, amends or cancels: verified profile, active
   * subscription and, to finalize, the credentials printed on the report.
   */
  async resolveSigner(
    user: AuthenticatedUserPayload,
    operation: 'FINALIZE' | 'AMEND' | 'CANCEL',
  ): Promise<{
    workspace: ResolvedWorkspaceContext;
    identity: PrescriberIdentity;
  }> {
    this.assertPermission(user, operation);
    return this.prescriberAuthorization.resolvePrescriber(
      user,
      { FINALIZE: 'SIGN', AMEND: 'CREATE', CANCEL: 'CANCEL' }[operation] as
        | 'SIGN'
        | 'CREATE'
        | 'CANCEL',
    );
  }
}
